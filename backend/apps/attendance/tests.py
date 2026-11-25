# AttendSure Backend - Attendance Automated Tests
# File: D:\AttendSure_V3\backend\apps\attendance\tests.py

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
from apps.attendance.selectors import (
    get_adviser_matrix,
    get_assigned_classes_with_class_lists,
    get_section_class_list,
)
from apps.attendance.services import (
    record_student_qr_scan,
    save_manual_attendance,
    sync_offline_qr_scans,
)
from apps.campus.models import LoafingIncident
from common.qr_signer import sign_student_qr
from common.time_utils import local_day_bounds
from apps.school.models import (
    ClassPeriod,
    GradeLevel,
    SchoolHoliday,
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

    def test_upcoming_class_not_started_is_never_flagged_as_cutting(self):
        period1 = ClassPeriod.objects.create(
            schedule_code="UP-P1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        period2 = ClassPeriod.objects.create(
            schedule_code="UP-P2",
            section=self.section,
            subject=self.subj_sci,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(10, 0),
            end_time=time(11, 0),
            is_active=True,
        )

        monday = date(2026, 11, 23)
        current_tz = timezone.get_current_timezone()
        morning_now = timezone.make_aware(datetime.combine(monday, time(8, 0)), current_tz)

        ClassAttendance.objects.create(
            enrollment=self.enrollment,
            class_period=period1,
            attendance_date=monday,
            scanned_at=timezone.make_aware(datetime.combine(monday, time(7, 35)), current_tz),
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

        with patch("apps.attendance.loafing_detector.timezone.now", return_value=morning_now):
            early_result = detect_daily_student_loafing(
                target_date=monday,
                section_id=self.section.id,
                user=self.adviser_user,
            )
        self.assertEqual(early_result["created_cutting_incidents"], 0)
        self.assertFalse(
            LoafingIncident.objects.filter(
                incident_type="STUDENT_CUTTING_CLASS",
                enrollment=self.enrollment,
                class_period=period2,
            ).exists()
        )

        # Once Period 2 actually starts (10:05 AM), missing it should be flagged.
        after_start_now = timezone.make_aware(datetime.combine(monday, time(10, 5)), current_tz)
        with patch("apps.attendance.loafing_detector.timezone.now", return_value=after_start_now):
            started_result = detect_daily_student_loafing(
                target_date=monday,
                section_id=self.section.id,
                user=self.adviser_user,
            )
        self.assertEqual(started_result["created_cutting_incidents"], 1)

    def test_past_date_cutting_audit_sets_detected_at_within_audit_date_and_is_idempotent(self):
        period1 = ClassPeriod.objects.create(
            schedule_code="PAST-P1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        period2 = ClassPeriod.objects.create(
            schedule_code="PAST-P2",
            section=self.section,
            subject=self.subj_sci,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(8, 30),
            end_time=time(9, 30),
            is_active=True,
        )

        past_monday = date(2026, 11, 23)
        current_tz = timezone.get_current_timezone()
        later_wednesday = timezone.make_aware(
            datetime.combine(date(2026, 11, 25), time(14, 0)), current_tz
        )

        ClassAttendance.objects.create(
            enrollment=self.enrollment,
            class_period=period1,
            attendance_date=past_monday,
            scanned_at=timezone.make_aware(datetime.combine(past_monday, time(7, 35)), current_tz),
            status="PRESENT",
            recorded_by=self.adviser,
        )
        DailyAttendance.objects.create(
            enrollment=self.enrollment,
            attendance_date=past_monday,
            time_in=time(7, 35),
            status="PRESENT",
            recorded_by=self.adviser,
        )

        with patch("apps.attendance.loafing_detector.timezone.now", return_value=later_wednesday):
            first_run = detect_daily_student_loafing(
                target_date=past_monday,
                section_id=self.section.id,
                user=self.adviser_user,
            )
            second_run = detect_daily_student_loafing(
                target_date=past_monday,
                section_id=self.section.id,
                user=self.adviser_user,
            )

        self.assertEqual(first_run["created_cutting_incidents"], 1)
        self.assertEqual(second_run["created_cutting_incidents"], 0)
        incidents = list(
            LoafingIncident.objects.filter(
                incident_type="STUDENT_CUTTING_CLASS",
                enrollment=self.enrollment,
                class_period=period2,
            )
        )
        self.assertEqual(len(incidents), 1)
        day_start, day_end = local_day_bounds(past_monday)
        self.assertGreaterEqual(incidents[0].detected_at, day_start)
        self.assertLess(incidents[0].detected_at, day_end)

    def test_transferred_in_student_treated_as_active_across_attendance_and_student_endpoints(self):
        period1 = ClassPeriod.objects.create(
            schedule_code="TR-P1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        period2 = ClassPeriod.objects.create(
            schedule_code="TR-P2",
            section=self.section,
            subject=self.subj_sci,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(8, 30),
            end_time=time(9, 30),
            is_active=True,
        )

        transferred_student = Student.objects.create(
            lrn="127901269599",
            first_name="Lia",
            last_name="Navarro",
            gender="Female",
            birth_date=date(2012, 5, 20),
            is_active=True,
        )
        Enrollment.objects.create(
            student=transferred_student,
            section=self.section,
            status="TRANSFERRED_IN",
        )

        # 1. Live QR scan works for TRANSFERRED_IN
        raw_qr = sign_student_qr(transferred_student.lrn, transferred_student.qr_token)
        scan_res = record_student_qr_scan(
            user=self.adviser_user,
            raw_qr=raw_qr,
            period_id=period1.id,
        )
        self.assertTrue(scan_res["ok"])
        self.assertEqual(scan_res["student_id"], transferred_student.id)

        # 2. Offline QR sync works for TRANSFERRED_IN
        sync_res = sync_offline_qr_scans(
            user=self.adviser_user,
            raw_scans=[
                {
                    "qr_text": raw_qr,
                    "period_id": period2.id,
                    "scanned_at": timezone.now().isoformat(),
                }
            ],
        )
        self.assertEqual(sync_res["synced_count"], 1)
        self.assertEqual(sync_res["rejected_count"], 0)

        # 3. Manual attendance save works for TRANSFERRED_IN
        manual_log = save_manual_attendance(
            user=self.adviser_user,
            student_id=transferred_student.id,
            status_code="EXCUSED",
            period_id=period2.id,
        )
        self.assertEqual(manual_log.status, "EXCUSED")

        # 4. Class lists, summary counts, and adviser matrix include TRANSFERRED_IN
        summary_classes = get_assigned_classes_with_class_lists(
            user=self.adviser_user, include_students=False
        )
        self.assertEqual(summary_classes[0]["total_students"], 2)

        full_classes = get_assigned_classes_with_class_lists(
            user=self.adviser_user, include_students=True
        )
        full_ids = {s["student_id"] for s in full_classes[0]["students"]}
        self.assertIn(transferred_student.id, full_ids)

        sec_list = get_section_class_list(user=self.adviser_user, section_id=self.section.id)
        self.assertIn(transferred_student.id, {s["student_id"] for s in sec_list})

        matrix = get_adviser_matrix(
            user=self.adviser_user,
            section_id=self.section.id,
            target_date=date(2026, 11, 23),
        )
        self.assertIn(transferred_student.id, {r["student_id"] for r in matrix["matrix"]})

        # 5. Student exit pass creation, section filter, metrics, and QR cards include TRANSFERRED_IN
        self.client.force_authenticate(user=self.adviser_user)
        ep_resp = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "student_id": transferred_student.id,
                "reason": "Clinic checkup",
                "destination": "School Clinic",
            },
            format="json",
        )
        self.assertEqual(ep_resp.status_code, 201, ep_resp.data)

        stu_resp = self.client.get(f"/api/v1/students/?section_id={self.section.id}")
        self.assertEqual(stu_resp.status_code, 200)
        stu_items = stu_resp.data.get("results", stu_resp.data) if isinstance(stu_resp.data, dict) else stu_resp.data
        self.assertIn(transferred_student.id, {s["id"] for s in stu_items})

        metrics_resp = self.client.get("/api/v1/students/metrics/")
        self.assertEqual(metrics_resp.status_code, 200)
        self.assertEqual(metrics_resp.data["enrolled"], 2)
        self.assertEqual(metrics_resp.data["unassigned"], 0)

        qr_resp = self.client.get(f"/api/v1/students/qr-cards/?section_id={self.section.id}")
        self.assertEqual(qr_resp.status_code, 200)
        self.assertIn(transferred_student.id, {c["student_id"] for c in qr_resp.data["cards"]})

    def test_later_period_scan_and_manual_edit_do_not_overwrite_earlier_daily_attendance(self):
        period1 = ClassPeriod.objects.create(
            schedule_code="DA-P1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        period2 = ClassPeriod.objects.create(
            schedule_code="DA-P2",
            section=self.section,
            subject=self.subj_sci,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(8, 30),
            end_time=time(9, 30),
            is_active=True,
        )

        monday = date(2026, 11, 23)
        tz = timezone.get_current_timezone()
        p1_dt = timezone.make_aware(datetime.combine(monday, time(7, 35)), tz)
        p2_late_dt = timezone.make_aware(datetime.combine(monday, time(8, 55)), tz)
        raw_qr = sign_student_qr(self.student.lrn, self.student.qr_token)

        # Period 1 on-time scan sets DailyAttendance time_in=07:35, status=PRESENT
        with patch("apps.attendance.services.timezone.now", return_value=p1_dt):
            r1 = record_student_qr_scan(user=self.adviser_user, raw_qr=raw_qr, period_id=period1.id)
        self.assertEqual(r1["status"], "PRESENT")
        daily = DailyAttendance.objects.get(enrollment=self.enrollment, attendance_date=monday)
        self.assertEqual(daily.time_in, time(7, 35))
        self.assertEqual(daily.status, "PRESENT")

        # Later Period 2 LATE scan must NOT overwrite earlier DailyAttendance time_in or status
        with patch("apps.attendance.services.timezone.now", return_value=p2_late_dt):
            r2 = record_student_qr_scan(user=self.adviser_user, raw_qr=raw_qr, period_id=period2.id)
        self.assertEqual(r2["status"], "LATE")
        daily.refresh_from_db()
        self.assertEqual(daily.time_in, time(7, 35))
        self.assertEqual(daily.status, "PRESENT")

        # Manual edit marking Period 2 ABSENT must NOT overwrite Period 1's earlier presence
        save_manual_attendance(
            user=self.adviser_user,
            student_id=self.student.id,
            status_code="ABSENT",
            period_id=period2.id,
            date_str=monday.isoformat(),
        )
        daily.refresh_from_db()
        self.assertEqual(daily.time_in, time(7, 35))
        self.assertEqual(daily.status, "PRESENT")

        # Manual edit changing Period 1 itself from PRESENT -> LATE keeps 07:35 time_in and updates status
        save_manual_attendance(
            user=self.adviser_user,
            student_id=self.student.id,
            status_code="LATE",
            period_id=period1.id,
            date_str=monday.isoformat(),
        )
        daily.refresh_from_db()
        self.assertEqual(daily.time_in, time(7, 35))
        self.assertEqual(daily.status, "LATE")

        # When all periods become ABSENT, DailyAttendance safely recomputes to ABSENT with time_in=None
        save_manual_attendance(
            user=self.adviser_user,
            student_id=self.student.id,
            status_code="ABSENT",
            period_id=period1.id,
            date_str=monday.isoformat(),
        )
        daily.refresh_from_db()
        self.assertIsNone(daily.time_in)
        self.assertEqual(daily.status, "ABSENT")

        # When one period is EXCUSED and none are PRESENT/LATE, DailyAttendance recomputes to EXCUSED
        save_manual_attendance(
            user=self.adviser_user,
            student_id=self.student.id,
            status_code="EXCUSED",
            period_id=period2.id,
            date_str=monday.isoformat(),
        )
        daily.refresh_from_db()
        self.assertIsNone(daily.time_in)
        self.assertEqual(daily.status, "EXCUSED")

    def test_teaching_teacher_can_edit_valid_until_cancel_and_delete_own_student_exit_pass(self):
        self.client.force_authenticate(user=self.adviser_user)
        now = timezone.now()
        initial_until = (now + timedelta(hours=2)).replace(microsecond=0)
        extended_until = (now + timedelta(hours=4)).replace(microsecond=0)

        # 1. Teaching teacher creates a student exit pass
        create_res = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "pass_scope": "STUDENT",
                "student_id": self.student.id,
                "pass_type": "Clinic / Medical Clearance",
                "destination": "School Clinic",
                "reason": "Mild headache",
                "valid_until": initial_until.isoformat(),
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 201, create_res.data)
        pass_id = create_res.data["id"]
        self.assertEqual(create_res.data["issued_by"], self.adviser_user.id)

        # 2. Teaching teacher edits destination and extends valid_until on own pass
        patch_res = self.client.patch(
            f"/api/v1/attendance/exit-passes/{pass_id}/",
            {
                "destination": "City Health Center",
                "reason": "Follow-up nurse check",
                "valid_until": extended_until.isoformat(),
            },
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200, patch_res.data)
        updated = ExitPass.objects.get(id=pass_id)
        self.assertEqual(updated.destination, "City Health Center")
        self.assertEqual(updated.valid_until.replace(microsecond=0), extended_until)

        # 3. Teaching teacher can cancel own student exit pass
        cancel_res = self.client.post(f"/api/v1/attendance/exit-passes/{pass_id}/cancel/")
        self.assertEqual(cancel_res.status_code, 200, cancel_res.data)
        updated.refresh_from_db()
        self.assertTrue(updated.is_cancelled)

        # 4. Teaching teacher can delete own unreturned student exit pass
        del_res = self.client.delete(f"/api/v1/attendance/exit-passes/{pass_id}/")
        self.assertEqual(del_res.status_code, 204)
        self.assertFalse(ExitPass.objects.filter(id=pass_id).exists())

    def test_adviser_matrix_exit_pass_excused_late_arrival_not_cutting_and_holiday_skip(self):
        period1 = ClassPeriod.objects.create(
            schedule_code="MX-P1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        period2 = ClassPeriod.objects.create(
            schedule_code="MX-P2",
            section=self.section,
            subject=self.subj_sci,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(8, 30),
            end_time=time(9, 30),
            is_active=True,
        )
        period3 = ClassPeriod.objects.create(
            schedule_code="MX-P3",
            section=self.section,
            subject=self.subj_pe,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(9, 30),
            end_time=time(10, 30),
            is_active=True,
        )

        classmate = Student.objects.create(
            lrn="127901269555",
            first_name="Carla",
            last_name="Diaz",
            gender="Female",
            birth_date=date(2012, 6, 15),
            is_active=True,
        )
        classmate_enr = Enrollment.objects.create(
            student=classmate,
            section=self.section,
            status="ENROLLED",
        )

        monday = date(2026, 11, 23)
        tz = timezone.get_current_timezone()

        # Classmate attended Period 1 (so Period 1 is in started_period_ids)
        ClassAttendance.objects.create(
            enrollment=classmate_enr,
            class_period=period1,
            attendance_date=monday,
            scanned_at=timezone.make_aware(datetime.combine(monday, time(7, 35)), tz),
            status="PRESENT",
            recorded_by=self.adviser,
        )
        DailyAttendance.objects.create(
            enrollment=classmate_enr,
            attendance_date=monday,
            time_in=time(7, 35),
            status="PRESENT",
            recorded_by=self.adviser,
        )

        # Target student arrived late at Period 2 (missed Period 1), and has an ExitPass covering Period 3
        ClassAttendance.objects.create(
            enrollment=self.enrollment,
            class_period=period2,
            attendance_date=monday,
            scanned_at=timezone.make_aware(datetime.combine(monday, time(8, 40)), tz),
            status="LATE",
            recorded_by=self.adviser,
        )
        DailyAttendance.objects.create(
            enrollment=self.enrollment,
            attendance_date=monday,
            time_in=time(8, 40),
            status="LATE",
            recorded_by=self.adviser,
        )
        ExitPass.objects.create(
            pass_number="EP-MAT-01",
            pass_scope="STUDENT",
            enrollment=self.enrollment,
            reason="School clinic rest",
            destination="School Clinic",
            issued_by=self.adviser_user,
            issued_at=timezone.make_aware(datetime.combine(monday, time(9, 25)), tz),
            valid_until=timezone.make_aware(datetime.combine(monday, time(10, 45)), tz),
        )

        # 1. Adviser matrix must NOT flag Period 1 as CUTTING and must mark Period 3 as EXCUSED
        matrix_data = get_adviser_matrix(
            user=self.adviser_user,
            section_id=self.section.id,
            target_date=monday,
        )
        student_row = next(r for r in matrix_data["matrix"] if r["student_id"] == self.student.id)
        by_period = {c["schedule_id"]: c["status"] for c in student_row["subjects"]}
        self.assertEqual(by_period[period1.id], "UNSCANNED")
        self.assertEqual(by_period[period2.id], "LATE")
        self.assertEqual(by_period[period3.id], "EXCUSED")
        self.assertEqual(student_row["cutting_count"], 0)
        self.assertEqual(student_row["attended_count"], 2)

        # Even if Period 1 is explicitly marked ABSENT, it must stay ABSENT (not CUTTING)
        ClassAttendance.objects.create(
            enrollment=self.enrollment,
            class_period=period1,
            attendance_date=monday,
            scanned_at=timezone.make_aware(datetime.combine(monday, time(8, 0)), tz),
            status="ABSENT",
            recorded_by=self.adviser,
        )
        matrix_after_absent = get_adviser_matrix(
            user=self.adviser_user,
            section_id=self.section.id,
            target_date=monday,
        )
        student_row2 = next(r for r in matrix_after_absent["matrix"] if r["student_id"] == self.student.id)
        by_period2 = {c["schedule_id"]: c["status"] for c in student_row2["subjects"]}
        self.assertEqual(by_period2[period1.id], "ABSENT")
        self.assertEqual(by_period2[period3.id], "EXCUSED")
        self.assertEqual(student_row2["cutting_count"], 0)

        # 2. Cutting detector must NOT flag Period 1 as cutting for a Period 2 late arrival
        detect_res = detect_daily_student_loafing(
            target_date=monday,
            section_id=self.section.id,
            user=self.adviser_user,
            force_all_periods=True,
        )
        self.assertFalse(
            LoafingIncident.objects.filter(
                incident_type="STUDENT_CUTTING_CLASS",
                enrollment=self.enrollment,
                class_period=period1,
            ).exists()
        )
        self.assertFalse(
            LoafingIncident.objects.filter(
                incident_type="STUDENT_CUTTING_CLASS",
                enrollment=self.enrollment,
                class_period=period3,
            ).exists()
        )
        # Classmate missed Period 2 & Period 3 without an exit pass -> flagged as cutting
        self.assertEqual(detect_res["created_cutting_incidents"], 2)

        # 3. On a SchoolHoliday, cutting detection is skipped and adviser matrix marks zero cutting
        tuesday = date(2026, 11, 24)
        SchoolHoliday.objects.create(
            holiday_date=tuesday,
            holiday_type="HOLIDAY",
            title="Founding Anniversary",
        )
        ClassAttendance.objects.create(
            enrollment=classmate_enr,
            class_period=period1,
            attendance_date=tuesday,
            scanned_at=timezone.make_aware(datetime.combine(tuesday, time(7, 35)), tz),
            status="PRESENT",
            recorded_by=self.adviser,
        )
        hol_detect = detect_daily_student_loafing(
            target_date=tuesday,
            section_id=self.section.id,
            user=self.adviser_user,
            force_all_periods=True,
        )
        self.assertTrue(hol_detect["is_holiday"])
        self.assertEqual(hol_detect["created_cutting_incidents"], 0)

        hol_matrix = get_adviser_matrix(
            user=self.adviser_user,
            section_id=self.section.id,
            target_date=tuesday,
        )
        self.assertTrue(hol_matrix["is_holiday"])
        cm_row = next(r for r in hol_matrix["matrix"] if r["student_id"] == classmate.id)
        self.assertEqual(cm_row["cutting_count"], 0)

    def test_mark_unscanned_students_absent_endpoint_handles_present_excused_and_absent(self):
        period1 = ClassPeriod.objects.create(
            schedule_code="BULK-P1",
            section=self.section,
            subject=self.subj_math,
            teacher=self.adviser,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        stu_excused = Student.objects.create(
            lrn="127901269566",
            first_name="Nadia",
            last_name="Torres",
            gender="Female",
            birth_date=date(2012, 4, 10),
            is_active=True,
        )
        enr_excused = Enrollment.objects.create(
            student=stu_excused,
            section=self.section,
            status="TRANSFERRED_IN",
        )
        stu_absent = Student.objects.create(
            lrn="127901269567",
            first_name="Gino",
            last_name="Salazar",
            gender="Male",
            birth_date=date(2012, 7, 19),
            is_active=True,
        )
        enr_absent = Enrollment.objects.create(
            student=stu_absent,
            section=self.section,
            status="ENROLLED",
        )

        target_day = date(2026, 11, 23)
        tz = timezone.get_current_timezone()

        # Student 1 already scanned PRESENT
        ClassAttendance.objects.create(
            enrollment=self.enrollment,
            class_period=period1,
            attendance_date=target_day,
            scanned_at=timezone.make_aware(datetime.combine(target_day, time(7, 32)), tz),
            status="PRESENT",
            recorded_by=self.adviser,
        )
        # Student 2 has active ExitPass covering Period 1
        ExitPass.objects.create(
            pass_number="EP-BULK-01",
            pass_scope="STUDENT",
            enrollment=enr_excused,
            reason="Dental appointment",
            destination="School Clinic",
            issued_by=self.adviser_user,
            issued_at=timezone.make_aware(datetime.combine(target_day, time(7, 20)), tz),
            valid_until=timezone.make_aware(datetime.combine(target_day, time(9, 0)), tz),
        )

        self.client.force_authenticate(user=self.adviser_user)
        resp = self.client.post(
            "/api/v1/attendance/mark-unscanned-absent/",
            {"period_id": period1.id, "attendance_date": target_day.isoformat()},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["marked_absent_count"], 1)
        self.assertEqual(resp.data["marked_excused_count"], 1)
        self.assertEqual(resp.data["already_recorded_count"], 1)

        self.assertEqual(
            ClassAttendance.objects.get(enrollment=enr_absent, class_period=period1, attendance_date=target_day).status,
            "ABSENT",
        )
        self.assertEqual(
            DailyAttendance.objects.get(enrollment=enr_absent, attendance_date=target_day).status,
            "ABSENT",
        )
        self.assertEqual(
            ClassAttendance.objects.get(enrollment=enr_excused, class_period=period1, attendance_date=target_day).status,
            "EXCUSED",
        )
        self.assertEqual(
            DailyAttendance.objects.get(enrollment=enr_excused, attendance_date=target_day).status,
            "EXCUSED",
        )

    def test_adviser_student_exit_pass_with_hardcopy_proof_clear_and_section_scoping(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        other_section = Section.objects.create(
            school_year=self.sy,
            grade_level=self.grade,
            name="Bonifacio",
        )
        other_student = Student.objects.create(
            lrn="127901269588",
            first_name="Marco",
            last_name="Ramos",
            gender="Male",
            birth_date=date(2012, 9, 14),
            is_active=True,
        )
        Enrollment.objects.create(
            student=other_student,
            section=other_section,
            status="ENROLLED",
        )

        principal_user = User.objects.create_user(
            username="exitpass_principal",
            password="AttendSure2026!",
            first_name="Elena",
            last_name="Principal",
        )
        UserProfile.objects.create(user=principal_user, role="PRINCIPAL")

        valid_until = (timezone.now() + timedelta(hours=3)).isoformat()

        # 1. Class adviser can issue a Student Exit Pass for their advised student WITHOUT proof
        self.client.force_authenticate(user=self.adviser_user)
        no_proof_res = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "pass_scope": "STUDENT",
                "student_id": self.student.id,
                "pass_type": "Parent Pickup",
                "destination": "Home with Mother",
                "reason": "Hardcopy parent excuse letter verified for family checkup",
                "valid_until": valid_until,
            },
            format="json",
        )
        self.assertEqual(no_proof_res.status_code, 201, no_proof_res.data)
        self.assertTrue(no_proof_res.data["is_approved"])
        self.assertEqual(no_proof_res.data["pass_status"], "ACTIVE")

        # 2. Class adviser can attach a PDF scan of the parent's hardcopy excuse letter and clear it on edit
        sample_pdf = SimpleUploadedFile(
            "excuse_letter.pdf",
            b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
            content_type="application/pdf",
        )
        with_proof_res = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "pass_scope": "STUDENT",
                "student_id": self.student.id,
                "pass_type": "Clinic / Medical Clearance",
                "destination": "City Health Clinic",
                "reason": "Signed hardcopy excuse letter from parent",
                "valid_until": valid_until,
                "attachment": sample_pdf,
            },
            format="multipart",
        )
        self.assertEqual(with_proof_res.status_code, 201, with_proof_res.data)
        self.assertTrue(with_proof_res.data["attachment_url"])
        proof_pass_id = with_proof_res.data["id"]

        clear_res = self.client.patch(
            f"/api/v1/attendance/exit-passes/{proof_pass_id}/",
            {"clear_proof": True, "destination": "School Clinic"},
            format="json",
        )
        self.assertEqual(clear_res.status_code, 200, clear_res.data)
        self.assertIsNone(clear_res.data["attachment_url"])

        # 3. Class adviser CANNOT issue an exit pass for an unrelated section -> 403
        unrelated_res = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "pass_scope": "STUDENT",
                "student_id": other_student.id,
                "pass_type": "Parent Pickup",
                "destination": "Home",
                "reason": "Unrelated section test",
                "valid_until": valid_until,
            },
            format="json",
        )
        self.assertEqual(unrelated_res.status_code, 403)

        # 4. School leader CAN issue a Student Exit Pass for any active section
        self.client.force_authenticate(user=principal_user)
        leader_res = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "pass_scope": "STUDENT",
                "student_id": other_student.id,
                "pass_type": "Parent Pickup",
                "destination": "Home",
                "reason": "Verified hardcopy excuse letter at Principal office",
                "valid_until": valid_until,
            },
            format="json",
        )
        self.assertEqual(leader_res.status_code, 201, leader_res.data)
        self.assertTrue(leader_res.data["is_approved"])
        self.assertEqual(leader_res.data["pass_status"], "ACTIVE")
