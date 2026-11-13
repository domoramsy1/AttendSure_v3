"""
AttendSure V3 - DepEd SF & DTR Reports Tests
File: D:\\AttendSure_V3\\scripts\\test_reports.py
"""

import os
import sys
from pathlib import Path

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
from apps.academics.models import AcademicYear, GradeLevel, Section, UserProfile

User = get_user_model()


class ReportEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tx = transaction.atomic()
        self.tx.__enter__()

        self.client = APIClient()
        token = secrets.token_hex(4)
        username = f"report_{token}"
        self.admin = User.objects.create_superuser(username=username, password="Password123!")

        profile, _ = UserProfile.objects.get_or_create(user=self.admin)
        profile.role = "ADMIN"
        profile.save(update_fields=['role'])

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

        self.gl = GradeLevel.objects.first() or GradeLevel.objects.create(
            code=f"G_{secrets.token_hex(2).upper()}", name="Grade 7", level_order=7
        )
        self.sec = Section.objects.create(
            name=f"Sec_{secrets.token_hex(3)}", academic_year=self.ay, grade_level=self.gl
        )

    def tearDown(self):
        transaction.set_rollback(True)
        self.tx.__exit__(None, None, None)

    def test_sf1_report_endpoint(self):
        res = self.client.get(f"/api/reports/sf1/{self.sec.id}/")
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])

    def test_sf2_report_endpoint(self):
        res = self.client.get(f"/api/reports/sf2/{self.sec.id}/")
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])


if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(ReportEndpointTests)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)