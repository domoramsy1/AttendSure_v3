"""
AttendSure - Weekday Schedule Filtering, Cutting-Class Detection & Adviser Matrix Tests
Run: python manage.py test apps.attendance.tests --verbosity=2
"""

from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import TeacherProfile, UserProfile
from apps.attendance.loafing_detector import detect_daily_student_loafing
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.attendance.selectors import get_adviser_matrix
from apps.attendance.services import record_student_qr_scan
from apps.campus.models import LoafingIncident
from common.qr_signer import sign_student_qr
from apps.school.models import (
    ClassPeriod,
    GradeLevel,
    SchoolYear,
    Section,
    Subject,
    expand_schedule_days,
    period_runs_on_weekday,
)
from apps.school.serializers import ClassPeriodSerializer
from apps.students.models import Enrollment, Student

User = get_user_model()


class WeekdayScheduleFilteringTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.adviser_user = User.objects.create_user(
            username="sched_adviser",
            password="AttendSure2026!",
            first_name="Clara",
            last_name="Reyes",
        )
        UserProfile.objects.create(user=self.adviser_user, role="TEACHER")
        self.adviser = TeacherProfile.objects.create(
            user=self.adviser_user,
            employee_id="EMP-SCHED-01",
            can_handle_classes=True,
        )

        self.sy = SchoolYear.objects.create(
            name="2026-2027",
            start_date=date(2026, 6, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        self.grade = GradeLevel.objects.create(level_number=8, code="G8", name="Grade 8")
        self.section = Section.objects.create(
            school_year=self.sy,
            grade_level=self.grade,
            name="Rizal",
            adviser=self.adviser,
        )

        self.subj_math = Subject.objects.create(code="MATH8", title="Mathematics 8", grade_level=self.grade)
        self.subj_sci = Subject.objects.create(code="SCI8", title="Science 8", grade_level=self.grade)
        self.subj_pe = Subject.objects.create(code="PE8", title="Physical Education 8", grade_level=self.grade)
        self.subj_tle = Subject.objects.create(code="TLE8", title="Technology & Livelihood 8", grade_level=self.grade)

        self.student = Student.objects.create(
            lrn="127901269501",
            first_name="Mateo",
            last_name="Villanueva",
            gender="Male",
            birth_date=date(2012, 8, 12),
            is_active=True,
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            section=self.section,
            status="ENROLLED",
        )

    def test_expand_schedule_days_and_weekday_matching(self):
        self.assertEqual(expand_schedule_days("ALL_WEEKDAYS"), {1, 2, 3, 4, 5})
        self.assertEqual(expand_schedule_days("MWF"), {1, 3, 5})
        self.assertEqual(expand_schedule_days("TTH"), {2, 4})
        for day_num in range(1, 8):
            self.assertEqual(expand_schedule_days(str(day_num)), {day_num})

        monday = date(2026, 11, 23)  # ISO weekday 1
        tuesday = date(2026, 11, 24)  # ISO weekday 2
        saturday = date(2026, 11, 28)  # ISO weekday 6

        self.assertTrue(period_runs_on_weekday("MWF", monday.isoweekday()))
        self.assertFalse(period_runs_on_weekday("MWF", tuesday.isoweekday()))
        self.assertTrue(period_runs_on_weekday("TTH", tuesday.isoweekday()))
        self.assertFalse(period_runs_on_weekday("TTH", monday.isoweekday()))
        self.assertFalse(period_runs_on_weekday("ALL_WEEKDAYS", saturday.isoweekday()))
        self.assertTrue(period_runs_on_weekday("6", saturday.isoweekday()))

    def test_class_period_serializer_allows_same_time_on_different_weekdays_and_blocks_overlap(self):
        ClassPeriod.objects.create(
            schedule_code="MWF-AM",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="MWF",
            start_time=time(8, 0),
            end_time=time(9, 0),
            is_active=True,
        )

        # Same time on TTH has zero weekday overlap -> valid
        tth_serializer = ClassPeriodSerializer(
            data={
                "schedule_code": "TTH-AM",
                "section": self.section.id,
                "subject": self.subj_pe.id,
                "teacher": self.adviser.id,
                "day_of_week": "TTH",
                "start_time": "08:00:00",
                "end_time": "09:00:00",
                "is_active": True,
            }
        )
        self.assertTrue(tth_serializer.is_valid(), tth_serializer.errors)

        # Overlapping time on Monday ("1") intersects MWF -> rejected
        mon_conflict = ClassPeriodSerializer(
            data={
                "schedule_code": "MON-CONFLICT",
                "section": self.section.id,
                "subject": self.subj_sci.id,
                "teacher": self.adviser.id,
                "day_of_week": "1",
                "start_time": "08:30:00",
                "end_time": "09:30:00",
                "is_active": True,
            }
        )
        self.assertFalse(mon_conflict.is_valid())

    def test_mwf_morning_present_not_flagged_for_tth_afternoon_class(self):
        mwf_morning = ClassPeriod.objects.create(
            schedule_code="MWF-M1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="MWF",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        tth_afternoon = ClassPeriod.objects.create(
            schedule_code="TTH-PM",
            section=self.section,
            subject=self.subj_pe,
            teacher=self.adviser,
            day_of_week="TTH",
            start_time=time(13, 30),
            end_time=time(14, 30),
            is_active=True,
        )

        # Monday, Wednesday, and Friday dates in the same week
        for mwf_date in (date(2026, 11, 23), date(2026, 11, 25), date(2026, 11, 27)):
            scanned_dt = timezone.make_aware(datetime.combine(mwf_date, time(7, 35)))
            ClassAttendance.objects.create(
                enrollment=self.enrollment,
                class_period=mwf_morning,
                attendance_date=mwf_date,
                scanned_at=scanned_dt,
                status="PRESENT",
                recorded_by=self.adviser,
            )
            DailyAttendance.objects.create(
                enrollment=self.enrollment,
                attendance_date=mwf_date,
                time_in=time(7, 35),
                status="PRESENT",
                recorded_by=self.adviser,
            )

            result = detect_daily_student_loafing(
                target_date=mwf_date,
                section_id=self.section.id,
                user=self.adviser_user,
                force_all_periods=True,
            )
            self.assertEqual(result["created_cutting_incidents"], 0)

        self.assertFalse(
            LoafingIncident.objects.filter(
                incident_type="STUDENT_CUTTING_CLASS",
                enrollment=self.enrollment,
                class_period=tth_afternoon,
            ).exists()
        )
        self.assertEqual(LoafingIncident.objects.filter(incident_type="STUDENT_CUTTING_CLASS").count(), 0)

    def test_present_in_period1_missing_scheduled_period2_flags_cutting_only_for_matching_day(self):
        mwf_period1 = ClassPeriod.objects.create(
            schedule_code="MWF-P1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="MWF",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        mwf_period2 = ClassPeriod.objects.create(
            schedule_code="MWF-P2",
            section=self.section,
            subject=self.subj_sci,
            teacher=self.adviser,
            day_of_week="MWF",
            start_time=time(8, 30),
            end_time=time(9, 30),
            is_active=True,
        )
        tth_afternoon = ClassPeriod.objects.create(
            schedule_code="TTH-PM2",
            section=self.section,
            subject=self.subj_pe,
            teacher=self.adviser,
            day_of_week="TTH",
            start_time=time(13, 30),
            end_time=time(14, 30),
            is_active=True,
        )

        monday = date(2026, 11, 23)
        scanned_dt = timezone.make_aware(datetime.combine(monday, time(7, 35)))
        ClassAttendance.objects.create(
            enrollment=self.enrollment,
            class_period=mwf_period1,
            attendance_date=monday,
            scanned_at=scanned_dt,
            status="PRESENT",
            recorded_by=self.adviser,
        )
        DailyAttendance.objects.create(
            enrollment=self.enrollment,
            attendance_date=monday,
            time_in=time(7, 35),
            status="PRESENT",
            recorded_by=self.adviser,
        )

        result = detect_daily_student_loafing(
            target_date=monday,
            section_id=self.section.id,
            user=self.adviser_user,
        )
        self.assertEqual(result["created_cutting_incidents"], 1)
        self.assertTrue(
            LoafingIncident.objects.filter(
                incident_type="STUDENT_CUTTING_CLASS",
                enrollment=self.enrollment,
                class_period=mwf_period2,
            ).exists()
        )
        self.assertFalse(
            LoafingIncident.objects.filter(
                incident_type="STUDENT_CUTTING_CLASS",
                enrollment=self.enrollment,
                class_period=tth_afternoon,
            ).exists()
        )

        # Verify an active exit pass prevents a cutting alert on another MWF day
        wednesday = date(2026, 11, 25)
        wed_scan_dt = timezone.make_aware(datetime.combine(wednesday, time(7, 35)))
        ClassAttendance.objects.create(
            enrollment=self.enrollment,
            class_period=mwf_period1,
            attendance_date=wednesday,
            scanned_at=wed_scan_dt,
            status="PRESENT",
            recorded_by=self.adviser,
        )
        DailyAttendance.objects.create(
            enrollment=self.enrollment,
            attendance_date=wednesday,
            time_in=time(7, 35),
            status="PRESENT",
            recorded_by=self.adviser,
        )
        ExitPass.objects.create(
            pass_number="EP-CLINIC-WED",
            pass_scope="STUDENT",
            enrollment=self.enrollment,
            reason="School clinic checkup",
            destination="School Clinic",
            issued_by=self.adviser_user,
            issued_at=timezone.make_aware(datetime.combine(wednesday, time(8, 20))),
            valid_until=timezone.make_aware(datetime.combine(wednesday, time(9, 45))),
        )
        wed_result = detect_daily_student_loafing(
            target_date=wednesday,
            section_id=self.section.id,
            user=self.adviser_user,
        )
        self.assertEqual(wed_result["created_cutting_incidents"], 0)

    def test_get_adviser_matrix_filters_subjects_by_target_date_weekday(self):
        ClassPeriod.objects.create(
            schedule_code="MAT-MWF-1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="MWF",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        ClassPeriod.objects.create(
            schedule_code="MAT-MWF-2",
            section=self.section,
            subject=self.subj_sci,
            teacher=self.adviser,
            day_of_week="MWF",
            start_time=time(8, 30),
            end_time=time(9, 30),
            is_active=True,
        )
        ClassPeriod.objects.create(
            schedule_code="MAT-TTH-1",
            section=self.section,
            subject=self.subj_pe,
            teacher=self.adviser,
            day_of_week="TTH",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        ClassPeriod.objects.create(
            schedule_code="MAT-TTH-2",
            section=self.section,
            subject=self.subj_tle,
            teacher=self.adviser,
            day_of_week="TTH",
            start_time=time(8, 30),
            end_time=time(9, 30),
            is_active=True,
        )

        monday = date(2026, 11, 23)
        tuesday = date(2026, 11, 24)
        saturday = date(2026, 11, 28)

        mon_data = get_adviser_matrix(
            user=self.adviser_user,
            section_id=self.section.id,
            target_date=monday,
        )
        self.assertEqual([s["subject_code"] for s in mon_data["schedules"]], ["MATH8", "SCI8"])
        self.assertEqual(len(mon_data["matrix"]), 1)
        self.assertEqual([c["subject_code"] for c in mon_data["matrix"][0]["subjects"]], ["MATH8", "SCI8"])
        self.assertEqual(mon_data["matrix"][0]["total_subjects"], 2)

        tue_data = get_adviser_matrix(
            user=self.adviser_user,
            section_id=self.section.id,
            target_date=tuesday,
        )
        self.assertEqual([s["subject_code"] for s in tue_data["schedules"]], ["PE8", "TLE8"])
        self.assertEqual([c["subject_code"] for c in tue_data["matrix"][0]["subjects"]], ["PE8", "TLE8"])
        self.assertEqual(tue_data["matrix"][0]["total_subjects"], 2)

        sat_data = get_adviser_matrix(
            user=self.adviser_user,
            section_id=self.section.id,
            target_date=saturday,
        )
        self.assertEqual(sat_data["schedules"], [])
        self.assertEqual(sat_data["matrix"][0]["total_subjects"], 0)

        # Also verify the API endpoint supports ?date=YYYY-MM-DD
        self.client.force_authenticate(user=self.adviser_user)
        mon_resp = self.client.get(
            f"/api/v1/attendance/adviser-matrix/?section_id={self.section.id}&date={monday.isoformat()}"
        )
        self.assertEqual(mon_resp.status_code, 200)
        self.assertEqual([s["subject_code"] for s in mon_resp.data["schedules"]], ["MATH8", "SCI8"])

        tue_resp = self.client.get(
            f"/api/v1/attendance/adviser-matrix/?section_id={self.section.id}&date={tuesday.isoformat()}"
        )
        self.assertEqual(tue_resp.status_code, 200)
        self.assertEqual([s["subject_code"] for s in tue_resp.data["schedules"]], ["PE8", "TLE8"])

    def test_student_qr_scan_missed_earlier_periods_respects_day_of_week(self):
        ClassPeriod.objects.create(
            schedule_code="SCAN-TTH-EARLY",
            section=self.section,
            subject=self.subj_pe,
            teacher=self.adviser,
            day_of_week="TTH",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        mwf_early = ClassPeriod.objects.create(
            schedule_code="SCAN-MWF-EARLY",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="MWF",
            start_time=time(8, 30),
            end_time=time(9, 30),
            is_active=True,
        )
        mwf_late = ClassPeriod.objects.create(
            schedule_code="SCAN-MWF-LATE",
            section=self.section,
            subject=self.subj_sci,
            teacher=self.adviser,
            day_of_week="MWF",
            start_time=time(10, 0),
            end_time=time(11, 0),
            is_active=True,
        )

        monday = date(2026, 11, 23)  # ISO weekday 1 (Monday)
        monday_scan_dt = timezone.make_aware(
            datetime.combine(monday, time(10, 5)), timezone.get_current_timezone()
        )
        raw_qr = sign_student_qr(self.student.lrn, self.student.qr_token)

        # Student attended the earlier MWF period; the earlier TTH period must NOT count as missed on Monday.
        ClassAttendance.objects.create(
            enrollment=self.enrollment,
            class_period=mwf_early,
            attendance_date=monday,
            scanned_at=timezone.make_aware(
                datetime.combine(monday, time(8, 35)), timezone.get_current_timezone()
            ),
            status="PRESENT",
            recorded_by=self.adviser,
        )
        with patch("apps.attendance.services.timezone.now", return_value=monday_scan_dt):
            scan_ok = record_student_qr_scan(
                user=self.adviser_user,
                raw_qr=raw_qr,
                period_id=mwf_late.id,
            )
        self.assertEqual(scan_ok["attendance_note"], "")

        # When the earlier MWF period was actually missed, count only that 1 Monday period (ignore TTH).
        ClassAttendance.objects.filter(enrollment=self.enrollment, attendance_date=monday).delete()
        DailyAttendance.objects.filter(enrollment=self.enrollment, attendance_date=monday).delete()
        with patch("apps.attendance.services.timezone.now", return_value=monday_scan_dt):
            scan_missed = record_student_qr_scan(
                user=self.adviser_user,
                raw_qr=raw_qr,
                period_id=mwf_late.id,
            )
        self.assertEqual(
            scan_missed["attendance_note"],
            "Cutting class check: missed 1 earlier class period(s) today.",
        )

    def test_assigned_classes_include_day_of_week_in_summary_and_full_payloads(self):
        mwf_period = ClassPeriod.objects.create(
            schedule_code="SUM-MWF-1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="MWF",
            start_time=time(8, 0),
            end_time=time(9, 0),
            is_active=True,
        )
        tth_period = ClassPeriod.objects.create(
            schedule_code="SUM-TTH-1",
            section=self.section,
            subject=self.subj_pe,
            teacher=self.adviser,
            day_of_week="TTH",
            start_time=time(9, 0),
            end_time=time(10, 0),
            is_active=True,
        )

        self.client.force_authenticate(user=self.adviser_user)

        summary_resp = self.client.get("/api/v1/attendance/classes/?summary=1")
        self.assertEqual(summary_resp.status_code, 200)
        summary_days = {item["id"]: item.get("day_of_week") for item in summary_resp.data}
        self.assertEqual(summary_days.get(mwf_period.id), "MWF")
        self.assertEqual(summary_days.get(tth_period.id), "TTH")

        full_resp = self.client.get("/api/v1/attendance/classes/")
        self.assertEqual(full_resp.status_code, 200)
        full_days = {item["id"]: item.get("day_of_week") for item in full_resp.data}
        self.assertEqual(full_days.get(mwf_period.id), "MWF")
        self.assertEqual(full_days.get(tth_period.id), "TTH")
