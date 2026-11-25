"""
AttendSure - Comprehensive 3NF Full-System CRUD & DepEd Reports Test Suite
Run: python manage.py test apps.accounts.test_full_crud --verbosity=2
"""

from datetime import date, time, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import Department, PositionTitle, TeacherProfile, UserProfile
from apps.campus.models import CampusBoundary
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


class FullSystemCrudAndFeaturesTestSuite(APITestCase):
    def setUp(self):
        cache.clear()
        dept_admin, _ = Department.objects.get_or_create(code="ADMIN", defaults={"name": "Administration"})
        dept_math, _ = Department.objects.get_or_create(code="MATH", defaults={"name": "Mathematics"})
        pos_admin, _ = PositionTitle.objects.get_or_create(title="School Administrator")
        pos_teacher, _ = PositionTitle.objects.get_or_create(title="Teacher I")

        self.admin_user = User.objects.create_user(
            username="crud_admin",
            password="AttendSure2026!",
            first_name="System",
            last_name="Admin",
            email="admin@attendsure.edu",
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(user=self.admin_user, role="ADMIN")
        self.admin_teacher = TeacherProfile.objects.create(
            user=self.admin_user,
            employee_id="EMP-ADM-01",
            department=dept_admin,
            position=pos_admin,
            can_handle_classes=True,
        )

        self.teacher_user = User.objects.create_user(
            username="crud_teacher",
            password="AttendSure2026!",
            first_name="Elena",
            last_name="Reyes",
            email="elena@attendsure.edu",
        )
        UserProfile.objects.create(user=self.teacher_user, role="TEACHER")
        self.teacher_profile = TeacherProfile.objects.create(
            user=self.teacher_user,
            employee_id="EMP-TCH-01",
            department=dept_math,
            position=pos_teacher,
            can_handle_classes=True,
            bound_device_id="DEV-ORIG-001",
        )

        self.school_year = SchoolYear.objects.create(
            name="2026-2027",
            start_date=date(2026, 6, 1),
            baseline_cutoff_date=date(2026, 6, 5),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        self.grade = GradeLevel.objects.create(level_number=7, code="G7", name="Grade 7", stage="JHS")
        bldg, _ = Building.objects.get_or_create(name="Main Building")
        self.room = Room.objects.create(name="Room 101", building=bldg, capacity=45)
        self.subject = Subject.objects.create(code="MATH7", title="Mathematics 7", grade_level=self.grade, units=1)
        self.section = Section.objects.create(
            school_year=self.school_year,
            grade_level=self.grade,
            adviser=self.teacher_profile,
            room_name=self.room.name,
            name="Diamond",
            capacity=45,
        )
        self.period = ClassPeriod.objects.create(
            section=self.section,
            subject=self.subject,
            teacher=self.teacher_profile,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(7, 30),
            end_time=time(8, 30),
        )
        self.student = Student.objects.create(
            lrn="127901260001",
            first_name="Juan",
            last_name="Santos",
            gender="Male",
            birth_date=date(2013, 5, 10),
            guardian_name="Rosa Santos",
            guardian_contact="+639171112222",
            qr_token="QR-TEST-STU-001",
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            section=self.section,
            status="ENROLLED",
            is_cct_recipient=True,
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
            contact_number="+639170000000",
            email="office@attendsure.edu",
            principal_teacher=self.admin_teacher,
        )

    def test_01_auth_profile_validation_device_reset_and_unlock(self):
        res = self.client.post(
            "/api/v1/accounts/login/",
            {"username": "crud_admin", "password": "AttendSure2026!"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertIn("token", res.data)

        self.client.force_authenticate(user=self.admin_user)

        me_get = self.client.get("/api/v1/accounts/me/")
        self.assertEqual(me_get.status_code, 200)
        self.assertEqual(me_get.data["username"], "crud_admin")

        me_patch = self.client.patch(
            "/api/v1/accounts/me/", {"first_name": "Lead", "department": "Executive"}, format="json"
        )
        self.assertEqual(me_patch.status_code, 200)
        self.assertEqual(me_patch.data["first_name"], "Lead")

        val = self.client.get("/api/v1/accounts/validate-field/", {"field": "username", "value": "crud_admin"})
        self.assertEqual(val.status_code, 200)
        self.assertTrue(val.data["is_taken"])

        reset_res = self.client.post(f"/api/v1/accounts/teachers/{self.teacher_profile.id}/reset-device/", {}, format="json")
        self.assertEqual(reset_res.status_code, 200)
        self.teacher_profile.refresh_from_db()
        self.assertIsNone(self.teacher_profile.bound_device_id)

        unlock_res = self.client.post("/api/v1/accounts/unlock-accounts/", {}, format="json")
        self.assertEqual(unlock_res.status_code, 200)
        self.assertTrue(unlock_res.data["ok"])

        logs_res = self.client.get("/api/v1/accounts/audit-logs/")
        self.assertEqual(logs_res.status_code, 200)
        self.assertIn("records", logs_res.data)

    def test_02_teachers_and_users_full_crud(self):
        self.client.force_authenticate(user=self.admin_user)

        create_t = self.client.post(
            "/api/v1/accounts/teachers/",
            {
                "employee_id": "EMP-NEW-99",
                "first_name": "Carlos",
                "last_name": "Mendoza",
                "email": "carlos@attendsure.edu",
                "department": "Science",
                "position": "Teacher II",
            },
            format="json",
        )
        self.assertEqual(create_t.status_code, 201)
        tid = create_t.data["id"]

        self.assertEqual(self.client.get("/api/v1/accounts/teachers/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/accounts/teachers/dropdown/").status_code, 200)

        upd_t = self.client.patch(f"/api/v1/accounts/teachers/{tid}/", {"position": "Master Teacher I"}, format="json")
        self.assertEqual(upd_t.status_code, 200)
        self.assertEqual(upd_t.data["position"], "Master Teacher I")

        del_t = self.client.delete(f"/api/v1/accounts/teachers/{tid}/")
        self.assertEqual(del_t.status_code, 204)

        create_u = self.client.post(
            "/api/v1/accounts/users/",
            {
                "username": "temp_staff_user",
                "password": "TempPassword2026!",
                "first_name": "Ana",
                "last_name": "Cruz",
                "email": "ana@attendsure.edu",
                "employee_id": "EMP-ANA-01",
                "role": "TEACHER",
                "can_handle_classes": True,
            },
            format="json",
        )
        self.assertEqual(create_u.status_code, 201)
        uid = create_u.data["id"]

        upd_u = self.client.patch(
            f"/api/v1/accounts/users/{uid}/",
            {"employee_id": "EMP-ANA-02", "department": "English"},
            format="json",
        )
        self.assertEqual(upd_u.status_code, 200)
        self.assertEqual(upd_u.data["employee_id"], "EMP-ANA-02")
        self.assertEqual(upd_u.data["department"], "English")

        # Self-delete guard returns 400
        self.assertEqual(self.client.delete(f"/api/v1/accounts/users/{self.admin_user.id}/").status_code, 400)
        self.assertEqual(self.client.delete(f"/api/v1/accounts/users/{uid}/").status_code, 204)

    def test_03_school_structure_and_holidays_full_crud(self):
        pub = self.client.get("/api/v1/school/public-branding/")
        self.assertEqual(pub.status_code, 200)
        self.assertEqual(pub.data["school_name"], "AttendSure National High School")

        self.client.force_authenticate(user=self.admin_user)

        self.assertEqual(self.client.get("/api/v1/school/settings/").status_code, 200)
        upd_set = self.client.put(
            "/api/v1/school/settings/",
            {"school_name": "AttendSure Science High", "geofence_radius_meters": 250},
            format="json",
        )
        self.assertEqual(upd_set.status_code, 200)
        self.assertEqual(upd_set.data["school_name"], "AttendSure Science High")

        sy_c = self.client.post(
            "/api/v1/school/school-years/",
            {"name": "2027-2028", "start_date": "2027-06-01", "baseline_cutoff_date": "2027-06-05", "end_date": "2028-03-31", "is_active": False},
            format="json",
        )
        self.assertEqual(sy_c.status_code, 201)
        sy_id = sy_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/school-years/{sy_id}/", {"end_date": "2028-04-15"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/school-years/{sy_id}/").status_code, 204)

        g_c = self.client.post("/api/v1/school/grade-levels/", {"code": "G8", "name": "Grade 8", "stage": "JHS", "level_number": 8}, format="json")
        self.assertEqual(g_c.status_code, 201)
        gid = g_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/grade-levels/{gid}/", {"name": "Grade 8 JHS"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/grade-levels/{gid}/").status_code, 204)

        r_c = self.client.post("/api/v1/school/rooms/", {"name": "Lab 202", "building": "Science Wing", "capacity": 40}, format="json")
        self.assertEqual(r_c.status_code, 201)
        rid = r_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/rooms/{rid}/", {"capacity": 50}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/rooms/{rid}/").status_code, 204)

        sub_c = self.client.post("/api/v1/school/subjects/", {"code": "SCI7", "title": "Science 7", "units": 2}, format="json")
        self.assertEqual(sub_c.status_code, 201)
        sub_id = sub_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/subjects/{sub_id}/", {"title": "General Science 7"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/subjects/{sub_id}/").status_code, 204)

        sec_c = self.client.post(
            "/api/v1/school/sections/",
            {
                "name": "Emerald",
                "grade_level": self.grade.id,
                "adviser": self.teacher_profile.id,
                "room_name": "Room 102",
                "allow_multiple_advisories": True,
            },
            format="json",
        )
        self.assertEqual(sec_c.status_code, 201)
        sec_id = sec_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/sections/{sec_id}/", {"capacity": 50}, format="json").status_code, 200)

        per_c = self.client.post(
            "/api/v1/school/periods/",
            {
                "section": sec_id,
                "subject": self.subject.id,
                "teacher": self.teacher_profile.id,
                "start_time": "09:00",
                "end_time": "10:00",
                "day_of_week": "ALL_WEEKDAYS",
            },
            format="json",
        )
        self.assertEqual(per_c.status_code, 201)
        per_id = per_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/periods/{per_id}/", {"end_time": "10:15"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/periods/{per_id}/").status_code, 204)
        self.assertEqual(self.client.delete(f"/api/v1/school/sections/{sec_id}/").status_code, 204)

        wk = self.client.patch("/api/v1/school/holidays/", {"weekend_rest_enabled": False}, format="json")
        self.assertEqual(wk.status_code, 200)
        self.assertFalse(wk.data["weekend_rest_enabled"])

        hol_c = self.client.post(
            "/api/v1/school/holidays/",
            {"date": "2026-08-31", "type": "HOLIDAY", "reason": "National Heroes Day"},
            format="json",
        )
        self.assertEqual(hol_c.status_code, 201)
        hid = hol_c.data["id"]
        hol_p = self.client.patch(f"/api/v1/school/holidays/{hid}/", {"date": "2026-09-01"}, format="json")
        self.assertEqual(hol_p.status_code, 200)
        self.assertEqual(hol_p.data["date"], "2026-09-01")
        self.assertEqual(self.client.delete(f"/api/v1/school/holidays/{hid}/").status_code, 204)

    def test_04_students_enrollments_and_bulk_csv_import(self):
        self.client.force_authenticate(user=self.admin_user)

        st_c = self.client.post(
            "/api/v1/students/",
            {
                "lrn": "127901260099",
                "first_name": "Liza",
                "last_name": "Diaz",
                "gender": "Female",
                "birth_date": "2013-07-15",
                "section_id": self.section.id,
                "guardian_name": "Marta Diaz",
                "guardian_contact": "09179998888",
            },
            format="json",
        )
        self.assertEqual(st_c.status_code, 201)
        st_id = st_c.data["id"]
        self.assertEqual(st_c.data["current_section"], "Diamond")

        self.assertEqual(self.client.get("/api/v1/students/metrics/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/students/dropdown/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/students/qr-cards/").status_code, 200)

        st_u = self.client.patch(f"/api/v1/students/{st_id}/", {"first_name": "Eliza"}, format="json")
        self.assertEqual(st_u.status_code, 200)
        self.assertEqual(st_u.data["first_name"], "Eliza")

        self.assertEqual(self.client.get("/api/v1/students/enrollments/").status_code, 200)
        enr = Enrollment.objects.get(student_id=st_id)
        self.assertEqual(
            self.client.patch(f"/api/v1/students/enrollments/{enr.id}/", {"remarks": "Verified"}, format="json").status_code,
            200,
        )
        self.assertEqual(self.client.delete(f"/api/v1/students/enrollments/{enr.id}/").status_code, 204)
        self.assertEqual(self.client.delete(f"/api/v1/students/{st_id}/").status_code, 204)

        csv_body = (
            "lrn,first_name,middle_name,last_name,suffix,gender,birth_date,section_name,grade_level,guardian_contact,barangay,municipality_city,province\n"
            "127901260501,Miguel,Reyes,Navarro,,Male,2013-03-12,Diamond,Grade 7,09171234501,Macasandig,Cagayan de Oro City,Misamis Oriental\n"
            "127901260502,Angela,Cruz,Ramos,,Female,2013-08-24,Sapphire,Grade 8,09171234502,Nazareth,Cagayan de Oro City,Misamis Oriental\n"
            "BADLRN,Invalid,Row,Test,,Male,2013-01-01,Diamond,Grade 7,09171234503,Carmen,Cagayan de Oro City,Misamis Oriental\n"
        ).encode("utf-8")

        # Non-leader teacher blocked from bulk CSV import (403)
        self.client.force_authenticate(user=self.teacher_user)
        denied = self.client.post(
            "/api/v1/students/bulk-import/",
            {"file": SimpleUploadedFile("class_list.csv", csv_body, content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(denied.status_code, 403)

        # Admin imports cleanly & re-upload updates idempotently
        self.client.force_authenticate(user=self.admin_user)
        res1 = self.client.post(
            "/api/v1/students/bulk-import/",
            {"file": SimpleUploadedFile("class_list.csv", csv_body, content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.data["created_count"], 2)
        self.assertEqual(res1.data["skipped_count"], 1)

        res2 = self.client.post(
            "/api/v1/students/bulk-import/",
            {"file": SimpleUploadedFile("class_list.csv", csv_body, content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data["created_count"], 0)
        self.assertEqual(res2.data["updated_count"], 2)

    def test_05_attendance_qr_scan_manual_crud_and_exit_passes(self):
        self.client.force_authenticate(user=self.teacher_user)

        signed_qr = sign_student_qr(self.student.lrn, self.student.qr_token)
        scan = self.client.post(
            "/api/v1/attendance/scan/",
            {"qr_text": signed_qr, "schedule_id": self.period.id},
            format="json",
        )
        self.assertEqual(scan.status_code, 201)
        self.assertTrue(scan.data["ok"])

        sync = self.client.post(
            "/api/v1/attendance/offline-sync/",
            {"scans": [{"qr_token": signed_qr, "schedule_id": self.period.id, "scanned_at": timezone.now().isoformat()}]},
            format="json",
        )
        self.assertEqual(sync.status_code, 200)
        self.assertEqual(sync.data["duplicate_count"], 1)

        classes = self.client.get("/api/v1/attendance/classes/")
        self.assertEqual(classes.status_code, 200)
        self.assertGreaterEqual(len(classes.data), 1)

        matrix = self.client.get("/api/v1/attendance/adviser-matrix/")
        self.assertEqual(matrix.status_code, 200)

        recs = self.client.get("/api/v1/attendance/records/")
        self.assertEqual(recs.status_code, 200)
        rec_id = recs.data["records"][0]["id"]

        upd_rec = self.client.put("/api/v1/attendance/records/", {"id": rec_id, "status": "EXCUSED"}, format="json")
        self.assertEqual(upd_rec.status_code, 200)
        self.assertEqual(upd_rec.data["status"], "EXCUSED")

        del_rec = self.client.delete(f"/api/v1/attendance/records/?id={rec_id}")
        self.assertEqual(del_rec.status_code, 200)

        man_c = self.client.post(
            "/api/v1/attendance/records/",
            {"student_id": self.student.id, "schedule_id": self.period.id, "status": "PRESENT"},
            format="json",
        )
        self.assertEqual(man_c.status_code, 201)

        now = timezone.now()
        ep_c = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "pass_scope": "TEACHER",
                "teacher": self.teacher_profile.id,
                "pass_type": "Official Travel",
                "reason": "Division Math Seminar",
                "destination": "Division Office",
                "valid_until": (now + timedelta(hours=3)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(ep_c.status_code, 201)
        ep_id = ep_c.data["id"]

        ep_p = self.client.patch(
            f"/api/v1/attendance/exit-passes/{ep_id}/", {"reason": "Updated Seminar Venue"}, format="json"
        )
        self.assertEqual(ep_p.status_code, 200)
        self.assertEqual(ep_p.data["reason"], "Updated Seminar Venue")

        self.assertEqual(self.client.get("/api/v1/attendance/exit-passes/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/attendance/exit-passes/{ep_id}/mark-returned/").status_code, 200)

        self.client.force_authenticate(user=self.admin_user)
        self.assertEqual(self.client.delete(f"/api/v1/attendance/exit-passes/{ep_id}/").status_code, 204)

    def test_06_campus_gps_and_all_deped_reports(self):
        self.client.force_authenticate(user=self.admin_user)
        b_put = self.client.put(
            "/api/v1/campus/boundary/",
            {"campus_name": "Main Campus", "center_latitude": 8.4858, "center_longitude": 124.6567, "radius_meters": 220},
            format="json",
        )
        self.assertEqual(b_put.status_code, 200)
        self.assertEqual(b_put.data["radius_meters"], 220)

        self.client.force_authenticate(user=self.teacher_user)
        chk_in = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_IN",
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "face_verified_on_device": True,
                "device_id": "DEV-ORIG-001",
            },
            format="json",
        )
        self.assertEqual(chk_in.status_code, 201)
        self.assertTrue(chk_in.data["is_inside"])

        chk_out = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_OUT",
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "face_verified_on_device": True,
                "device_id": "DEV-ORIG-001",
            },
            format="json",
        )
        self.assertEqual(chk_out.status_code, 201)

        self.assertEqual(self.client.get("/api/v1/campus/audit/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/campus/anomalies/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/campus/roll-call/").status_code, 200)

        # All Reports, Ed-Fi v6.0 Standard & GDPR Pseudonymized, DTR Actions, Health & Cache
        self.client.force_authenticate(user=self.admin_user)
        today = timezone.localdate()
        self.assertEqual(self.client.get("/api/v1/reports/dashboard/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/sf1/", {"section_id": self.section.id}).status_code, 200)
        self.assertEqual(
            self.client.get("/api/v1/reports/sf2/", {"section_id": self.section.id, "month": today.month, "year": today.year}).status_code,
            200,
        )
        self.assertEqual(
            self.client.get(f"/api/v1/reports/sf2/{self.section.id}/", {"month": "November", "year": 2026}).status_code,
            200,
        )
        self.assertEqual(
            self.client.get("/api/v1/reports/sf4/", {"month": today.month, "year": today.year, "school_year": "2026-2027"}).status_code,
            200,
        )
        self.assertEqual(
            self.client.get("/api/v1/reports/dtr/", {"teacher_id": self.teacher_profile.id, "month": today.month, "year": today.year}).status_code,
            200,
        )

        dtr_sub = self.client.post(
            "/api/v1/reports/dtr/",
            {"action": "SUBMIT_DTR", "teacher_id": self.teacher_profile.id, "month": today.month, "year": today.year, "regular_hours": "8:00 AM - 5:00 PM"},
            format="json",
        )
        self.assertEqual(dtr_sub.status_code, 200)
        dtr_app = self.client.post(
            "/api/v1/reports/dtr/",
            {"action": "APPROVE_DEPT_HEAD", "teacher_id": self.teacher_profile.id, "month": today.month, "year": today.year},
            format="json",
        )
        self.assertEqual(dtr_app.status_code, 200)

        self.assertEqual(self.client.get("/api/v1/reports/export/", {"type": "sf1", "section_id": self.section.id}).status_code, 200)

        # Ed-Fi v6.0 Standard & GDPR Pseudonymized + RBAC
        self.client.force_authenticate(user=self.teacher_user)
        self.assertEqual(self.client.get("/api/v1/reports/edfi-export/").status_code, 403)
        self.client.force_authenticate(user=self.admin_user)
        std_edfi = self.client.get("/api/v1/reports/edfi-export/?days=14&anonymize=0")
        self.assertEqual(std_edfi.status_code, 200)
        self.assertEqual(std_edfi.json()["edFiVersion"], "6.0")
        anon_edfi = self.client.get("/api/v1/reports/edfi-export/?days=14&anonymize=1")
        self.assertEqual(anon_edfi.status_code, 200)
        self.assertEqual(anon_edfi.json()["privacyMode"], "GDPR_PSEUDONYMIZED")

        self.assertEqual(
            self.client.post(
                "/api/v1/reports/audit-logs/",
                {"action": "PRINT", "report_name": "SF1", "section_id": self.section.id, "document_tracking_id": "TRK-001"},
                format="json",
            ).status_code,
            201,
        )
        self.assertEqual(self.client.get("/api/v1/reports/audit-logs/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/dropout-risk/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/sdg-impact/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/system-status/").status_code, 200)
        self.assertEqual(
            self.client.post("/api/v1/reports/system-status/", {"action": "RUN_LOAFING_AUDIT"}, format="json").status_code,
            200,
        )
        self.assertEqual(self.client.get("/api/v1/health/db/").status_code, 200)
        self.assertEqual(self.client.post("/api/v1/cache/flush/").status_code, 200)
