"""
AttendSure V3 - Full CRUD Verification Suite
File: D:\\AttendSure_V3\\scripts\\test_cruds.py
"""

import os
import sys
from pathlib import Path

# Initialize Django environment first
SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

import django
django.setup()

import secrets
import unittest
from datetime import date
from django.db import transaction
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.academics.models import (
    AcademicYear,
    GradeLevel,
    Section,
    Subject,
    FacultyProfile,
    UserProfile,
    Student,
    Schedule,
    IoTKiosk,
    GatePass,
    SmsOutbox,
)

User = get_user_model()


class FullCRUDVerificationTests(unittest.TestCase):
    def setUp(self):
        self.tx = transaction.atomic()
        self.tx.__enter__()

        self.client = APIClient()
        token = secrets.token_hex(4)
        username = f"tester_{token}"
        self.admin = User.objects.create_superuser(
            username=username,
            email=f"{username}@attendsure.edu.ph",
            password="StrongPassword123!"
        )

        self.admin_profile, _ = UserProfile.objects.get_or_create(user=self.admin)
        self.admin_profile.role = "ADMIN"
        self.admin_profile.save(update_fields=['role'])

        self.client.force_authenticate(user=self.admin)

        self.ay = AcademicYear.objects.filter(is_active=True).first()
        if not self.ay:
            self.ay = AcademicYear.objects.create(
                code=f"SY-{token.upper()}",
                start_date=date(2026, 6, 1),
                first_friday_june=date(2026, 6, 5),
                end_date=date(2027, 3, 31),
                is_active=True
            )

    def tearDown(self):
        transaction.set_rollback(True)
        self.tx.__exit__(None, None, None)

    # 1. GRADE LEVELS CRUD
    def test_grade_levels_crud(self):
        code = f"GL_{secrets.token_hex(2).upper()}"
        res = self.client.post("/api/grade-levels/", {"code": code, "name": f"Grade {code}", "level_order": 8})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        gl_id = res.data["id"]

        self.assertEqual(self.client.get("/api/grade-levels/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/grade-levels/{gl_id}/", {"name": f"Grade {code} Renamed"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/grade-levels/{gl_id}/").status_code, status.HTTP_204_NO_CONTENT)

    # 2. SUBJECTS CRUD
    def test_subjects_crud(self):
        code = f"SUB_{secrets.token_hex(2).upper()}"
        res = self.client.post("/api/subjects/", {"code": code, "title": f"Subject {code}", "units": 4})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sub_id = res.data["id"]

        self.assertEqual(self.client.get(f"/api/subjects/{sub_id}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/subjects/{sub_id}/", {"title": f"Advanced {code}"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/subjects/{sub_id}/").status_code, status.HTTP_204_NO_CONTENT)

    # 3. SECTIONS CRUD
    def test_sections_crud(self):
        gl = GradeLevel.objects.first() or GradeLevel.objects.create(
            code=f"G_{secrets.token_hex(2).upper()}", name="Grade Test", level_order=7
        )
        sec_name = f"Sec_{secrets.token_hex(3)}"
        res = self.client.post("/api/sections/", {
            "name": sec_name,
            "grade_level": gl.id,
            "academic_year": self.ay.id,
            "room_number": "101",
            "capacity": 45
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sec_id = res.data["id"]

        self.assertEqual(self.client.get(f"/api/sections/{sec_id}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/sections/{sec_id}/", {"room_number": "202"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/sections/{sec_id}/").status_code, status.HTTP_204_NO_CONTENT)

    # 4. FACULTY PROFILES CRUD & DROPDOWN
    def test_faculty_crud_and_dropdown(self):
        emp_id = f"EMP-{secrets.token_hex(3).upper()}"
        rfid = f"RFID-{secrets.token_hex(4).upper()}"
        res = self.client.post("/api/faculty/", {
            "employee_id": emp_id,
            "first_name": "Maria",
            "last_name": "Santos",
            "department": "JHS",
            "position": "Faculty I",
            "rfid_uid": rfid
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        fac_id = res.data["id"]

        self.assertEqual(self.client.get("/api/faculty/dropdown/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/faculty/{fac_id}/", {"position": "Head Faculty I"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/faculty/{fac_id}/").status_code, status.HTTP_204_NO_CONTENT)

    # 5. STUDENTS CRUD & DROPDOWN
    def test_students_crud_and_dropdown(self):
        lrn = f"99{secrets.randbelow(8999999999) + 1000000000}"
        res = self.client.post("/api/students/", {
            "lrn": lrn,
            "first_name": "Jose",
            "last_name": "Rizal",
            "sex": "Male",
            "birthdate": "2012-06-19",
            "parent_contact": "09181234567"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        stu_id = res.data["id"]

        self.assertEqual(self.client.get("/api/students/dropdown/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/students/{stu_id}/", {"barangay": "Lapasan"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/students/{stu_id}/").status_code, status.HTTP_204_NO_CONTENT)

    # 6. SCHEDULES CRUD
    def test_schedules_crud(self):
        gl = GradeLevel.objects.first() or GradeLevel.objects.create(code=f"G_{secrets.token_hex(2).upper()}", name="Grade 9", level_order=9)
        sec = Section.objects.create(name=f"Sec_{secrets.token_hex(3)}", grade_level=gl, academic_year=self.ay)
        sub = Subject.objects.create(code=f"MATH_{secrets.token_hex(2).upper()}", title="Mathematics 9")
        fac = FacultyProfile.objects.create(employee_id=f"FAC_{secrets.token_hex(3).upper()}", first_name="Ana", last_name="Cruz")

        res = self.client.post("/api/schedules/", {
            "section": sec.id,
            "subject": sub.id,
            "faculty": fac.id,
            "start_time": "08:00:00",
            "end_time": "09:00:00",
            "room_number": "Room 301"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sched_id = res.data["id"]

        self.assertEqual(self.client.get(f"/api/schedules/{sched_id}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/schedules/{sched_id}/", {"room_number": "Room 302"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/schedules/{sched_id}/").status_code, status.HTTP_204_NO_CONTENT)

    # 7. IOT KIOSKS & SCANNERS CRUD
    def test_kiosks_crud(self):
        code = f"KIO-{secrets.token_hex(3).upper()}"
        res = self.client.post("/api/kiosks/", {
            "kiosk_code": code,
            "terminal_name": "Gate Kiosk Test",
            "secret_hash": "rawsecret123",
            "location": "Main Campus Gate"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        kiosk_id = res.data["id"]

        self.assertEqual(self.client.get(f"/api/kiosks/{kiosk_id}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/kiosks/{kiosk_id}/", {"terminal_name": "North Gate"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/kiosks/{kiosk_id}/").status_code, status.HTTP_204_NO_CONTENT)

    # 8. GATE PASSES CRUD
    def test_gate_passes_crud(self):
        fac = FacultyProfile.objects.create(employee_id=f"FAC_{secrets.token_hex(3).upper()}", first_name="Pedro", last_name="Penduko")
        pass_num = f"GP-{secrets.token_hex(4).upper()}"
        res = self.client.post("/api/gate-passes/", {
            "pass_number": pass_num,
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

        self.assertEqual(self.client.get(f"/api/gate-passes/{pass_id}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/gate-passes/{pass_id}/", {"status": "USED"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/gate-passes/{pass_id}/").status_code, status.HTTP_204_NO_CONTENT)

    # 9. SMS OUTBOX CRUD & METRICS
    def test_sms_outbox_crud_and_metrics(self):
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

        self.assertEqual(self.client.get(f"/api/sms-outbox/{sms_id}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get("/api/sms-outbox/metrics/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/sms-outbox/{sms_id}/", {"status": "SENT"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/sms-outbox/{sms_id}/").status_code, status.HTTP_204_NO_CONTENT)

    # 10. USER MANAGEMENT CRUD & /api/me/
    def test_users_crud_and_me_endpoint(self):
        self.assertEqual(self.client.get("/api/me/").status_code, status.HTTP_200_OK)

        new_username = f"guard_{secrets.token_hex(4)}"
        res = self.client.post("/api/users/", {
            "username": new_username,
            "first_name": "Security",
            "last_name": "Officer",
            "role": "GUARD",
            "password": "GuardPassword123!"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_user_id = res.data["id"]

        self.assertEqual(self.client.get(f"/api/users/{new_user_id}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.patch(f"/api/users/{new_user_id}/", {"first_name": "Chief Security"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/users/{new_user_id}/").status_code, status.HTTP_204_NO_CONTENT)


if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(FullCRUDVerificationTests)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)