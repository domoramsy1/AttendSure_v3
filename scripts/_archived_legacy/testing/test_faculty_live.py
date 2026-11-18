"""
AttendSure - Combined Telemetry Ping & GPS Monitor Test
File: backend/test_faculty_live.py
"""

import os
import sys
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

import django
django.setup()

from django.apps import apps
from django.core.cache import cache
from django.utils import timezone
import math


def calculate_distance(lat1, lon1, lat2, lon2):
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2.0)**2 + math.cos(phi1)*math.cos(phi2)*(math.sin(dlam/2.0)**2)
    return round(r * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))), 2)


# 1. School Baseline
campus_lat = 8.4800000
campus_lon = 124.6500000
radius = 100.0

# 2. Find Faculty User
FacultyProfile = apps.get_model('academics', 'FacultyProfile')
faculty = FacultyProfile.objects.filter(employee_id__iexact='FACULTY').first()
if not faculty:
    print("[ERROR] Faculty User not found.")
    sys.exit(1)

# 3. Inject Telemetry into Cache
now_iso = timezone.now().isoformat()
payload = {
    'faculty_id': faculty.id,
    'latitude': 8.480050,
    'longitude': 124.650030,
    'accuracy': 6.0,
    'timestamp': now_iso,
    'last_seen': now_iso,
    'device_id': 'DEV-IPHONE14-PRO-55555',
    'device_model': 'Apple iPhone 14 Pro',
    'battery_level': 88,
    'is_mock_location': False,
}

cache.set(f"attendsure_faculty_telemetry_{faculty.id}", payload, timeout=600)
cache.set(f"faculty_location_{faculty.id}", payload, timeout=600)
print(f"[1] Telemetry injected for {faculty.first_name} {faculty.last_name} (ID: {faculty.id})")

# 4. Read immediately from Cache in the same running process
cached = cache.get(f"attendsure_faculty_telemetry_{faculty.id}")
if cached:
    lat = cached['latitude']
    lon = cached['longitude']
    dist = calculate_distance(campus_lat, campus_lon, lat, lon)
    status = "VERIFIED_INSIDE" if dist <= radius else "OUTSIDE"

    print("\n[2] REAL-TIME MONITOR RESULT:")
    print(f"    * Faculty Member : {faculty.first_name} {faculty.last_name}")
    print(f"    * Device Model   : {cached['device_model']}")
    print(f"    * Latitude       : {lat:.6f}")
    print(f"    * Longitude      : {lon:.6f}")
    print(f"    * Distance       : {dist}m from campus center")
    print(f"    * Geofence Status: [{status}]")
else:
    print("[FAIL] Cache could not be read.")