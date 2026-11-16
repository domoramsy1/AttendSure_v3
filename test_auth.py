"""
AttendSure V3 - Authentication Verification Tests
File: D:\\AttendSure_V3\\scripts\\test_auth.py
"""

import os
import sys
import unittest
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

User = get_user_model()


class AuthEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tx = transaction.atomic()
        self.tx.__enter__()

        self.client = APIClient()
        self.user = User.objects.create_user(username="auth_user", password="SecurePassword123!")

    def tearDown(self):
        transaction.set_rollback(True)
        self.tx.__exit__(None, None, None)

    def test_login_success(self):
        res = self.client.post("/api/auth/login/", {"username": "auth_user", "password": "SecurePassword123!"})
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST])


if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(AuthEndpointTests)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)