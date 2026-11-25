# AttendSure Backend - Reports Automated Tests
# File: D:\AttendSure_V3\backend\apps\reports\tests.py

from datetime import date, datetime, time
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AuditLog, Department, PositionTitle, TeacherProfile, UserProfile
from apps.attendance.models import DailyAttendance
from apps.campus.models import CampusBoundary, LoafingIncident, TeacherDailyAttendance, TeacherLocationPing
from apps.reports.selectors import get_monthly_dtr_data
from apps.reports.sf2 import generate_sf2_report
from apps.reports.sf4 import generate_sf4_report
from apps.school.models import ClassPeriod, GradeLevel, SchoolHoliday, SchoolSettings, SchoolYear, Section, Subject
from apps.students.models import Enrollment, Student


class PrintPackApiTests(TestCase):
    """Tests /api/v1/reports/print-pack/ across all 5 modes, formats, RBAC, and security defenses."""

    def setUp(self):
        self.sy = SchoolYear.objects.create(
            name="2026-2027",
            start_date=date(2026, 6, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        self.grade7 = GradeLevel.objects.create(level_number=7, code="G7", name="Grade 7", stage="JHS")
        self.grade8 = GradeLevel.objects.create(level_number=8, code="G8", name="Grade 8", stage="JHS")
        self.dept_math = Department.objects.create(name="Mathematics")
        self.dept_sci = Department.objects.create(name="Science")
        self.pos_t1 = PositionTitle.objects.create(title="Teacher I")
        self.pos_prin = PositionTitle.objects.create(title="School Principal")

        # Admin
        self.admin_user = User.objects.create_user(
            username="print_admin", password="Password!123", first_name="System", last_name="Admin", is_staff=True
        )
        UserProfile.objects.update_or_create(user=self.admin_user, defaults={"role": "ADMIN"})

        # Principal
        self.principal_user = User.objects.create_user(
            username="print_principal", password="Password!123", first_name="Elena", last_name="Santos"
        )
        UserProfile.objects.update_or_create(user=self.principal_user, defaults={"role": "PRINCIPAL"})
        self.principal_profile = TeacherProfile.objects.create(
            user=self.principal_user,
            employee_id="EMP-PRIN-01",
            department=self.dept_math,
            position=self.pos_prin,
            can_handle_classes=False,
        )

        SchoolSettings.objects.create(
            school_id="304199",
            school_name="AttendSure National High School",
            active_school_year=self.sy,
            principal_teacher=self.principal_profile,
        )

        # Teacher A (teaching)
        self.teacher_a_user = User.objects.create_user(
            username="print_teacher_a", password="Password!123", first_name="Maria", last_name="Clara"
        )
        UserProfile.objects.update_or_create(user=self.teacher_a_user, defaults={"role": "TEACHER"})
        self.teacher_a = TeacherProfile.objects.create(
            user=self.teacher_a_user,
            employee_id="EMP-TA-01",
            department=self.dept_math,
            position=self.pos_t1,
            can_handle_classes=True,
        )

        # Teacher B (teaching, separate section)
        self.teacher_b_user = User.objects.create_user(
            username="print_teacher_b", password="Password!123", first_name="Jose", last_name="Rizal"
        )
        UserProfile.objects.update_or_create(user=self.teacher_b_user, defaults={"role": "TEACHER"})
        self.teacher_b = TeacherProfile.objects.create(
            user=self.teacher_b_user,
            employee_id="EMP-TB-02",
            department=self.dept_sci,
            position=self.pos_t1,
            can_handle_classes=True,
        )

        # Non-teaching staff
        self.staff_user = User.objects.create_user(
            username="print_staff", password="Password!123", first_name="Pedro", last_name="Penduko"
        )
        UserProfile.objects.update_or_create(user=self.staff_user, defaults={"role": "TEACHER"})
        self.staff_profile = TeacherProfile.objects.create(
            user=self.staff_user,
            employee_id="EMP-ST-03",
            department=self.dept_math,
            position=self.pos_t1,
            can_handle_classes=False,
        )

        # Sections & Subjects
        self.sec_a = Section.objects.create(
            name="Rizal",
            code="G7-RIZAL",
            school_year=self.sy,
            grade_level=self.grade7,
            adviser=self.teacher_a,
            room_name="Room 101",
        )
        self.sec_b = Section.objects.create(
            name="Bonifacio",
            code="G8-BONI",
            school_year=self.sy,
            grade_level=self.grade8,
            adviser=self.teacher_b,
            room_name="Room 202",
        )
        self.subj_math = Subject.objects.create(
            code="MATH7", title="Mathematics 7 <script>alert(1)</script>", grade_level=self.grade7
        )
        self.subj_sci = Subject.objects.create(code="SCI8", title="Science 8", grade_level=self.grade8)

        self.period_a = ClassPeriod.objects.create(
            schedule_code="G7-MATH7-A",
            section=self.sec_a,
            subject=self.subj_math,
            teacher=self.teacher_a,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(8, 0),
            end_time=time(9, 0),
        )
        self.period_b = ClassPeriod.objects.create(
            schedule_code="G8-SCI8-B",
            section=self.sec_b,
            subject=self.subj_sci,
            teacher=self.teacher_b,
            day_of_week="MWF",
            start_time=time(9, 0),
            end_time=time(10, 0),
        )

        # Students (include CSV formula prefix test + HTML escaping test)
        self.stu_a1 = Student.objects.create(
            lrn="100000000001",
            first_name="=SUM(A1)",
            last_name="Dela Cruz",
            gender="Male",
            birth_date=date(2013, 5, 10),
            guardian_name="|cmd_injection",
            guardian_contact="09171234567",
        )
        self.stu_a2 = Student.objects.create(
            lrn="100000000002",
            first_name="Ana",
            last_name="<b>Lopez</b>",
            gender="Female",
            birth_date=date(2013, 8, 22),
            guardian_name="Rosa Lopez",
            guardian_contact="09181234567",
        )
        self.stu_b1 = Student.objects.create(
            lrn="100000000003",
            first_name="Carlo",
            last_name="Mendoza",
            gender="Male",
            birth_date=date(2012, 3, 14),
            guardian_name="Luis Mendoza",
            guardian_contact="09191234567",
        )
        Enrollment.objects.create(student=self.stu_a1, section=self.sec_a, status="ENROLLED")
        Enrollment.objects.create(student=self.stu_a2, section=self.sec_a, status="ENROLLED")
        Enrollment.objects.create(student=self.stu_b1, section=self.sec_b, status="ENROLLED")

    def _client(self, user: User) -> APIClient:
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def test_admin_can_export_all_five_pack_types_in_json_html_csv(self):
        client = self._client(self.admin_user)
        for pack_type in (
            "CLASS_SCHEDULE",
            "CLASS_LIST",
            "QR_ID_CARDS",
            "TEACHER_DIRECTORY",
            "COMPLETE_TEACHER_PACKET",
        ):
            # JSON via POST
            r_json = client.post(
                "/api/v1/reports/print-pack/",
                {"pack_type": pack_type, "scope": "ALL", "export_format": "json"},
                format="json",
            )
            self.assertEqual(r_json.status_code, 200, f"{pack_type} JSON failed: {r_json.content}")
            self.assertEqual(r_json.data["pack_type"], pack_type)
            self.assertEqual(r_json.data["school"]["school_name"], "AttendSure National High School")

            # HTML via GET with CSP + escaping check
            r_html = client.get(
                f"/api/v1/reports/print-pack/?pack_type={pack_type}&scope=ALL&export_format=html"
            )
            self.assertEqual(r_html.status_code, 200, f"{pack_type} HTML failed")
            self.assertIn("text/html", r_html["Content-Type"])
            self.assertEqual(r_html["X-Content-Type-Options"], "nosniff")
            self.assertIn("default-src 'none'", r_html["Content-Security-Policy"])
            html_body = r_html.content.decode("utf-8")
            self.assertNotIn("<script>alert(1)</script>", html_body)
            self.assertNotIn("<b>Lopez</b>", html_body)

            # CSV via POST with formula sanitization check
            r_csv = client.post(
                "/api/v1/reports/print-pack/",
                {"pack_type": pack_type, "scope": "ALL", "export_format": "csv"},
                format="json",
            )
            self.assertEqual(r_csv.status_code, 200, f"{pack_type} CSV failed")
            self.assertIn("text/csv", r_csv["Content-Type"])
            csv_body = r_csv.content.decode("utf-8")
            if pack_type == "CLASS_LIST":
                self.assertIn("'|cmd_injection", csv_body)

        # Verify AuditLog recorded entries
        self.assertGreaterEqual(
            AuditLog.objects.filter(table_name="deped_reports", performed_by=self.admin_user).count(),
            15,
        )

    def test_principal_can_filter_selected_items(self):
        client = self._client(self.principal_user)

        # Selected student QR ID card only
        res_qr = client.post(
            "/api/v1/reports/print-pack/",
            {
                "pack_type": "QR_ID_CARDS",
                "scope": "SELECTED",
                "student_ids": [self.stu_a2.id],
                "export_format": "json",
            },
            format="json",
        )
        self.assertEqual(res_qr.status_code, 200)
        self.assertEqual(len(res_qr.data["cards"]), 1)
        self.assertEqual(res_qr.data["cards"][0]["lrn"], "100000000002")
        self.assertTrue(res_qr.data["cards"][0]["qr_payload"].startswith("ATTENDSURE:"))

        # Selected teacher schedule only
        res_sched = client.post(
            "/api/v1/reports/print-pack/",
            {
                "pack_type": "CLASS_SCHEDULE",
                "scope": "SELECTED",
                "teacher_ids": [self.teacher_b.id],
                "export_format": "json",
            },
            format="json",
        )
        self.assertEqual(res_sched.status_code, 200)
        self.assertEqual(len(res_sched.data["periods"]), 1)
        self.assertEqual(res_sched.data["periods"][0]["id"], self.period_b.id)

        # Selected without any IDs must return 400
        res_empty = client.post(
            "/api/v1/reports/print-pack/",
            {"pack_type": "CLASS_LIST", "scope": "SELECTED", "export_format": "json"},
            format="json",
        )
        self.assertEqual(res_empty.status_code, 400)

    def test_teacher_own_exports_succeed_and_cross_teacher_requests_return_403(self):
        client_a = self._client(self.teacher_a_user)

        # Teacher A can export own schedule, own class list, own QR cards, and own complete packet
        for pack_type in ("CLASS_SCHEDULE", "CLASS_LIST", "QR_ID_CARDS", "COMPLETE_TEACHER_PACKET"):
            r = client_a.post(
                "/api/v1/reports/print-pack/",
                {"pack_type": pack_type, "scope": "ALL", "export_format": "json"},
                format="json",
            )
            self.assertEqual(r.status_code, 200, f"Teacher A {pack_type} failed: {r.content}")

        # Verify Teacher A only sees own students (never stu_b1)
        r_list = client_a.post(
            "/api/v1/reports/print-pack/",
            {"pack_type": "CLASS_LIST", "scope": "ALL", "export_format": "json"},
            format="json",
        )
        returned_lrns = [
            st["lrn"] for cl in r_list.data["class_lists"] for st in cl["students"]
        ]
        self.assertIn("100000000001", returned_lrns)
        self.assertNotIn("100000000003", returned_lrns)

        # Teacher A requesting Teacher B's teacher_id -> 403
        r_forbid_teacher = client_a.post(
            "/api/v1/reports/print-pack/",
            {
                "pack_type": "CLASS_SCHEDULE",
                "scope": "SELECTED",
                "teacher_ids": [self.teacher_b.id],
                "export_format": "json",
            },
            format="json",
        )
        self.assertEqual(r_forbid_teacher.status_code, 403)

        # Teacher A requesting Teacher B's section_id -> 403
        r_forbid_sec = client_a.post(
            "/api/v1/reports/print-pack/",
            {
                "pack_type": "CLASS_LIST",
                "scope": "SELECTED",
                "section_ids": [self.sec_b.id],
                "export_format": "json",
            },
            format="json",
        )
        self.assertEqual(r_forbid_sec.status_code, 403)

        # Teacher A requesting Teacher B's student_id -> 403
        r_forbid_stu = client_a.post(
            "/api/v1/reports/print-pack/",
            {
                "pack_type": "QR_ID_CARDS",
                "scope": "SELECTED",
                "student_ids": [self.stu_b1.id],
                "export_format": "json",
            },
            format="json",
        )
        self.assertEqual(r_forbid_stu.status_code, 403)

        # Teacher A requesting Teacher B's period_id -> 403
        r_forbid_period = client_a.post(
            "/api/v1/reports/print-pack/",
            {
                "pack_type": "CLASS_SCHEDULE",
                "scope": "SELECTED",
                "period_ids": [self.period_b.id],
                "export_format": "json",
            },
            format="json",
        )
        self.assertEqual(r_forbid_period.status_code, 403)

        # Teacher A requesting TEACHER_DIRECTORY -> 403
        r_forbid_dir = client_a.post(
            "/api/v1/reports/print-pack/",
            {"pack_type": "TEACHER_DIRECTORY", "scope": "ALL", "export_format": "json"},
            format="json",
        )
        self.assertEqual(r_forbid_dir.status_code, 403)

    def test_non_teaching_staff_blocked_from_student_and_directory_packs(self):
        client_staff = self._client(self.staff_user)
        for pack_type in ("CLASS_LIST", "QR_ID_CARDS", "TEACHER_DIRECTORY", "COMPLETE_TEACHER_PACKET"):
            r = client_staff.post(
                "/api/v1/reports/print-pack/",
                {"pack_type": pack_type, "scope": "ALL", "export_format": "json"},
                format="json",
            )
            self.assertEqual(r.status_code, 403, f"Non-teaching {pack_type} should be 403")

        # Invalid ID validation returns 400
        client_admin = self._client(self.admin_user)
        r_bad = client_admin.get("/api/v1/reports/print-pack/?pack_type=CLASS_LIST&section_ids=abc")
        self.assertEqual(r_bad.status_code, 400)

    def test_system_status_returns_canonical_and_compatible_teacher_counts(self):
        cache.clear()
        now = timezone.now()
        boundary = CampusBoundary.objects.create(
            campus_name="Main School Campus",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=150,
            is_active=True,
        )
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            attendance_date=timezone.localdate(),
            time_in=now,
            status="ON_TIME",
        )

        client_admin = self._client(self.admin_user)
        res = client_admin.get("/api/v1/reports/system-status/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["online_teachers_today"], 1)
        self.assertEqual(res.data["online_teachers"], 1)
        self.assertEqual(res.data["teachers_timed_in"], 1)
        self.assertEqual(res.data["active_teachers"], 4)
        self.assertEqual(res.data["total_teachers"], 4)

    def test_monthly_dtr_maps_afternoon_time_out_to_pm_departure_and_calculates_undertime(self):
        tz = timezone.get_current_timezone()
        boundary = CampusBoundary.objects.create(
            campus_name="DTR Campus",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=150,
            duty_start_time=time(7, 30),
            duty_end_time=time(17, 0),
            is_active=True,
        )

        # Nov 2026: 23 = Monday, 24 = Tuesday, 25 = Wednesday
        mon = date(2026, 11, 23)
        tue = date(2026, 11, 24)
        wed = date(2026, 11, 25)

        # Monday: On time 07:30 -> 17:00 (with matching checkout ping at 17:00) => 0 undertime, pm_departure=05:00, pm_arrival=""
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            attendance_date=mon,
            time_in=timezone.make_aware(datetime.combine(mon, time(7, 30)), tz),
            time_out=timezone.make_aware(datetime.combine(mon, time(17, 0)), tz),
            status="ON_TIME",
        )
        TeacherLocationPing.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            latitude=Decimal("8.485800"),
            longitude=Decimal("124.656700"),
            zone_status="INSIDE",
            recorded_at=timezone.make_aware(datetime.combine(mon, time(17, 0)), tz),
        )

        # Tuesday: 45m late (08:15) + 60m early departure (16:00) => 1h 45m undertime
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            attendance_date=tue,
            time_in=timezone.make_aware(datetime.combine(tue, time(8, 15)), tz),
            time_out=timezone.make_aware(datetime.combine(tue, time(16, 0)), tz),
            status="LATE",
        )

        # Wednesday: On time 07:30 + afternoon INSIDE ping at 13:05 + 30m early departure (16:30) => 0h 30m undertime
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            attendance_date=wed,
            time_in=timezone.make_aware(datetime.combine(wed, time(7, 30)), tz),
            time_out=timezone.make_aware(datetime.combine(wed, time(16, 30)), tz),
            status="ON_TIME",
        )
        TeacherLocationPing.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            latitude=Decimal("8.485800"),
            longitude=Decimal("124.656700"),
            zone_status="INSIDE",
            recorded_at=timezone.make_aware(datetime.combine(wed, time(13, 5)), tz),
        )

        dtr = get_monthly_dtr_data(user=self.teacher_a_user, month=11, year=2026)
        self.assertEqual(dtr["days_present"], 3)

        row_mon = next(r for r in dtr["rows"] if r["day"] == 23)
        self.assertEqual(row_mon["am_arrival"], "07:30")
        self.assertEqual(row_mon["pm_arrival"], "")
        self.assertEqual(row_mon["pm_departure"], "05:00")
        self.assertEqual(row_mon["undertime_hours"], "")
        self.assertEqual(row_mon["undertime_minutes"], "")

        row_tue = next(r for r in dtr["rows"] if r["day"] == 24)
        self.assertEqual(row_tue["am_arrival"], "08:15")
        self.assertEqual(row_tue["pm_arrival"], "")
        self.assertEqual(row_tue["pm_departure"], "04:00")
        self.assertEqual(row_tue["undertime_hours"], 1)
        self.assertEqual(row_tue["undertime_minutes"], 45)

        row_wed = next(r for r in dtr["rows"] if r["day"] == 25)
        self.assertEqual(row_wed["am_arrival"], "07:30")
        self.assertEqual(row_wed["pm_arrival"], "01:05")
        self.assertEqual(row_wed["pm_departure"], "04:30")
        self.assertEqual(row_wed["undertime_hours"], 0)
        self.assertEqual(row_wed["undertime_minutes"], 30)

        # Monthly total: 105m + 30m = 135m => 2h 15m
        self.assertEqual(dtr["total_undertime_hours"], 2)
        self.assertEqual(dtr["total_undertime_minutes"], 15)

    def test_dtr_passive_pings_do_not_fabricate_departures_and_undertime_handles_lunch_grace_holiday(self):
        tz = timezone.get_current_timezone()
        boundary = CampusBoundary.objects.create(
            campus_name="CSC DTR Campus",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=150,
            loafing_grace_minutes=10,
            duty_start_time=time(7, 30),
            duty_end_time=time(17, 0),
            is_active=True,
        )

        # Nov 2026: 16=Mon, 17=Tue, 18=Wed, 19=Thu, 20=Fri
        mon = date(2026, 11, 16)
        tue = date(2026, 11, 17)
        wed = date(2026, 11, 18)
        thu = date(2026, 11, 19)
        fri = date(2026, 11, 20)

        # Monday: Timed in at 07:38 (within 10m grace, status=ON_TIME), NOT timed out,
        # with passive INSIDE pings at 08:30, 12:00, 12:30, and 14:15 -> NO fabricated departures,
        # NO 12:00 PM pm_arrival, pm_arrival comes from 14:15 (>= 13:00), and 0 undertime!
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            attendance_date=mon,
            time_in=timezone.make_aware(datetime.combine(mon, time(7, 38)), tz),
            time_out=None,
            status="ON_TIME",
        )
        for ping_t in (time(8, 30), time(12, 0), time(12, 30), time(14, 15), time(15, 0)):
            TeacherLocationPing.objects.create(
                teacher=self.teacher_a,
                boundary=boundary,
                latitude=Decimal("8.485800"),
                longitude=Decimal("124.656700"),
                zone_status="INSIDE",
                recorded_at=timezone.make_aware(datetime.combine(mon, ping_t), tz),
            )

        # Tuesday: Afternoon arrival across noon (13:30 -> 17:00).
        # Raw diff 07:30..13:30 = 6h, minus 1h lunch (12:00-13:00) => 5h 0m undertime!
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            attendance_date=tue,
            time_in=timezone.make_aware(datetime.combine(tue, time(13, 30)), tz),
            time_out=timezone.make_aware(datetime.combine(tue, time(17, 0)), tz),
            status="LATE",
        )

        # Wednesday: Morning early departure across noon (07:30 -> 11:30).
        # Raw diff 11:30..17:00 = 5h 30m, minus 1h lunch (12:00-13:00) => 4h 30m undertime!
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            attendance_date=wed,
            time_in=timezone.make_aware(datetime.combine(wed, time(7, 30)), tz),
            time_out=timezone.make_aware(datetime.combine(wed, time(11, 30)), tz),
            status="ON_TIME",
        )

        # Thursday: Holiday with late log -> undertime must be skipped (0)
        SchoolHoliday.objects.create(
            holiday_date=thu,
            holiday_type="HOLIDAY",
            title="Special Non-Working Holiday",
        )
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            attendance_date=thu,
            time_in=timezone.make_aware(datetime.combine(thu, time(10, 0)), tz),
            time_out=timezone.make_aware(datetime.combine(thu, time(14, 0)), tz),
            status="LATE",
        )

        # Friday: Only 12:15 PM noon ping (no >= 13:00 ping, no checkout) -> pm_arrival must be ""
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            attendance_date=fri,
            time_in=timezone.make_aware(datetime.combine(fri, time(7, 30)), tz),
            time_out=None,
            status="ON_TIME",
        )
        TeacherLocationPing.objects.create(
            teacher=self.teacher_a,
            boundary=boundary,
            latitude=Decimal("8.485800"),
            longitude=Decimal("124.656700"),
            zone_status="INSIDE",
            recorded_at=timezone.make_aware(datetime.combine(fri, time(12, 15)), tz),
        )

        with patch("apps.reports.selectors.timezone.localdate", return_value=mon):
            dtr = get_monthly_dtr_data(user=self.teacher_a_user, month=11, year=2026)

        self.assertTrue(dtr["is_clocked_in_today"])
        self.assertFalse(dtr["has_timed_out_today"])

        row_mon = next(r for r in dtr["rows"] if r["day"] == 16)
        self.assertEqual(row_mon["am_arrival"], "07:38")
        self.assertEqual(row_mon["am_departure"], "")
        self.assertEqual(row_mon["pm_arrival"], "02:15")
        self.assertEqual(row_mon["pm_departure"], "")
        self.assertEqual(row_mon["undertime_hours"], "")
        self.assertEqual(row_mon["undertime_minutes"], "")

        row_tue = next(r for r in dtr["rows"] if r["day"] == 17)
        self.assertEqual(row_tue["pm_arrival"], "01:30")
        self.assertEqual(row_tue["pm_departure"], "05:00")
        self.assertEqual(row_tue["undertime_hours"], 5)
        self.assertEqual(row_tue["undertime_minutes"], 0)

        row_wed = next(r for r in dtr["rows"] if r["day"] == 18)
        self.assertEqual(row_wed["am_arrival"], "07:30")
        self.assertEqual(row_wed["am_departure"], "11:30")
        self.assertEqual(row_wed["pm_departure"], "")
        self.assertEqual(row_wed["undertime_hours"], 4)
        self.assertEqual(row_wed["undertime_minutes"], 30)

        row_thu = next(r for r in dtr["rows"] if r["day"] == 19)
        self.assertEqual(row_thu["undertime_hours"], "")
        self.assertEqual(row_thu["undertime_minutes"], "")

        row_fri = next(r for r in dtr["rows"] if r["day"] == 20)
        self.assertEqual(row_fri["am_arrival"], "07:30")
        self.assertEqual(row_fri["am_departure"], "")
        self.assertEqual(row_fri["pm_arrival"], "")
        self.assertEqual(row_fri["pm_departure"], "")

        # Total undertime: 5h 0m + 4h 30m = 9h 30m
        self.assertEqual(dtr["total_undertime_hours"], 9)
        self.assertEqual(dtr["total_undertime_minutes"], 30)

        # When today is Tuesday (timed out), is_clocked_in_today=False and has_timed_out_today=True
        with patch("apps.reports.selectors.timezone.localdate", return_value=tue):
            dtr_tue = get_monthly_dtr_data(user=self.teacher_a_user, month=11, year=2026)
        self.assertFalse(dtr_tue["is_clocked_in_today"])
        self.assertTrue(dtr_tue["has_timed_out_today"])

    def test_sf2_and_sf4_align_mid_month_with_dropouts_and_mark_cutting_incidents(self):
        tz = timezone.get_current_timezone()
        # Enroll existing section A students after June cutoff to verify percentage_enrolment=None handling
        Enrollment.objects.filter(section=self.sec_a).update(enrolled_date=date(2026, 10, 1))
        enr_a1 = Enrollment.objects.get(student=self.stu_a1, section=self.sec_a)
        enr_a2 = Enrollment.objects.get(student=self.stu_a2, section=self.sec_a)

        # Add a male student who dropped out mid-month (Nov 4, 2026) after attending Nov 2 & 3
        stu_drop = Student.objects.create(
            lrn="100000000099",
            first_name="Marco",
            last_name="Dropped",
            gender="Male",
            birth_date=date(2013, 2, 10),
        )
        enr_drop = Enrollment.objects.create(
            student=stu_drop,
            section=self.sec_a,
            status="DROPPED",
            enrolled_date=date(2026, 10, 1),
            status_date=date(2026, 11, 4),
            remarks="Transferred family residence",
        )

        # Simulate today = Nov 5, 2026 (Thu): elapsed school days in Nov 2026 are Nov 2, 3, 4, 5 (4 days)
        fake_today = date(2026, 11, 5)
        for d in (date(2026, 11, 2), date(2026, 11, 3), date(2026, 11, 4), date(2026, 11, 5)):
            DailyAttendance.objects.create(enrollment=enr_a1, attendance_date=d, status="PRESENT")
            DailyAttendance.objects.create(enrollment=enr_a2, attendance_date=d, status="EXCUSED")
        for d in (date(2026, 11, 2), date(2026, 11, 3)):
            DailyAttendance.objects.create(enrollment=enr_drop, attendance_date=d, status="PRESENT")

        # Cutting class incident on Nov 3 (OPEN -> must mark cell as "cutting")
        LoafingIncident.objects.create(
            incident_type="STUDENT_CUTTING_CLASS",
            status="OPEN",
            enrollment=enr_a1,
            class_period=self.period_a,
            detected_at=timezone.make_aware(datetime.combine(date(2026, 11, 3), time(9, 0)), tz),
            remarks="Cut Period 2",
        )
        # Excused cutting incident on Nov 4 (EXCUSED -> must NOT mark cell as "cutting")
        LoafingIncident.objects.create(
            incident_type="STUDENT_CUTTING_CLASS",
            status="EXCUSED",
            enrollment=enr_a1,
            class_period=self.period_a,
            detected_at=timezone.make_aware(datetime.combine(date(2026, 11, 4), time(9, 0)), tz),
            remarks="Excused by adviser",
        )

        with (
            patch("apps.reports.sf2.timezone.localdate", return_value=fake_today),
            patch("apps.reports.sf4.timezone.localdate", return_value=fake_today),
        ):
            sf2 = generate_sf2_report(section_id=self.sec_a.id, month_name="November", year=2026)
            sf4 = generate_sf4_report(month_name="November", year=2026, school_year=self.sy.name)

        # Elapsed days = 4 (Nov 2, 3, 4, 5), full month school days = 21
        self.assertEqual(sf2["elapsed_school_days_count"], 4)
        self.assertEqual(sf4["elapsed_school_days_count"], 4)
        self.assertEqual(len(sf2["school_days"]), 21)

        # SF2 marks Nov 3 as "cutting" (OPEN) and keeps Nov 4 as "present" (EXCUSED incident ignored)
        male_a1 = next(m for m in sf2["males"] if m["id"] == self.stu_a1.id)
        self.assertEqual(male_a1["attendance"][3], "cutting")
        self.assertEqual(male_a1["attendance"][4], "present")
        self.assertEqual(male_a1["total_tardy"], 1)

        # enrolment_june == 0 -> percentage_enrolment cleanly returns None for m, f, total
        self.assertEqual(sf2["metrics"]["enrolment_june"]["total"], 0)
        self.assertIsNone(sf2["metrics"]["percentage_enrolment"]["m"])
        self.assertIsNone(sf2["metrics"]["percentage_enrolment"]["f"])
        self.assertIsNone(sf2["metrics"]["percentage_enrolment"]["total"])

        # Male attendance days = 4 (enr_a1) + 2 (enr_drop) = 6 / 4 elapsed days = 1.5
        # Female attendance days = 4 (enr_a2 excused) / 4 elapsed days = 1.0
        # Total ADA = 2.5
        self.assertEqual(sf2["metrics"]["average_daily_attendance"], {"m": 1.5, "f": 1.0, "total": 2.5})

        # SF4 section row for sec_a MUST match SF2 identically!
        sf4_sec_a = next(
            sec
            for grp in sf4["grade_groups"]
            for sec in grp["sections"]
            if sec["section_id"] == self.sec_a.id
        )
        self.assertEqual(sf4_sec_a["registered_end"], sf2["metrics"]["registered_end"])
        self.assertEqual(sf4_sec_a["daily_average"], sf2["metrics"]["average_daily_attendance"])
        self.assertEqual(sf4_sec_a["attendance_percentage"], sf2["metrics"]["percentage_attendance"])
        self.assertEqual(sf4_sec_a["dropped_out_month"], sf2["metrics"]["drop_out"])
