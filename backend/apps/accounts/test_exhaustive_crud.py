"""
AttendSure - Exhaustive Field-by-Field CRUD, Image Upload Pipeline & 5-Profile RBAC Matrix Test Suite
Run: python manage.py test apps.accounts.test_exhaustive_crud --verbosity=2
"""

import base64
import io
import tempfile
from datetime import date, time, timedelta
from decimal import Decimal

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import Department, PositionTitle, TeacherProfile, UserProfile
from apps.campus.models import CampusBoundary, LoafingIncident
from apps.school.models import (
    AdministrativeDivision,
    Building,
    ClassPeriod,
    GradeLevel,
    Room,
    SchoolSettings,
    SchoolYear,
    Section,
    Subject,
)
from apps.students.models import Enrollment, Student
from common.qr_signer import sign_student_qr

User = get_user_model()


def _make_image_bytes(fmt: str = "PNG", size=(240, 240), color=(0, 75, 135)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format=fmt)
    return buf.getvalue()


def _make_uploaded_image(name: str = "portrait.png", fmt: str = "PNG", size=(240, 240)) -> SimpleUploadedFile:
    content_type = "image/png" if fmt.upper() == "PNG" else "image/jpeg"
    return SimpleUploadedFile(name, _make_image_bytes(fmt=fmt, size=size), content_type=content_type)


def _make_data_uri(fmt: str = "JPEG", size=(300, 300), color=(2, 132, 199)) -> str:
    mime = "image/png" if fmt.upper() == "PNG" else "image/jpeg"
    encoded = base64.b64encode(_make_image_bytes(fmt=fmt, size=size, color=color)).decode("ascii")
    return f"data:{mime};base64,{encoded}"


