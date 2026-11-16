"""
AttendSure V3 - Geofence & Anti-Spoofing Tests
File: D:\\AttendSure_V3\\scripts\\test_geofence.py
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
from apps.common.utils import calculate_haversine_distance

User = get_user_model()


class GeofenceUnitTests(unittest.TestCase):
    def setUp(self):
        self.tx = transaction.atomic()
        self.tx.__enter__()

        self.client = APIClient()
        self.user = User.objects.create_user(username="geo_user", password="Password123!")
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        transaction.set_rollback(True)
        self.tx.__exit__(None, None, None)

    def test_haversine_math(self):
        # Distance calculation between two known points (~156 meters)
        dist = calculate_haversine_distance(8.4800, 124.6500, 8.4810, 124.6510)
        self.assertTrue(100.0 <= dist <= 200.0)

    def test_geofence_status_endpoint(self):
        res = self.client.get("/api/geofence/")
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_403_FORBIDDEN])


if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(GeofenceUnitTests)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)