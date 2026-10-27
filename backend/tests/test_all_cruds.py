"""
AttendSure V3 - Full CRUD Verification Suite
File: backend/tests/test_all_cruds.py
"""

from datetime import date, time
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from apps.academics.models import (
    AcademicYear,
    GradeLevel,
    Section,
    Subject,
    FacultyProfile,
    UserProfile,
    Student,
)

User = get_user_model()


class FullCRUDVerificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Base Administrator User & Profile
        self.admin = User.objects.create_superuser(
            username="admin_tester",
            email="admin@attendsure.edu.ph",
            password="StrongPassword123!"
        )
        self.admin_profile = UserProfile.objects.create(
            user=self.admin,
            role="ADMIN"
        )
        self.client.force_authenticate(user=self.admin)

        # 2. Active School Year
        self.ay = AcademicYear.objects.create(
            code="2026-2027",
            start_date=date(2026, 6, 1),
            first_friday_june=date(2026, 6, 5),
            end_date=date(2027, 3, 31),
            is_active=True
        )

    # =========================================================================
    # 1. GRADE LEVELS CRUD
    # =========================================================================
    def test_grade_levels_crud(self):
        # CREATE
        res = self.client.post("/api/grade-levels/", {
            "code": "G8",
            "name": "Grade 8",
            "level_order": 8
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        gl_id = res.data["id"]

        # READ (List & Detail)
        res = self.client.get("/api/grade-levels/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        res = self.client.get(f"/api/grade-levels/{gl_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["code"], "G8")

        # UPDATE
        res = self.client.patch(f"/api/grade-levels/{gl_id}/", {"name": "Grade 8 - Updated"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["name"], "Grade 8 - Updated")

        # DELETE
        res = self.client.delete(f"/api/grade-levels/{gl_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 2. SUBJECTS CRUD
    # =========================================================================
    def test_subjects_crud(self):
        # CREATE
        res = self.client.post("/api/subjects/", {
            "code": "ENG7",
            "title": "English 7",
            "units": 4
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sub_id = res.data["id"]

        # READ
        res = self.client.get(f"/api/subjects/{sub_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # UPDATE
        res = self.client.patch(f"/api/subjects/{sub_id}/", {"title": "Advanced English 7"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["title"], "Advanced English 7")

        # DELETE
        res = self.client.delete(f"/api/subjects/{sub_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 3. SECTIONS CRUD
    # =========================================================================
    def test_sections_crud(self):
        gl = GradeLevel.objects.create(code="G7", name="Grade 7", level_order=7)

        # CREATE
        res = self.client.post("/api/sections/", {
            "name": "Diamond",
            "grade_level_id": gl.id,
            "room_number": "Room 101",
            "capacity": 45
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sec_id = res.data["id"]

        # READ
        res = self.client.get(f"/api/sections/{sec_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # UPDATE
        res = self.client.patch(f"/api/sections/{sec_id}/", {"room_number": "Room 202"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # DELETE
        res = self.client.delete(f"/api/sections/{sec_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 4. FACULTY PROFILES CRUD & DROPDOWN
    # =========================================================================
    def test_faculty_crud_and_dropdown(self):
        # CREATE
        res = self.client.post("/api/faculty/", {
            "employee_id": "EMP-9001",
            "first_name": "Maria",
            "last_name": "Santos",
            "department": "Junior High School",
            "position": "Faculty I",
            "rfid_uid": "FAC9001RFID"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        fac_id = res.data["id"]

        # READ (Singular and Pluralized Route Aliases)
        res_singular = self.client.get(f"/api/faculty/{fac_id}/")
        self.assertEqual(res_singular.status_code, status.HTTP_200_OK)

        res_plural = self.client.get("/api/facultys/")
        self.assertEqual(res_plural.status_code, status.HTTP_200_OK)

        # READ (Dropdown Action)
        res_dropdown = self.client.get("/api/faculty/dropdown/")
        self.assertEqual(res_dropdown.status_code, status.HTTP_200_OK)
        self.assertTrue(any(f["id"] == fac_id for f in res_dropdown.data))

        # UPDATE
        res = self.client.patch(f"/api/faculty/{fac_id}/", {"position": "Head Faculty I"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["position"], "Head Faculty I")

        # DELETE
        res = self.client.delete(f"/api/faculty/{fac_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 5. STUDENTS CRUD & DROPDOWN
    # =========================================================================
    def test_students_crud_and_dropdown(self):
        # CREATE
        res = self.client.post("/api/students/", {
            "lrn": "123456789099",
            "first_name": "Jose",
            "last_name": "Rizal",
            "sex": "Male",
            "birthdate": "2012-06-19",
            "parent_contact": "09181234567",
            "rfid_uid": "STU99RFID"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        stu_id = res.data["id"]

        # READ (Detail and List)
        res = self.client.get(f"/api/students/{stu_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # READ (Dropdown Action)
        res_dropdown = self.client.get("/api/students/dropdown/")
        self.assertEqual(res_dropdown.status_code, status.HTTP_200_OK)
        self.assertTrue(any(s["id"] == stu_id for s in res_dropdown.data))

        # UPDATE
        res = self.client.patch(f"/api/students/{stu_id}/", {"barangay": "Lapasan"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # DELETE
        res = self.client.delete(f"/api/students/{stu_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 6. SCHEDULES CRUD
    # =========================================================================
    def test_schedules_crud(self):
        gl = GradeLevel.objects.create(code="G9", name="Grade 9", level_order=9)
        sec = Section.objects.create(name="Emerald", grade_level=gl, academic_year=self.ay)
        sub = Subject.objects.create(code="MATH9", title="Mathematics 9")
        fac = FacultyProfile.objects.create(employee_id="FAC-MATH", first_name="Ana", last_name="Cruz")

        # CREATE
        res = self.client.post("/api/schedules/", {
            "section": sec.id,
            "subject": sub.id,
            "faculty": fac.id,
            "start_time": "08:00:00",
            "end_time": "09:00:00",
            "room_number": "Room 301",
            "days_of_week": "MON-FRI"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sched_id = res.data["id"]

        # READ
        res = self.client.get(f"/api/schedules/{sched_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # UPDATE
        res = self.client.patch(f"/api/schedules/{sched_id}/", {"room_number": "Room 302"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # DELETE
        res = self.client.delete(f"/api/schedules/{sched_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 7. IOT KIOSKS & SCANNERS CRUD
    # =========================================================================
    def test_kiosks_crud(self):
        # CREATE
        res = self.client.post("/api/kiosks/", {
            "kiosk_code": "KIOSK-GATE-TEST",
            "terminal_name": "Gate Kiosk 1",
            "secret_hash": "rawsecret123",
            "location": "Main Campus Gate"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        kiosk_id = res.data["id"]

        # READ (Singular and Alias Route)
        res_kiosk = self.client.get(f"/api/kiosks/{kiosk_id}/")
        self.assertEqual(res_kiosk.status_code, status.HTTP_200_OK)

        res_scanner = self.client.get("/api/scanners/")
        self.assertEqual(res_scanner.status_code, status.HTTP_200_OK)

        # UPDATE
        res = self.client.patch(f"/api/kiosks/{kiosk_id}/", {"terminal_name": "Gate Kiosk North"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # DELETE
        res = self.client.delete(f"/api/kiosks/{kiosk_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 8. GATE PASSES CRUD
    # =========================================================================
    def test_gate_passes_crud(self):
        fac = FacultyProfile.objects.create(employee_id="FAC-PASS", first_name="Pedro", last_name="Penduko")

        # CREATE
        res = self.client.post("/api/gate-passes/", {
            "pass_number": "PASS-2026-001",
            "faculty": fac.id,
            "issued_by": fac.id,
            "pass_type": "Official Exit Permit",
            "reason": "Department Seminar",
            "valid_from": "2026-10-27T08:00:00Z",
            "valid_to": "2026-10-27T17:00:00Z",
            "status": "ACTIVE"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        pass_id = res.data["id"]

        # READ
        res = self.client.get(f"/api/gate-passes/{pass_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # UPDATE
        res = self.client.patch(f"/api/gate-passes/{pass_id}/", {"status": "USED"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # DELETE
        res = self.client.delete(f"/api/gate-passes/{pass_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 9. SMS OUTBOX CRUD & METRICS
    # =========================================================================
    def test_sms_outbox_crud_and_metrics(self):
        # CREATE
        res = self.client.post("/api/sms-outbox/", {
            "recipient_name": "Maria's Mother",
            "recipient_number": "09170001111",
            "message_body": "Your child has arrived at school.",
            "trigger_event": "GATE_IN",
            "priority": "HIGH",
            "status": "PENDING"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sms_id = res.data["id"]

        # READ
        res = self.client.get(f"/api/sms-outbox/{sms_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # READ (Metrics Action Endpoint)
        res_metrics = self.client.get("/api/sms-outbox/metrics/")
        self.assertEqual(res_metrics.status_code, status.HTTP_200_OK)
        self.assertIn("sent_today", res_metrics.data)
        self.assertIn("pending_total", res_metrics.data)

        # UPDATE
        res = self.client.patch(f"/api/sms-outbox/{sms_id}/", {"status": "SENT"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # DELETE
        res = self.client.delete(f"/api/sms-outbox/{sms_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 10. USER MANAGEMENT CRUD & CURRENT USER
    # =========================================================================
    def test_users_crud_and_me_endpoint(self):
        # READ current user (/api/me/ alias)
        res_me = self.client.get("/api/me/")
        self.assertEqual(res_me.status_code, status.HTTP_200_OK)
        self.assertEqual(res_me.data["username"], "admin_tester")

        # CREATE
        res = self.client.post("/api/users/", {
            "username": "guard_station",
            "first_name": "Security",
            "last_name": "Officer",
            "role": "GUARD",
            "password": "GuardPassword123!"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_user_id = res.data["id"]

        # READ
        res = self.client.get(f"/api/users/{new_user_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # UPDATE
        res = self.client.patch(f"/api/users/{new_user_id}/", {"first_name": "Chief Security"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # DELETE
        res = self.client.delete(f"/api/users/{new_user_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)