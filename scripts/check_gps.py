"""
AttendSure V3 - Faculty GPS & Telemetry Monitor
File: D:\\AttendSure_V3\\scripts\\check_gps.py
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

from django.core.cache import cache
from apps.common.utils import calculate_haversine_distance
from apps.academics.models import FacultyProfile, SchoolProfile, FacultyHeartbeat


def main():
    print("=" * 95)
    print("                     ATTENDSURE FACULTY REAL-TIME GPS MONITOR")
    print("=" * 95)

    school = SchoolProfile.objects.first()
    campus_lat = float(school.latitude) if school and school.latitude else 8.4858000
    campus_lon = float(school.longitude) if school and school.longitude else 124.6567000
    radius_meters = float(school.geofence_radius_meters) if school and school.geofence_radius_meters else 150.0

    print(f"Campus Center    : Latitude: {campus_lat:.7f}, Longitude: {campus_lon:.7f}")
    print(f"Geofence Radius  : {radius_meters:.1f} meters")
    print("-" * 95)

    faculties = FacultyProfile.objects.filter(is_active=True).order_by('last_name', 'first_name')
    header = f"{'NAME':<24} | {'EMP ID':<10} | {'DISTANCE':<12} | {'STATUS':<18} | {'DEVICE'}"
    print(header)
    print("-" * 95)

    inside_count, outside_count, no_gps_count = 0, 0, 0

    for fac in faculties:
        name = fac.full_name
        emp_id = fac.employee_id or 'N/A'

        # 1. Read RAM cache first
        telemetry = cache.get(f"attendsure_faculty_telemetry_{fac.id}")

        # 2. Check live database heartbeat
        if not telemetry:
            hb = FacultyHeartbeat.objects.filter(faculty=fac).order_by('-recorded_at').first()
            if hb:
                telemetry = {
                    'latitude': float(hb.latitude),
                    'longitude': float(hb.longitude),
                    'device_model': getattr(fac, 'device_model', 'Registered Phone') or 'Smartphone App',
                }

        if telemetry and telemetry.get('latitude') and telemetry.get('longitude'):
            lat = telemetry['latitude']
            lon = telemetry['longitude']
            dist = calculate_haversine_distance(campus_lat, campus_lon, lat, lon)
            is_inside = dist <= radius_meters
            status_text = "VERIFIED_INSIDE" if is_inside else "OFF_CAMPUS"

            if is_inside:
                inside_count += 1
            else:
                outside_count += 1

            dist_str = f"{dist:.1f}m" if dist < 1000 else f"{(dist/1000):.2f}km"
            device_str = telemetry.get('device_model', 'Smartphone App')
        else:
            dist_str = "--"
            status_text = "NO_SIGNAL"
            device_str = getattr(fac, 'device_model', None) or "Unpaired"
            no_gps_count += 1

        print(f"{name:<24} | {emp_id:<10} | {dist_str:<12} | {status_text:<18} | {device_str}")

    print("-" * 95)
    print(f"Summary: Total: {faculties.count()} | Inside: {inside_count} | Outside: {outside_count} | No GPS: {no_gps_count}")
    print("=" * 95)


if __name__ == '__main__':
    main()