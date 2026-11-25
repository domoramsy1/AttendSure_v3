from datetime import date, time
from decimal import Decimal
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AuditLog, Department, PositionTitle, TeacherProfile, UserProfile
from apps.campus.models import CampusBoundary, TeacherDailyAttendance
from apps.school.models import ClassPeriod, GradeLevel, SchoolSettings, SchoolYear, Section, Subject
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
