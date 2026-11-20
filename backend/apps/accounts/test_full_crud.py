"""
AttendSure - Comprehensive Full-System CRUD & Feature Verification Test Suite
Run: python manage.py test apps.accounts.test_full_crud --verbosity=2
"""

from datetime import date, time, timedelta
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import TeacherProfile, UserProfile
from apps.school.models import ClassPeriod, GradeLevel, Room, SchoolSettings, SchoolYear, Section, Subject
from apps.students.models import Enrollment, Student
from common.qr_signer import sign_student_qr

User = get_user_model()


class FullSystemCrudAndFeaturesTestSuite(APITestCase):
    def setUp(self):
        self.admin_teacher = TeacherProfile.objects.create(
            employee_id="EMP-ADM-01",
            first_name="System",
            last_name="Admin",
            email="admin@attendsure.edu",
            department="Administration",
            position="School Administrator",
            can_teach=True,
            is_active=True,
        )
        self.admin_user = User.objects.create_user(
            username="crud_admin",
            password="AttendSure2026!",
            first_name="System",
            last_name="Admin",
            email="admin@attendsure.edu",
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(
            user=self.admin_user,
            teacher=self.admin_teacher,
            role="ADMIN",
            is_teaching=True,
            is_profile_completed=True,
        )

        self.faculty_profile = TeacherProfile.objects.create(
            employee_id="EMP-FAC-01",
            first_name="Elena",
            last_name="Reyes",
            email="elena@attendsure.edu",
            department="Mathematics",
            position="Faculty I",
            can_teach=True,
            is_active=True,
            bound_device_id="DEV-ORIG-001",
        )
        self.faculty_user = User.objects.create_user(
            username="crud_faculty",
            password="AttendSure2026!",
            first_name="Elena",
            last_name="Reyes",
            email="elena@attendsure.edu",
        )
        UserProfile.objects.create(
            user=self.faculty_user,
            teacher=self.faculty_profile,
            role="FACULTY",
            is_teaching=True,
            is_profile_completed=True,
        )

        self.parent_user = User.objects.create_user(
            username="crud_parent",
            password="AttendSure2026!",
            first_name="Rosa",
            last_name="Santos",
            email="rosa@attendsure.edu",
        )
        UserProfile.objects.create(
            user=self.parent_user,
            role="PARENT",
            phone_number="+639171112222",
            is_teaching=False,
            is_profile_completed=True,
        )

        self.school_year = SchoolYear.objects.create(
            code="2026-2027",
            start_date=date(2026, 6, 1),
            baseline_cutoff_date=date(2026, 6, 5),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        self.grade = GradeLevel.objects.create(code="G7", name="Grade 7", stage="JHS", level_order=1)
        self.room = Room.objects.create(name="Room 101", building="Main Building", capacity=45)
        self.subject = Subject.objects.create(code="MATH7", title="Mathematics 7", grade_level=self.grade, units=1)
        self.section = Section.objects.create(
            school_year=self.school_year,
            grade_level=self.grade,
            adviser=self.faculty_profile,
            room=self.room,
            room_number="Room 101",
            name="Diamond",
            capacity=45,
        )
        self.period = ClassPeriod.objects.create(
            section=self.section,
            subject=self.subject,
            teacher=self.faculty_profile,
            room=self.room,
            room_number="Room 101",
            start_time=time(7, 30),
            end_time=time(8, 30),
            days_of_week="MON-FRI",
        )
        self.student = Student.objects.create(
            lrn="127901260001",
            first_name="Juan",
            last_name="Santos",
            sex="Male",
            birthdate=date(2013, 5, 10),
            parent_user=self.parent_user,
            parent_contact="+639171112222",
            qr_token="QR-TEST-STU-001",
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            section=self.section,
            school_year=self.school_year,
            status="ENROLLED",
        )
        self.school_settings = SchoolSettings.objects.create(
            school_id="304100",
            school_name="AttendSure National High School",
            region="Region X",
            division="Cagayan de Oro City",
            district="Central District",
            academic_year="2026-2027",
            address="Main Campus Avenue",
            contact_number="+639170000000",
            email="office@attendsure.edu",
            latitude=8.4858,
            longitude=124.6567,
            geofence_radius_meters=200,
        )

    def test_01_auth_profile_validation_device_reset_and_unlock(self):
        # Login & JWT/Token issuance
        res = self.client.post("/api/v1/accounts/login/", {"username": "crud_admin", "password": "AttendSure2026!"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertIn("token", res.data)

        self.client.force_authenticate(user=self.admin_user)

        # GET / PATCH /me/
        me_get = self.client.get("/api/v1/accounts/me/")
        self.assertEqual(me_get.status_code, 200)
        self.assertEqual(me_get.data["username"], "crud_admin")

        me_patch = self.client.patch("/api/v1/accounts/me/", {"first_name": "Lead", "department": "Executive"}, format="json")
        self.assertEqual(me_patch.status_code, 200)
        self.assertEqual(me_patch.data["first_name"], "Lead")

        # Validate field
        val = self.client.get("/api/v1/accounts/validate-field/", {"field": "username", "value": "crud_admin"})
        self.assertEqual(val.status_code, 200)
        self.assertTrue(val.data["is_taken"])

        # Register mobile push token
        pt = self.client.post("/api/v1/accounts/push-token/", {"push_token": "ExponentPushToken[test123]"}, format="json")
        self.assertEqual(pt.status_code, 200)
        self.assertTrue(pt.data["registered"])

        # Reset device binding
        reset_res = self.client.post(f"/api/v1/accounts/reset-device/{self.faculty_profile.id}/", {}, format="json")
        self.assertEqual(reset_res.status_code, 200)
        self.faculty_profile.refresh_from_db()
        self.assertIsNone(self.faculty_profile.bound_device_id)

        # Unlock accounts
        unlock_res = self.client.post("/api/v1/accounts/unlock-accounts/", {}, format="json")
        self.assertEqual(unlock_res.status_code, 200)
        self.assertTrue(unlock_res.data["ok"])

        # Audit logs read
        logs_res = self.client.get("/api/v1/accounts/audit-logs/")
        self.assertEqual(logs_res.status_code, 200)
        self.assertIn("records", logs_res.data)

    def test_02_faculty_and_users_full_crud(self):
        self.client.force_authenticate(user=self.admin_user)

        # Faculty CRUD (/v1/accounts/faculty/)
        create_f = self.client.post(
            "/api/v1/accounts/faculty/",
            {
                "employee_id": "EMP-NEW-99",
                "first_name": "Carlos",
                "last_name": "Mendoza",
                "email": "carlos@attendsure.edu",
                "department": "Science",
                "position": "Faculty II",
            },
            format="json",
        )
        self.assertEqual(create_f.status_code, 201)
        fid = create_f.data["id"]

        self.assertEqual(self.client.get("/api/v1/accounts/faculty/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/accounts/faculty/dropdown/").status_code, 200)

        upd_f = self.client.patch(f"/api/v1/accounts/faculty/{fid}/", {"position": "Master Faculty I"}, format="json")
        self.assertEqual(upd_f.status_code, 200)
        self.assertEqual(upd_f.data["position"], "Master Faculty I")

        del_f = self.client.delete(f"/api/v1/accounts/faculty/{fid}/")
        self.assertEqual(del_f.status_code, 204)

        # Users CRUD (/v1/accounts/users/) + self-delete guard
        create_u = self.client.post(
            "/api/v1/accounts/users/",
            {
                "username": "temp_staff_user",
                "password": "TempPassword2026!",
                "first_name": "Ana",
                "last_name": "Cruz",
                "email": "ana@attendsure.edu",
                "employee_id": "EMP-ANA-01",
                "role": "FACULTY",
                "is_teaching": True,
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

        # Self-delete must be blocked with 400
        self_del = self.client.delete(f"/api/v1/accounts/users/{self.admin_user.id}/")
        self.assertEqual(self_del.status_code, 400)

        # Deleting other user succeeds
        self.assertEqual(self.client.delete(f"/api/v1/accounts/users/{uid}/").status_code, 204)

    def test_03_school_structure_and_holidays_full_crud(self):
        # Public branding works without auth
        pub = self.client.get("/api/v1/school/public-branding/")
        self.assertEqual(pub.status_code, 200)
        self.assertEqual(pub.data["school_name"], "AttendSure National High School")

        self.client.force_authenticate(user=self.admin_user)

        # School Settings GET / PUT / DELETE logo
        self.assertEqual(self.client.get("/api/v1/school/settings/").status_code, 200)
        upd_set = self.client.put(
            "/api/v1/school/settings/",
            {"school_name": "AttendSure Science High", "geofence_radius_meters": 250},
            format="json",
        )
        self.assertEqual(upd_set.status_code, 200)
        self.assertEqual(upd_set.data["school_name"], "AttendSure Science High")

        del_logo = self.client.delete("/api/v1/school/settings/?field=school_logo")
        self.assertEqual(del_logo.status_code, 200)

        # School Years CRUD
        sy_c = self.client.post(
            "/api/v1/school/school-years/",
            {"code": "2027-2028", "start_date": "2027-06-01", "baseline_cutoff_date": "2027-06-05", "end_date": "2028-03-31", "is_active": False},
            format="json",
        )
        self.assertEqual(sy_c.status_code, 201)
        sy_id = sy_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/school-years/{sy_id}/", {"end_date": "2028-04-15"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/school-years/{sy_id}/").status_code, 204)

        # Grade Levels CRUD
        g_c = self.client.post("/api/v1/school/grade-levels/", {"code": "G8", "name": "Grade 8", "stage": "JHS", "level_order": 2}, format="json")
        self.assertEqual(g_c.status_code, 201)
        gid = g_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/grade-levels/{gid}/", {"name": "Grade 8 JHS"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/grade-levels/{gid}/").status_code, 204)

        # Rooms CRUD
        r_c = self.client.post("/api/v1/school/rooms/", {"name": "Lab 202", "building": "Science Wing", "capacity": 40}, format="json")
        self.assertEqual(r_c.status_code, 201)
        rid = r_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/rooms/{rid}/", {"capacity": 50}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/rooms/{rid}/").status_code, 204)

        # Subjects CRUD
        sub_c = self.client.post("/api/v1/school/subjects/", {"code": "SCI7", "title": "Science 7", "units": 2}, format="json")
        self.assertEqual(sub_c.status_code, 201)
        sub_id = sub_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/subjects/{sub_id}/", {"title": "General Science 7"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/subjects/{sub_id}/").status_code, 204)

        # Sections CRUD
        sec_c = self.client.post(
            "/api/v1/school/sections/",
            {"name": "Emerald", "grade_level": self.grade.id, "adviser": self.faculty_profile.id, "room_number": "Room 102"},
            format="json",
        )
        self.assertEqual(sec_c.status_code, 201)
        sec_id = sec_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/sections/{sec_id}/", {"capacity": 50}, format="json").status_code, 200)

        # Class Periods CRUD
        per_c = self.client.post(
            "/api/v1/school/periods/",
            {
                "section": sec_id,
                "subject": self.subject.id,
                "faculty_id": self.faculty_profile.id,
                "start_time": "09:00",
                "end_time": "10:00",
                "days_of_week": "MON-FRI",
            },
            format="json",
        )
        self.assertEqual(per_c.status_code, 201)
        per_id = per_c.data["id"]
        self.assertEqual(self.client.patch(f"/api/v1/school/periods/{per_id}/", {"end_time": "10:15"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/school/periods/{per_id}/").status_code, 204)
        self.assertEqual(self.client.delete(f"/api/v1/school/sections/{sec_id}/").status_code, 204)

        # School Holidays CRUD + Partial PATCH + Collection PATCH (Weekend Rest toggle)
        wk = self.client.patch("/api/v1/school/holidays/", {"weekend_rest_enabled": False}, format="json")
        self.assertEqual(wk.status_code, 200)
        self.assertFalse(wk.data["weekend_rest_enabled"])
        wk_legacy = self.client.patch("/api/calendar/exceptions/", {"weekend_rest_enabled": True}, format="json")
        self.assertEqual(wk_legacy.status_code, 200)
        self.assertTrue(wk_legacy.data["weekend_rest_enabled"])

        hol_c = self.client.post(
            "/api/v1/school/holidays/",
            {"date": "2026-08-31", "type": "HOLIDAY", "reason": "National Heroes Day"},
            format="json",
        )
        self.assertEqual(hol_c.status_code, 201)
        hid = hol_c.data["id"]
        # Partial PATCH updating only date must succeed!
        hol_p = self.client.patch(f"/api/v1/school/holidays/{hid}/", {"date": "2026-09-01"}, format="json")
        self.assertEqual(hol_p.status_code, 200)
        self.assertEqual(hol_p.data["date"], "2026-09-01")
        self.assertEqual(hol_p.data["reason"], "National Heroes Day")
        self.assertEqual(self.client.delete(f"/api/v1/school/holidays/{hid}/").status_code, 204)

    def test_04_students_enrollments_and_parent_portal_crud(self):
        self.client.force_authenticate(user=self.admin_user)

        st_c = self.client.post(
            "/api/v1/students/",
            {
                "lrn": "127901260099",
                "first_name": "Liza",
                "last_name": "Diaz",
                "sex": "F",
                "birthdate": "2013-07-15",
                "section_id": self.section.id,
                "parent_contact": "09179998888",
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

        # Enrollments CRUD
        enr_list = self.client.get("/api/v1/students/enrollments/")
        self.assertEqual(enr_list.status_code, 200)
        enr = Enrollment.objects.get(student_id=st_id)
        self.assertEqual(self.client.patch(f"/api/v1/students/enrollments/{enr.id}/", {"remarks": "Verified"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/students/enrollments/{enr.id}/").status_code, 204)

        self.assertEqual(self.client.delete(f"/api/v1/students/{st_id}/").status_code, 204)

        # Parent Portal
        self.client.force_authenticate(user=self.parent_user)
        portal = self.client.get("/api/v1/students/parent-portal/")
        self.assertEqual(portal.status_code, 200)

    def test_05_attendance_qr_scan_offline_sync_manual_crud_and_exit_passes(self):
        self.client.force_authenticate(user=self.faculty_user)

        # Signed QR Scan
        signed_qr = sign_student_qr(self.student.lrn, self.student.qr_token)
        scan = self.client.post(
            "/api/v1/attendance/scan/",
            {"qr_text": signed_qr, "schedule_id": self.period.id},
            format="json",
        )
        self.assertEqual(scan.status_code, 201)
        self.assertTrue(scan.data["ok"])

        # Offline Queue Sync (duplicate handling)
        sync = self.client.post(
            "/api/v1/attendance/offline-sync/",
            {"scans": [{"qr_token": signed_qr, "schedule_id": self.period.id, "scanned_at": timezone.now().isoformat()}]},
            format="json",
        )
        self.assertEqual(sync.status_code, 200)
        self.assertEqual(sync.data["duplicate_count"], 1)

        # Assigned classes & adviser matrix
        classes = self.client.get("/api/v1/attendance/classes/")
        self.assertEqual(classes.status_code, 200)
        self.assertTrue(len(classes.data) >= 1)
        self.assertIsNotNone(classes.data[0]["students"][0]["attendance_record_id"])

        matrix = self.client.get("/api/v1/attendance/adviser-matrix/")
        self.assertEqual(matrix.status_code, 200)

        # Attendance Records Read / Update / Delete + Parent RBAC block
        recs = self.client.get("/api/v1/attendance/records/")
        self.assertEqual(recs.status_code, 200)
        rec_id = recs.data["records"][0]["id"]

        upd_rec = self.client.put("/api/v1/attendance/records/", {"id": rec_id, "status": "EXCUSED"}, format="json")
        self.assertEqual(upd_rec.status_code, 200)
        self.assertEqual(upd_rec.data["status"], "EXCUSED")

        # Parent cannot delete attendance record
        self.client.force_authenticate(user=self.parent_user)
        parent_del = self.client.delete(f"/api/v1/attendance/records/?id={rec_id}")
        self.assertEqual(parent_del.status_code, 403)

        # Faculty can delete attendance record
        self.client.force_authenticate(user=self.faculty_user)
        del_rec = self.client.delete(f"/api/v1/attendance/records/?id={rec_id}")
        self.assertEqual(del_rec.status_code, 200)

        # Re-create manual attendance
        man_c = self.client.post(
            "/api/v1/attendance/records/",
            {"student_id": self.student.id, "schedule_id": self.period.id, "status": "PRESENT"},
            format="json",
        )
        self.assertEqual(man_c.status_code, 201)

        # Exit Passes full CRUD + Approve / Decline / Mark Used + PATCH preserves valid window
        now = timezone.now()
        ep_c = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "bearer_type": "FACULTY",
                "pass_type": "Official Travel",
                "reason": "Division Math Seminar",
                "valid_from": now.isoformat(),
                "valid_until": (now + timedelta(hours=3)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(ep_c.status_code, 201)
        ep_id = ep_c.data["id"]
        orig_valid_until = ep_c.data["valid_until"]

        # Partial PATCH updating only reason must preserve valid_until
        ep_p = self.client.patch(f"/api/v1/attendance/exit-passes/{ep_id}/", {"reason": "Updated Seminar Location"}, format="json")
        self.assertEqual(ep_p.status_code, 200)
        self.assertEqual(ep_p.data["reason"], "Updated Seminar Location")
        self.assertEqual(ep_p.data["valid_until"], orig_valid_until)

        # Admin approves & marks used
        self.client.force_authenticate(user=self.admin_user)
        self.assertEqual(self.client.post(f"/api/v1/attendance/exit-passes/{ep_id}/approve/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/attendance/exit-passes/{ep_id}/mark-used/").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/attendance/exit-passes/{ep_id}/").status_code, 204)

    def test_06_campus_gps_messaging_chat_and_reports_full_crud(self):
        # Campus Boundary + Faculty Check-In + Audit + Anomalies + Emergency Roll-Call
        self.client.force_authenticate(user=self.admin_user)
        b_put = self.client.put(
            "/api/v1/campus/boundary/",
            {"name": "Main Campus", "latitude": 8.4858, "longitude": 124.6567, "radius_meters": 220},
            format="json",
        )
        self.assertEqual(b_put.status_code, 200)
        self.assertEqual(b_put.data["radius_meters"], 220)

        self.client.force_authenticate(user=self.faculty_user)
        # Mismatched phone hardware ID must be rejected (1-to-1 device binding)
        bad_dev = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy": 10,
                "battery_level": 88,
                "face_verified": True,
                "liveness_passed": True,
                "client_device_id": "DEV-WRONG-999",
            },
            format="json",
        )
        self.assertEqual(bad_dev.status_code, 403)

        # Bound phone hardware ID succeeds
        chk = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy": 10,
                "battery_level": 88,
                "face_verified": True,
                "liveness_passed": True,
                "client_device_id": "DEV-ORIG-001",
            },
            format="json",
        )
        self.assertEqual(chk.status_code, 201)
        self.assertTrue(chk.data["is_inside_geofence"])

        self.assertEqual(self.client.get("/api/v1/campus/audit/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/campus/anomalies/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/campus/roll-call/").status_code, 200)

        # Parent must be blocked from emergency roll-call
        self.client.force_authenticate(user=self.parent_user)
        self.assertEqual(self.client.get("/api/v1/campus/roll-call/").status_code, 403)

        # Push Notifications Broadcast + Read + Update + Mark-Read + Delete
        self.client.force_authenticate(user=self.admin_user)
        notif_c = self.client.post(
            "/api/v1/messaging/notifications/",
            {
                "title": "Early Dismissal",
                "message": "Classes end at 3:00 PM today.",
                "category": "ANNOUNCEMENT",
                "target_role": "PARENT",
            },
            format="json",
        )
        self.assertEqual(notif_c.status_code, 201)
        self.assertGreaterEqual(notif_c.data["dispatched_count"], 1)
        nid = notif_c.data["id"]

        notif_list = self.client.get("/api/v1/messaging/notifications/", {"scope": "all"})
        self.assertEqual(notif_list.status_code, 200)

        notif_u = self.client.patch(
            f"/api/v1/messaging/notifications/{nid}/",
            {"title": "Early Dismissal (Updated)"},
            format="json",
        )
        self.assertEqual(notif_u.status_code, 200)
        self.assertEqual(notif_u.data["title"], "Early Dismissal (Updated)")

        self.client.force_authenticate(user=self.parent_user)
        mr = self.client.post("/api/v1/messaging/notifications/mark-read/", {"ids": [nid]}, format="json")
        self.assertEqual(mr.status_code, 200)

        self.client.force_authenticate(user=self.admin_user)
        self.assertEqual(self.client.delete(f"/api/v1/messaging/notifications/{nid}/").status_code, 204)

        # Parent-Faculty Chat full CRUD
        self.client.force_authenticate(user=self.faculty_user)
        threads = self.client.get("/api/v1/messaging/threads/")
        self.assertEqual(threads.status_code, 200)

        msg_c = self.client.post(
            "/api/v1/messaging/messages/",
            {"student_id": self.student.id, "faculty_id": self.faculty_profile.id, "body": "Hello parent!"},
            format="json",
        )
        self.assertEqual(msg_c.status_code, 201)
        mid = msg_c.data["id"]

        msg_u = self.client.put("/api/v1/messaging/messages/", {"id": mid, "body": "Hello parent, updated!"}, format="json")
        self.assertEqual(msg_u.status_code, 200)
        self.assertEqual(msg_u.data["body"], "Hello parent, updated!")

        # Invalid message ID returns clean 400
        self.assertEqual(self.client.delete("/api/v1/messaging/messages/?id=invalid").status_code, 400)
        self.assertEqual(self.client.delete(f"/api/v1/messaging/messages/?id={mid}").status_code, 200)

        # All Reports, Analytics, DTR Actions, Health & Cache Maintenance
        self.client.force_authenticate(user=self.admin_user)
        now = timezone.localdate()
        self.assertEqual(self.client.get("/api/v1/reports/dashboard/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/sf1/", {"section_id": self.section.id}).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/sf2/", {"section_id": self.section.id, "month": now.month, "year": now.year}).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/sf4/", {"month": now.month, "year": now.year}).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/dtr/", {"faculty_id": self.faculty_profile.id, "month": now.month, "year": now.year}).status_code, 200)

        # DTR submit & approve actions
        dtr_sub = self.client.post(
            "/api/v1/reports/dtr/",
            {"action": "SUBMIT_DTR", "faculty_id": self.faculty_profile.id, "month": now.month, "year": now.year, "regular_hours": "8:00 AM - 5:00 PM"},
            format="json",
        )
        self.assertEqual(dtr_sub.status_code, 200)
        dtr_app = self.client.post(
            "/api/v1/reports/dtr/",
            {"action": "APPROVE_DEPT_HEAD", "faculty_id": self.faculty_profile.id, "month": now.month, "year": now.year},
            format="json",
        )
        self.assertEqual(dtr_app.status_code, 200)

        self.assertEqual(self.client.get("/api/v1/reports/export/", {"type": "sf1", "section_id": self.section.id}).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/reports/edfi-export/").status_code, 200)
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
        self.assertEqual(self.client.post("/api/v1/reports/system-status/", {"action": "RETRY_FAILED"}, format="json").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/health/db/").status_code, 200)
        self.assertEqual(self.client.post("/api/v1/cache/flush/").status_code, 200)
