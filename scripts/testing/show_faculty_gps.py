"""
AttendSure - Faculty Real-Time GPS & Telemetry Monitor
File: backend/show_faculty_gps.py
"""

import os
import sys
import math
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

import django
django.setup()

from django.apps import apps
from django.core.cache import cache
from apps.api.views.geofence import (
    get_campus_geofence_config,
    load_persistent_telemetry,
    calculate_haversine_distance,
)


def main():
    print("=" * 102)
    print("                 ATTENDSURE FACULTY REAL-TIME GPS MONITOR")
    print("=" * 102)

    config = get_campus_geofence_config()
    campus_lat = config['latitude']
    campus_lon = config['longitude']
    geofence_radius = config['radius_meters']
    school_name = config['school_name']

    print(f"School Reference : {school_name}")
    print(f"Campus Center    : Latitude: {campus_lat:.7f}, Longitude: {campus_lon:.7f}")
    print(f"Geofence Radius  : {geofence_radius} meters")
    print("-" * 102)

    FacultyProfile = apps.get_model('academics', 'FacultyProfile')
    FacultyHeartbeat = apps.get_model('academics', 'FacultyHeartbeat')
    faculty_members = FacultyProfile.objects.all().order_by('last_name', 'first_name')

    header = (
        f"{'NAME':<24} | {'EMP ID':<8} | {'LATITUDE':<11} | {'LONGITUDE':<11} | "
        f"{'DISTANCE':<12} | {'STATUS':<17} | {'DEVICE MODEL'}"
    )
    print(header)
    print("-" * 102)

    inside_count = 0
    outside_count = 0
    no_signal_count = 0

    for fac in faculty_members:
        name = getattr(fac, 'full_name', f"{fac.first_name} {fac.last_name}")
        emp_id = getattr(fac, 'employee_id', 'N/A') or 'N/A'

        # 1. Check RAM Cache
        telemetry = cache.get(f"attendsure_faculty_telemetry_{fac.id}")

        # 2. Check Persistent File Storage
        if not telemetry:
            telemetry = load_persistent_telemetry(fac.id)

        # 3. Check Live PostgreSQL Database Table
        if not telemetry:
            db_hb = FacultyHeartbeat.objects.filter(faculty=fac).order_by('-recorded_at').first()
            if db_hb:
                dist = calculate_haversine_distance(campus_lat, campus_lon, float(db_hb.latitude), float(db_hb.longitude))
                telemetry = {
                    'latitude': float(db_hb.latitude),
                    'longitude': float(db_hb.longitude),
                    'accuracy': 6.0,
                    'battery_level': db_hb.battery_level,
                    'device_model': getattr(fac, 'device_model', 'Registered Phone') or 'Smartphone App',
                    'timestamp': db_hb.recorded_at.isoformat(),
                }

        if telemetry and telemetry.get('latitude') and telemetry.get('longitude'):
            lat = telemetry['latitude']
            lon = telemetry['longitude']
            dist = calculate_haversine_distance(campus_lat, campus_lon, lat, lon)
            is_inside = dist <= geofence_radius if dist is not None else False
            status_label = "VERIFIED_INSIDE" if is_inside else "OFF CAMPUS"

            if is_inside:
                inside_count += 1
            else:
                outside_count += 1

            lat_str = f"{float(lat):.6f}"
            lon_str = f"{float(lon):.6f}"
            dist_str = f"{dist:.1f}m" if dist < 1000 else f"{(dist/1000):.2f}km"
            device_str = telemetry.get('device_model', 'Smartphone App')
        else:
            lat_str = "--"
            lon_str = "--"
            dist_str = "--"
            status_label = "NO SIGNAL"
            device_str = getattr(fac, 'device_model', None) or "No device paired"
            no_signal_count += 1

        print(
            f"{name:<24} | {emp_id:<8} | {lat_str:<11} | {lon_str:<11} | "
            f"{dist_str:<12} | {status_label:<17} | {device_str}"
        )

    print("-" * 102)
    print(f"Summary: Total: {faculty_members.count()} | Inside: {inside_count} | Outside: {outside_count} | No GPS: {no_signal_count}")
    print("=" * 102)


if __name__ == '__main__':
    main()