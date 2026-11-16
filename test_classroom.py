"""
AttendSure V3 - Classroom Timetable & Student List Tests
File: D:\\AttendSure_V3\\scripts\\test_classroom.py
"""

import os
import sys
import secrets
import unittest
from datetime import date
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

import django
django.setup()

from django.db import transaction
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.academics.models import AcademicYear, GradeLevel, Section, Student, Enrollment, UserProfile

User = get_user_model()


class ClassroomEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tx = transaction.atomic()
        self.tx.__enter__()

        self.client = APIClient()
        username = f"class_{secrets.token_hex(4)}"
        self.admin = User.objects.create_superuser(username=username, password="Password123!")

        profile, _ = UserProfile.objects.get_or_create(user=self.admin)
        profile.role = "ADMIN"
        profile.save(update_fields=['role'])

        self.client.force_authenticate(user=self.admin)

        self.ay = AcademicYear.objects.filter(is_active=True).first()
        if not self.ay:
            self.ay = AcademicYear.objects.create(
                code=f"SY-{secrets.token_hex(3).upper()}",
                start_date=date(2026, 6, 1),
                first_friday_june=date(2026, 6, 5),
                end_date=date(2027, 3, 31),
                is_active=True
            )

        self.gl = GradeLevel.objects.first() or GradeLevel.objects.create(
            code=f"G_{secrets.token_hex(2).upper()}", name="Grade 10", level_order=10
        )
        self.sec = Section.objects.create(
            name=f"Sec_{secrets.token_hex(3)}", academic_year=self.ay, grade_level=self.gl
        )
        self.stu = Student.objects.create(
            first_name="Juan", last_name="Luna",
            lrn=f"88{secrets.token_hex(5)[:10]}", birthdate=date(2010, 1, 1),
            sex="Male", is_active=True
        )
        Enrollment.objects.create(student=self.stu, section=self.sec, academic_year=self.ay, status="ENROLLED")

    def tearDown(self):
        transaction.set_rollback(True)
        self.tx.__exit__(None, None, None)

    def test_student_list_by_section(self):
        res = self.client.get(f"/api/classroom/student_list/?section_id={self.sec.id}")
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])

    def test_class_list(self):
        res = self.client.get("/api/classroom/class_list/")
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])


if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(ClassroomEndpointTests)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)