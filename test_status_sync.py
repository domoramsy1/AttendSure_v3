"""
AttendSure - Simulate Faculty Device Pairing & Telemetry Ping
File: backend/send_test_telemetry.py
"""

import os
import sys
from pathlib import Path
from datetime import datetime

# 1. Setup Django environment
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

try:
    import django
    django.setup()
except Exception as e:
    print(f"[ERROR] Could not load Django environment: {e}")
    sys.exit(1)

from django.apps import apps
from django.core.cache import cache
from django.utils import timezone


def send_telemetry(mode="campus"):
    FacultyProfile = apps.get_model('academics', 'FacultyProfile')
    faculty = FacultyProfile.objects.filter(employee_id__iexact='FACULTY').first()

    if not faculty:
        faculty = FacultyProfile.objects.filter(last_name__icontains='Faculty').first()

    if not faculty:
        print("[FAIL] Could not find Faculty User in database.")
        return

    name = getattr(faculty, 'full_name', f"{faculty.first_name} {faculty.last_name}")
    print(f"Target Faculty: {name} (ID: {faculty.employee_id})")

    # 1. Choose coordinates
    if mode == "campus":
        # Inside Lapasan National High School (~6 meters from center)
        lat = 8.480050
        lon = 124.650030
        accuracy = 6.0
        location_label = "Inside Lapasan Campus (~6m away)"
    else:
        # Lumbia / Upper CDO coordinates matching your device
        lat = 8.395400
        lon = 124.597300
        accuracy = 18.0
        location_label = "Lumbia Home (~11.05 km away)"

    now = timezone.now()
    now_iso = now.isoformat()

    # 2. Pair hardware device
    device_uuid = "DEV-IPHONE14-PRO-55555"
    device_name = "Apple iPhone 14 Pro (Mobile App)"

    if hasattr(faculty, 'bound_device_id'):
        faculty.bound_device_id = device_uuid
    if hasattr(faculty, 'device_model'):
        faculty.device_model = device_name
    if hasattr(faculty, 'device_bound_at'):
        faculty.device_bound_at = now

    # 3. Update database model attributes if available
    for lat_attr in ('current_latitude', 'last_latitude', 'latitude'):
        if hasattr(faculty, lat_attr):
            setattr(faculty, lat_attr, lat)

    for lon_attr in ('current_longitude', 'last_longitude', 'longitude'):
        if hasattr(faculty, lon_attr):
            setattr(faculty, lon_attr, lon)

    for time_attr in ('last_seen', 'location_updated_at'):
        if hasattr(faculty, time_attr):
            setattr(faculty, time_attr, now)

    faculty.save()

    # 4. Push live telemetry payload into Redis/Django Cache
    telemetry_payload = {
        'faculty_id': faculty.id,
        'latitude': lat,
        'longitude': lon,
        'accuracy': accuracy,
        'timestamp': now_iso,
        'last_seen': now_iso,
        'device_id': device_uuid,
        'device_model': device_name,
        'battery_level': 88,
        'is_mock_location': False,
    }

    cache.set(f"attendsure_faculty_telemetry_{faculty.id}", telemetry_payload, timeout=600)
    cache.set(f"faculty_location_{faculty.id}", telemetry_payload, timeout=600)
    cache.set(f"attendsure_device_binding_{faculty.id}", device_uuid, timeout=86400)

    print(f"[SUCCESS] Telemetry dispatched successfully!")
    print(f"  * Mode        : {location_label}")
    print(f"  * Latitude    : {lat}")
    print(f"  * Longitude   : {lon}")
    print(f"  * Accuracy    : ±{accuracy}m")
    print(f"  * Device      : {device_name} ({device_uuid})")
    print(f"  * Cache Keys  : attendsure_faculty_telemetry_{faculty.id}")


if __name__ == '__main__':
    # Default is "campus" (inside school). Pass "lumbia" as an argument to test 11km away.
    selected_mode = sys.argv[1].lower() if len(sys.argv) > 1 else "campus"
    send_telemetry(selected_mode)