class ExhaustiveCrudAndRbacTestSuite(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_dir = tempfile.TemporaryDirectory()
        cls._media_override = override_settings(MEDIA_ROOT=cls._media_dir.name)
        cls._media_override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._media_override.disable()
        cls._media_dir.cleanup()
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        self.dept_admin, _ = Department.objects.get_or_create(code="ADMIN", defaults={"name": "Administration"})
        self.dept_math, _ = Department.objects.get_or_create(code="MATH", defaults={"name": "Mathematics"})
        self.pos_admin, _ = PositionTitle.objects.get_or_create(title="ICT Systems Coordinator")
        self.pos_principal, _ = PositionTitle.objects.get_or_create(title="School Principal IV")
        self.pos_head, _ = PositionTitle.objects.get_or_create(title="Head Teacher III")
        self.pos_teacher, _ = PositionTitle.objects.get_or_create(title="Teacher I")
        self.pos_office, _ = PositionTitle.objects.get_or_create(title="Administrative Assistant")

        # 1. ADMIN
        self.admin_user = User.objects.create_user(
            username="rbac_admin",
            password="Password2026!",
            first_name="System",
            last_name="Admin",
            email="admin@school.edu.ph",
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(user=self.admin_user, role="ADMIN")
        self.admin_teacher = TeacherProfile.objects.create(
            user=self.admin_user,
            employee_id="EMP-ADM-100",
            department=self.dept_admin,
            position=self.pos_admin,
            can_handle_classes=True,
        )

        # 2. PRINCIPAL
        self.principal_user = User.objects.create_user(
            username="rbac_principal",
            password="Password2026!",
            first_name="Maria",
            last_name="Principal",
            email="principal@school.edu.ph",
        )
        UserProfile.objects.create(user=self.principal_user, role="PRINCIPAL")
        self.principal_teacher = TeacherProfile.objects.create(
            user=self.principal_user,
            employee_id="EMP-PRN-101",
            department=self.dept_admin,
            position=self.pos_principal,
            can_handle_classes=False,
        )

        # 3. DEPT_HEAD
        self.dept_head_user = User.objects.create_user(
            username="rbac_depthead",
            password="Password2026!",
            first_name="Roberto",
            last_name="Head",
            email="depthead@school.edu.ph",
        )
        UserProfile.objects.create(user=self.dept_head_user, role="DEPT_HEAD")
        self.dept_head_teacher = TeacherProfile.objects.create(
            user=self.dept_head_user,
            employee_id="EMP-DHD-102",
            department=self.dept_math,
            position=self.pos_head,
            can_handle_classes=True,
        )

        # 4. TEACHER (Teaching + Homeroom Adviser of section_a)
        self.adviser_user = User.objects.create_user(
            username="rbac_adviser",
            password="Password2026!",
            first_name="Elena",
            last_name="Adviser",
            email="adviser@school.edu.ph",
        )
        UserProfile.objects.create(user=self.adviser_user, role="TEACHER")
        self.adviser_teacher = TeacherProfile.objects.create(
            user=self.adviser_user,
            employee_id="EMP-TCH-103",
            department=self.dept_math,
            position=self.pos_teacher,
            can_handle_classes=True,
            bound_device_id="DEV-LOCKED-103",
        )

        # 5. TEACHER (Non-Teaching Staff: can_handle_classes=False)
        self.nonteaching_user = User.objects.create_user(
            username="rbac_nonteaching",
            password="Password2026!",
            first_name="Lito",
            last_name="Office",
            email="office@school.edu.ph",
        )
        UserProfile.objects.create(user=self.nonteaching_user, role="TEACHER")
        self.nonteaching_teacher = TeacherProfile.objects.create(
            user=self.nonteaching_user,
            employee_id="EMP-NTC-104",
            department=self.dept_admin,
            position=self.pos_office,
            can_handle_classes=False,
        )

        # School Core Hierarchy
        self.school_year = SchoolYear.objects.create(
            name="2026-2027",
            start_date=date(2026, 6, 1),
            baseline_cutoff_date=date(2026, 6, 5),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        self.grade7 = GradeLevel.objects.create(level_number=7, code="G7", name="Grade 7", stage="JHS")
        self.building, _ = Building.objects.get_or_create(name="Main Academic Building")
        self.room101 = Room.objects.create(name="Room 101", building=self.building, capacity=45)
        self.room102 = Room.objects.create(name="Room 102", building=self.building, capacity=45)
        self.math7 = Subject.objects.create(code="MATH7", title="Mathematics 7", grade_level=self.grade7, units=1)
        self.sci7 = Subject.objects.create(code="SCI7", title="Science 7", grade_level=self.grade7, units=1)

        self.section_a = Section.objects.create(
            school_year=self.school_year,
            grade_level=self.grade7,
            adviser=self.adviser_teacher,
            room_name=self.room101.name,
            name="Rizal",
            capacity=45,
        )
        self.section_b = Section.objects.create(
            school_year=self.school_year,
            grade_level=self.grade7,
            adviser=self.dept_head_teacher,
            room_name=self.room102.name,
            name="Bonifacio",
            capacity=45,
        )
        self.period_a = ClassPeriod.objects.create(
            section=self.section_a,
            subject=self.math7,
            teacher=self.adviser_teacher,
            day_of_week="MON_FRI",
            start_time=time(7, 30),
            end_time=time(8, 30),
        )

        self.student_a = Student.objects.create(
            lrn="127901260101",
            first_name="Juan",
            last_name="Dela Cruz",
            gender="Male",
            birth_date=date(2013, 4, 15),
            guardian_name="Maria Dela Cruz",
            guardian_contact="09171234567",
            qr_token="QR-RBAC-STU-101",
        )
        self.enrollment_a = Enrollment.objects.create(
            student=self.student_a,
            section=self.section_a,
            status="ENROLLED",
            is_cct_recipient=True,
        )

        self.student_b = Student.objects.create(
            lrn="127901260102",
            first_name="Clara",
            last_name="Santos",
            gender="Female",
            birth_date=date(2013, 8, 22),
            guardian_name="Jose Santos",
            guardian_contact="09179876543",
            qr_token="QR-RBAC-STU-102",
        )
        self.enrollment_b = Enrollment.objects.create(
            student=self.student_b,
            section=self.section_b,
            status="ENROLLED",
        )

        div_obj, _ = AdministrativeDivision.objects.get_or_create(
            region="Region X",
            division="Cagayan de Oro City",
            district="Central District",
        )
        self.boundary = CampusBoundary.objects.create(
            campus_name="AttendSure National High School",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=200,
            duty_start_time=time(0, 0),
            duty_end_time=time(23, 59),
            is_active=True,
        )
        self.school_settings = SchoolSettings.objects.create(
            school_id="304100",
            school_name="AttendSure National High School",
            division_ref=div_obj,
            active_school_year=self.school_year,
            campus_boundary=self.boundary,
            address="Main Campus Avenue",
            contact_number="09170000000",
            email="office@school.edu.ph",
            principal_teacher=self.principal_teacher,
        )

    def test_01_users_crud_and_portrait_upload_resize_replace_remove(self):
        self.client.force_authenticate(user=self.admin_user)

        # Reject corrupt image bytes
        bad_img = SimpleUploadedFile("bad.png", b"NOT_A_VALID_IMAGE_HEADER", content_type="image/png")
        bad_res = self.client.post(
            "/api/v1/accounts/users/",
            {
                "username": "bad_img_user",
                "password": "Password2026!",
                "first_name": "Bad",
                "last_name": "Image",
                "role": "TEACHER",
                "photo": bad_img,
            },
            format="multipart",
        )
        self.assertEqual(bad_res.status_code, 400)

        # Reject oversized > 2 MB payload
        too_big = SimpleUploadedFile("huge.png", b"\x89PNG\r\n\x1a\n" + (b"0" * (2 * 1024 * 1024 + 100)), content_type="image/png")
        big_res = self.client.post(
            "/api/v1/accounts/users/",
            {
                "username": "huge_img_user",
                "password": "Password2026!",
                "first_name": "Huge",
                "last_name": "Image",
                "role": "TEACHER",
                "photo": too_big,
            },
            format="multipart",
        )
        self.assertEqual(big_res.status_code, 400)

        # CREATE with oversized 1200x1000 PNG portrait via multipart -> verify resized <= 600x600
        create_res = self.client.post(
            "/api/v1/accounts/users/",
            {
                "username": "full_crud_user",
                "password": "Password2026!",
                "first_name": "Marco",
                "middle_name": "Reyes",
                "last_name": "Villanueva",
                "suffix": "Jr.",
                "email": "marco@school.edu.ph",
                "phone_number": "09175551234",
                "employee_id": "EMP-MARCO-01",
                "department": "Mathematics",
                "position": "Teacher I",
                "role": "TEACHER",
                "can_handle_classes": "true",
                "is_active": "true",
                "photo": _make_uploaded_image("marco.png", fmt="PNG", size=(1200, 1000)),
            },
            format="multipart",
        )
        self.assertEqual(create_res.status_code, 201, create_res.data)
        uid = create_res.data["id"]
        self.assertEqual(create_res.data["middle_name"], "Reyes")
        self.assertEqual(create_res.data["suffix"], "Jr.")
        self.assertEqual(create_res.data["phone_number"], "+639175551234")
        self.assertTrue(create_res.data["photo_url"])

        # Verify saved image was resized to max 600px
        created_tp = TeacherProfile.objects.get(user_id=uid)
        with Image.open(created_tp.photo.path) as saved_img:
            self.assertLessEqual(saved_img.width, 600)
            self.assertLessEqual(saved_img.height, 600)

        # UPDATE all fields + replace photo via Base64 JPEG Data URI
        old_photo_url = create_res.data["photo_url"]
        upd_res = self.client.patch(
            f"/api/v1/accounts/users/{uid}/",
            {
                "first_name": "Marco Updated",
                "middle_name": "Cruz",
                "last_name": "Santos",
                "suffix": "II",
                "email": "marco.updated@school.edu.ph",
                "contact_number": "09185559999",
                "department": "Administration",
                "position": "Head Teacher III",
                "role": "DEPT_HEAD",
                "can_teach": False,
                "photo": _make_data_uri(fmt="JPEG", size=(800, 800)),
            },
            format="json",
        )
        self.assertEqual(upd_res.status_code, 200, upd_res.data)
        self.assertEqual(upd_res.data["first_name"], "Marco Updated")
        self.assertEqual(upd_res.data["middle_name"], "Cruz")
        self.assertEqual(upd_res.data["suffix"], "II")
        self.assertEqual(upd_res.data["role"], "DEPT_HEAD")
        self.assertFalse(upd_res.data["can_handle_classes"])
        self.assertTrue(upd_res.data["photo_url"])
        self.assertNotEqual(upd_res.data["photo_url"], old_photo_url)

        # REMOVE photo via remove_photo=True
        rm_res = self.client.patch(
            f"/api/v1/accounts/users/{uid}/",
            {"photo": None, "remove_photo": True},
            format="json",
        )
        self.assertEqual(rm_res.status_code, 200)
        self.assertIsNone(rm_res.data["photo_url"])

        # DELETE
        del_res = self.client.delete(f"/api/v1/accounts/users/{uid}/")
        self.assertEqual(del_res.status_code, 204)
        self.assertEqual(self.client.get(f"/api/v1/accounts/users/{uid}/").status_code, 404)

    def test_02_own_profile_photo_and_password_change_across_all_4_roles(self):
        for idx, u in enumerate([self.admin_user, self.principal_user, self.dept_head_user, self.adviser_user], start=1):
            self.client.force_authenticate(user=u)
            # Upload portrait via /accounts/profile/
            res_put = self.client.patch(
                "/api/v1/accounts/profile/",
                {
                    "first_name": f"{u.first_name}X",
                    "middle_name": "Middle",
                    "suffix": "III",
                    "contact_number": f"0917000112{idx}",
                    "photo": _make_data_uri(fmt="PNG", size=(500, 500)),
                },
                format="json",
            )
            self.assertEqual(res_put.status_code, 200, f"Failed for {u.username}: {res_put.data}")
            self.assertTrue(res_put.data["photo_url"])
            self.assertEqual(res_put.data["middle_name"], "Middle")
            self.assertEqual(res_put.data["suffix"], "III")

            # Remove portrait via /accounts/me/
            res_clear = self.client.patch(
                "/api/v1/accounts/me/",
                {"photo": None, "remove_photo": True},
                format="json",
            )
            self.assertEqual(res_clear.status_code, 200)
            self.assertIsNone(res_clear.data["photo_url"])

        # Password change wrong current password -> 400; correct -> 200 & login works
        self.client.force_authenticate(user=self.adviser_user)
        bad_pw = self.client.post(
            "/api/v1/accounts/change-password/",
            {"current_password": "WrongPassword!", "new_password": "NewPassword2026!"},
            format="json",
        )
        self.assertEqual(bad_pw.status_code, 400)

        good_pw = self.client.post(
            "/api/v1/accounts/change-password/",
            {"current_password": "Password2026!", "new_password": "NewPassword2026!"},
            format="json",
        )
        self.assertEqual(good_pw.status_code, 200)
        self.client.force_authenticate(user=None)
        login_res = self.client.post(
            "/api/v1/accounts/login/",
            {"username": "rbac_adviser", "password": "NewPassword2026!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, 200)

    def test_03_teachers_and_students_full_field_crud_with_photos_and_enrollment_status(self):
        self.client.force_authenticate(user=self.admin_user)

        # Teachers CRUD + photo upload/replace/remove
        t_create = self.client.post(
            "/api/v1/accounts/teachers/",
            {
                "employee_id": "EMP-PHOTO-201",
                "first_name": "Liza",
                "middle_name": "Diaz",
                "last_name": "Torres",
                "suffix": "",
                "email": "liza@school.edu.ph",
                "contact_number": "09172223344",
                "department": "Mathematics",
                "position": "Teacher I",
                "can_handle_classes": True,
                "photo": _make_data_uri(fmt="PNG", size=(700, 700)),
            },
            format="json",
        )
        self.assertEqual(t_create.status_code, 201, t_create.data)
        tid = t_create.data["id"]
        self.assertTrue(t_create.data["photo_url"])

        t_rm = self.client.patch(f"/api/v1/accounts/teachers/{tid}/", {"remove_photo": True, "position": "Teacher II"}, format="json")
        self.assertEqual(t_rm.status_code, 200)
        self.assertIsNone(t_rm.data["photo_url"])
        self.assertEqual(t_rm.data["position"], "Teacher II")
        self.assertEqual(self.client.delete(f"/api/v1/accounts/teachers/{tid}/").status_code, 204)

        # Students CRUD with ALL DepEd SF1 fields + enrollment_status + photo lifecycle
        s_create = self.client.post(
            "/api/v1/students/",
            {
                "lrn": "127901269991",
                "first_name": "Pedro",
                "middle_name": "Bautista",
                "last_name": "Garcia",
                "suffix": "Jr.",
                "gender": "Male",
                "birth_date": "2013-02-14",
                "mother_tongue": "Cebuano",
                "ethnic_group": "None",
                "religion": "Roman Catholic",
                "house_street_sitio": "12 Rizal St",
                "barangay": "Carmen",
                "municipality_city": "Cagayan de Oro",
                "province": "Misamis Oriental",
                "father_name": "Ramon Garcia",
                "mother_maiden_name": "Lucia Bautista",
                "guardian_name": "Lucia Garcia",
                "guardian_relationship": "Mother",
                "guardian_contact": "09176667788",
                "section_id": self.section_a.id,
                "enrollment_status": "TRANSFERRED_IN",
                "photo": _make_data_uri(fmt="JPEG", size=(900, 900)),
            },
            format="json",
        )
        self.assertEqual(s_create.status_code, 201, s_create.data)
        sid = s_create.data["id"]
        self.assertEqual(s_create.data["enrollment_status"], "TRANSFERRED_IN")
        self.assertTrue(s_create.data["photo_url"])
        self.assertTrue(s_create.data["qr_payload"])

        # Update enrollment status & section + remove photo
        s_upd = self.client.patch(
            f"/api/v1/students/{sid}/",
            {
                "section_id": self.section_b.id,
                "enrollment_status": "TRANSFERRED_OUT",
                "barangay": "Lapasan",
                "remove_photo": True,
            },
            format="json",
        )
        self.assertEqual(s_upd.status_code, 200, s_upd.data)
        self.assertEqual(s_upd.data["enrollment_status"], "TRANSFERRED_OUT")
        self.assertEqual(s_upd.data["current_section_id"], self.section_b.id)
        self.assertEqual(s_upd.data["barangay"], "Lapasan")
        self.assertIsNone(s_upd.data["photo_url"])

        # Mark DROPPED then DELETE
        s_drop = self.client.patch(f"/api/v1/students/{sid}/", {"enrollment_status": "DROPPED"}, format="json")
        self.assertEqual(s_drop.status_code, 200)
        self.assertEqual(s_drop.data["enrollment_status"], "DROPPED")
        self.assertEqual(self.client.delete(f"/api/v1/students/{sid}/").status_code, 204)

    def test_04_academic_setup_department_crud_and_schedule_overlap_validation(self):
        self.client.force_authenticate(user=self.admin_user)

        # Department CRUD via /api/v1/school/departments/
        dept_c = self.client.post("/api/v1/school/departments/", {"code": "SCI", "name": "Science Department"}, format="json")
        self.assertEqual(dept_c.status_code, 201, dept_c.data)
        did = dept_c.data["id"]
        dept_u = self.client.patch(f"/api/v1/school/departments/{did}/", {"name": "Science & Tech"}, format="json")
        self.assertEqual(dept_u.status_code, 200)
        self.assertEqual(dept_u.data["name"], "Science & Tech")
        self.assertEqual(self.client.delete(f"/api/v1/school/departments/{did}/").status_code, 204)

        # SchoolYear alias /api/v1/school/years/
        self.assertEqual(self.client.get("/api/v1/school/years/").status_code, 200)

        # ClassPeriod overlap validation: same section overlapping 08:00-09:00 on MON_FRI -> 400
        sec_overlap = self.client.post(
            "/api/v1/school/periods/",
            {
                "section": self.section_a.id,
                "subject": self.sci7.id,
                "teacher": self.dept_head_teacher.id,
                "day_of_week": "MON_FRI",
                "start_time": "08:00:00",
                "end_time": "09:00:00",
            },
            format="json",
        )
        self.assertEqual(sec_overlap.status_code, 400)

        # ClassPeriod overlap validation: same teacher in different section overlapping 07:45-08:45 -> 400
        tch_overlap = self.client.post(
            "/api/v1/school/periods/",
            {
                "section": self.section_b.id,
                "subject": self.sci7.id,
                "teacher": self.adviser_teacher.id,
                "day_of_week": "MONDAY",
                "start_time": "07:45:00",
                "end_time": "08:45:00",
            },
            format="json",
        )
        self.assertEqual(tch_overlap.status_code, 400)

        # Non-overlapping period 08:30-09:30 -> 201
        ok_period = self.client.post(
            "/api/v1/school/periods/",
            {
                "section": self.section_a.id,
                "subject": self.sci7.id,
                "teacher": self.adviser_teacher.id,
                "day_of_week": "MON_FRI",
                "start_time": "08:30:00",
                "end_time": "09:30:00",
            },
            format="json",
        )
        self.assertEqual(ok_period.status_code, 201, ok_period.data)
        self.assertEqual(self.client.delete(f"/api/v1/school/periods/{ok_period.data['id']}/").status_code, 204)

    def test_05_loafing_patch_exit_pass_approve_and_division_export_json_csv(self):
        # Create an open loafing incident directly and resolve via PATCH /api/v1/campus/loafing-incidents/{id}/
        incident = LoafingIncident.objects.create(
            incident_type="TEACHER_OUTSIDE_GEOFENCE",
            teacher=self.adviser_teacher,
            status="OPEN",
            remarks="Detected outside campus during duty",
        )
        self.client.force_authenticate(user=self.dept_head_user)
        patch_res = self.client.patch(
            f"/api/v1/campus/loafing-incidents/{incident.id}/",
            {"status": "EXCUSED", "remarks": "Approved DepEd Division seminar"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200, patch_res.data)
        incident.refresh_from_db()
        self.assertEqual(incident.status, "EXCUSED")
        self.assertIn("Approved DepEd Division seminar", incident.remarks)

        # Teacher requests Official Locator Slip -> Dept Head approves -> Principal cancels
        self.client.force_authenticate(user=self.adviser_user)
        slip_res = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "pass_scope": "TEACHER",
                "pass_type": "Official Locator Slip",
                "destination": "DepEd Division Office",
                "reason": "Submit monthly SF2 & SF4",
                "valid_until": (timezone.now() + timedelta(hours=3)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(slip_res.status_code, 201, slip_res.data)
        slip_id = slip_res.data["id"]

        # Teacher CANNOT approve or cancel their own locator slip (Matrix 3.1 -> 403)
        self.assertEqual(self.client.post(f"/api/v1/attendance/exit-passes/{slip_id}/approve/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.post(f"/api/v1/attendance/exit-passes/{slip_id}/cancel/", {}, format="json").status_code, 403)

        # Dept Head CAN approve
        self.client.force_authenticate(user=self.dept_head_user)
        app_res = self.client.post(f"/api/v1/attendance/exit-passes/{slip_id}/approve/", {}, format="json")
        self.assertEqual(app_res.status_code, 200, app_res.data)
        self.assertTrue(app_res.data["ok"])

        # Principal CAN cancel
        self.client.force_authenticate(user=self.principal_user)
        can_res = self.client.post(f"/api/v1/attendance/exit-passes/{slip_id}/cancel/", {}, format="json")
        self.assertEqual(can_res.status_code, 200)

        # DepEd Division Data Export (JSON + CSV) — zero "Ed-Fi" in downloaded CSV filename
        self.client.force_authenticate(user=self.admin_user)
        div_json = self.client.get("/api/v1/reports/division-export/")
        self.assertEqual(div_json.status_code, 200)
        self.assertIn("students", div_json.json())

        div_csv = self.client.get("/api/v1/reports/division-export/?export_format=csv")
        self.assertEqual(div_csv.status_code, 200)
        self.assertIn("text/csv", div_csv["Content-Type"])
        self.assertNotIn("edfi", div_csv["Content-Disposition"].lower())
        self.assertIn("deped_division_export", div_csv["Content-Disposition"].lower())

    def test_06_complete_5_profile_rbac_matrix_enforcement(self):
        incident = LoafingIncident.objects.create(
            incident_type="TEACHER_OUTSIDE_GEOFENCE",
            teacher=self.adviser_teacher,
            status="OPEN",
            remarks="Outside boundary",
        )

        # --- PROFILE 1: TEACHING TEACHER / HOMEROOM ADVISER (self.adviser_user) ---
        self.client.force_authenticate(user=self.adviser_user)
        self.assertEqual(self.client.get("/api/v1/accounts/users/").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/accounts/teachers/", {"employee_id": "X", "first_name": "A", "last_name": "B"}, format="json").status_code, 403)
        self.assertEqual(self.client.post(f"/api/v1/accounts/teachers/{self.adviser_teacher.id}/reset-device/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/accounts/audit-logs/").status_code, 403)
        self.assertEqual(self.client.put("/api/v1/school/settings/", {"school_name": "Hack"}, format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/school/sections/", {"name": "Hack", "grade_level": self.grade7.id}, format="json").status_code, 403)
        self.assertEqual(self.client.put("/api/v1/campus/boundary/", {"radius_meters": 500}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(f"/api/v1/campus/loafing-incidents/{incident.id}/", {"status": "EXCUSED"}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/reports/sf4/").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/students/{self.student_a.id}/").status_code, 403)

        # Homeroom Adviser CAN add & edit learners in OWN advised section (section_a), but NOT section_b
        adv_create_ok = self.client.post(
            "/api/v1/students/",
            {
                "lrn": "127901268801",
                "first_name": "Advised",
                "last_name": "Learner",
                "gender": "Female",
                "birth_date": "2013-07-01",
                "guardian_contact": "09171110000",
                "section_id": self.section_a.id,
            },
            format="json",
        )
        self.assertEqual(adv_create_ok.status_code, 201, adv_create_ok.data)
        self.assertEqual(
            self.client.patch(f"/api/v1/students/{adv_create_ok.data['id']}/", {"barangay": "Gusa"}, format="json").status_code,
            200,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/students/{adv_create_ok.data['id']}/").status_code,
            403,
        )
        adv_create_other = self.client.post(
            "/api/v1/students/",
            {
                "lrn": "127901268802",
                "first_name": "Other",
                "last_name": "Section",
                "gender": "Male",
                "birth_date": "2013-07-01",
                "guardian_contact": "09171110001",
                "section_id": self.section_b.id,
            },
            format="json",
        )
        self.assertEqual(adv_create_other.status_code, 403)

        # --- PROFILE 2: NON-TEACHING TEACHER (self.nonteaching_user, can_handle_classes=False) ---
        self.client.force_authenticate(user=self.nonteaching_user)
        signed_qr = sign_student_qr(self.student_a.lrn, self.student_a.qr_token)
        self.assertEqual(
            self.client.post("/api/v1/attendance/scan/", {"qr_text": signed_qr, "period_id": self.period_a.id}, format="json").status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/attendance/offline-sync/",
                {"scans": [{"qr_token": signed_qr, "period_id": self.period_a.id, "client_scan_uuid": "11111111-1111-4111-8111-111111111111"}]},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/attendance/exit-passes/",
                {
                    "pass_scope": "STUDENT",
                    "student_id": self.student_a.id,
                    "destination": "Clinic",
                    "reason": "Headache",
                    "valid_until": (timezone.now() + timedelta(hours=1)).isoformat(),
                },
                format="json",
            ).status_code,
            403,
        )
        # Non-teaching staff CAN request their own Official Locator Slip
        nt_slip = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "pass_scope": "TEACHER",
                "destination": "DepEd Regional Office",
                "reason": "Official errand",
                "valid_until": (timezone.now() + timedelta(hours=2)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(nt_slip.status_code, 201)

        # --- PROFILE 3: DEPT_HEAD ---
        self.client.force_authenticate(user=self.dept_head_user)
        self.assertEqual(self.client.get("/api/v1/accounts/users/").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/accounts/teachers/", {"employee_id": "Y", "first_name": "A", "last_name": "B"}, format="json").status_code, 403)
        self.assertEqual(self.client.post(f"/api/v1/accounts/teachers/{self.adviser_teacher.id}/reset-device/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/accounts/audit-logs/").status_code, 403)
        self.assertEqual(self.client.put("/api/v1/campus/boundary/", {"radius_meters": 250}, format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/school/subjects/", {"code": "X", "title": "X", "grade_level": self.grade7.id}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(f"/api/v1/students/{self.student_a.id}/", {"barangay": "Blocked"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/students/{self.student_a.id}/").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/reports/sf4/").status_code, 200)
        self.assertEqual(self.client.patch(f"/api/v1/campus/loafing-incidents/{incident.id}/", {"status": "RETURNED"}, format="json").status_code, 200)

        # --- PROFILE 4: PRINCIPAL ---
        self.client.force_authenticate(user=self.principal_user)
        self.assertEqual(self.client.post("/api/v1/accounts/users/", {"username": "prn_block", "password": "Password2026!", "role": "TEACHER"}, format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/accounts/teachers/", {"employee_id": "Z", "first_name": "A", "last_name": "B"}, format="json").status_code, 403)
        self.assertEqual(self.client.put("/api/v1/school/settings/", {"school_name": "Principal Cannot Edit"}, format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/school/sections/", {"name": "Blocked", "grade_level": self.grade7.id}, format="json").status_code, 403)
        # Principal CAN edit Campus Boundary, reset bound phone, view Audit Logs, and manage Students
        self.assertEqual(
            self.client.put(
                "/api/v1/campus/boundary/",
                {"center_latitude": 8.4858, "center_longitude": 124.6567, "radius_meters": 225},
                format="json",
            ).status_code,
            200,
        )
        self.assertEqual(self.client.post(f"/api/v1/accounts/teachers/{self.adviser_teacher.id}/reset-device/", {}, format="json").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/accounts/audit-logs/").status_code, 200)
        self.assertEqual(self.client.patch(f"/api/v1/students/{self.student_a.id}/", {"barangay": "Nazareth"}, format="json").status_code, 200)
