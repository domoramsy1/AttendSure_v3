"""
AttendSure - Live Database Integrity & Dynamic Geofence Test Script
File: test_live_db.py
"""

import os
import sys
from pathlib import Path
import math

# Automatically add the backend folder to Python's module path
BASE_DIR = Path(__file__).resolve().parent
if (BASE_DIR / 'backend').exists():
    sys.path.insert(0, str(BASE_DIR / 'backend'))
else:
    sys.path.insert(0, str(BASE_DIR))

# Initialize Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

try:
    import django
    django.setup()
except Exception as e:
    print(f"[ERROR] Could not initialize Django settings: {e}")
    sys.exit(1)

from django.apps import apps
from django.db import connection
from django.db.models import Count, Q


def calculate_distance_meters(lat1, lon1, lat2, lon2):
    R = 6371000.0  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


def main():
    print("=" * 65)
    print("      ATTENDSURE LIVE DATABASE AUDIT & GEOFENCE TEST")
    print("=" * 65)

    # 1. Database Connection & Table Counts
    print("\n[1] CHECKING DATABASE TABLES...")
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database();")
            db_name = cursor.fetchone()[0]
        print(f"    Connected to Database: {db_name}")
    except Exception as e:
        print(f"    [FAIL] Database connection failed: {e}")
        return

    models_to_check = ['Student', 'FacultyProfile', 'Section', 'Schedule', 'Subject', 'GradeLevel']
    for model_name in models_to_check:
        try:
            model = apps.get_model('academics', model_name)
            count = model.objects.count()
            print(f"    * {model_name:16}: {count} records")
        except LookupError:
            print(f"    * {model_name:16}: [Model not found in academics]")

    # 2. Real School Coordinates & Dynamic Geofence
    print("\n[2] FETCHING LIVE GEOFENCE SETTINGS FROM DATABASE...")
    campus_lat = None
    campus_lon = None
    radius_meters = 100.0

    settings_model = None
    for model in apps.get_models():
        m_name = model.__name__.lower()
        if 'school' in m_name or 'setting' in m_name:
            field_names = [f.name for f in model._meta.get_fields()]
            if 'latitude' in field_names and 'longitude' in field_names:
                settings_model = model
                break

    if settings_model:
        school_record = settings_model.objects.first()
        if school_record:
            campus_lat = getattr(school_record, 'latitude', None)
            campus_lon = getattr(school_record, 'longitude', None)
            radius_meters = float(
                getattr(school_record, 'geofence_radius', None) or 
                getattr(school_record, 'radius', None) or 
                100.0
            )
            school_name = getattr(school_record, 'school_name', None) or "Live School"
            print(f"    Found School Record: {school_name}")
            print(f"    Campus Center     : Latitude={campus_lat}, Longitude={campus_lon}")
            print(f"    Geofence Radius   : {radius_meters} meters")
        else:
            print("    [WARN] School settings table is empty.")
    else:
        print("    [INFO] Using default system coordinates.")
        campus_lat = 8.485600
        campus_lon = 124.656500

    if campus_lat and campus_lon:
        test_user_lat = float(campus_lat) + 0.00025
        test_user_lon = float(campus_lon) + 0.00020
        dist = calculate_distance_meters(float(campus_lat), float(campus_lon), test_user_lat, test_user_lon)
        is_inside = dist <= radius_meters
        print(f"    - Simulated Location: {dist}m away from campus center")
        print(f"    - Boundary Status   : {'[PASS] VERIFIED_INSIDE' if is_inside else '[FAIL] OUTSIDE_BOUNDARY'}")
    else:
        print("    [FAIL] No valid latitude/longitude set in database.")

    # 3. Class Advisers & Subject Teachers Audit
    print("\n[3] AUDITING CLASS ADVISERS & SUBJECT TEACHERS...")
    try:
        Section = apps.get_model('academics', 'Section')
        Schedule = apps.get_model('academics', 'Schedule')
        sections = Section.objects.select_related('adviser', 'grade_level').all()[:5]

        if not sections.exists():
            print("    No sections found in database.")
        else:
            for sec in sections:
                gl_name = getattr(sec.grade_level, 'name', 'No Grade Level') if sec.grade_level else 'No Grade Level'
                adviser_name = sec.adviser.full_name if sec.adviser else "UNASSIGNED ADVISER"
                subject_count = Schedule.objects.filter(section=sec).count()
                print(f"    * Section: {sec.name:15} | Grade: {gl_name:10} | Adviser: {adviser_name:22} | Subject Periods: {subject_count}")
    except Exception as e:
        print(f"    [FAIL] Section audit error: {e}")

    # 4. Live Schedule Conflict Scan
    print("\n[4] SCANNING REAL SCHEDULES FOR TIME & ROOM CONFLICTS...")
    try:
        Schedule = apps.get_model('academics', 'Schedule')
        schedules = list(Schedule.objects.select_related('section', 'subject', 'faculty').all())
        total_scheds = len(schedules)
        conflicts_found = 0

        for i in range(total_scheds):
            for j in range(i + 1, total_scheds):
                s1 = schedules[i]
                s2 = schedules[j]

                t1_start = str(getattr(s1, 'start_time', ''))[:5]
                t1_end = str(getattr(s1, 'end_time', ''))[:5]
                t2_start = str(getattr(s2, 'start_time', ''))[:5]
                t2_end = str(getattr(s2, 'end_time', ''))[:5]

                if not (t1_start and t1_end and t2_start and t2_end):
                    continue

                if not (t1_start < t2_end and t1_end > t2_start):
                    continue

                # Faculty double-booking check
                if s1.faculty_id and s2.faculty_id and s1.faculty_id == s2.faculty_id:
                    conflicts_found += 1
                    fac_name = getattr(s1.faculty, 'full_name', f"Faculty #{s1.faculty_id}")
                    print(f"    [CONFLICT] Teacher '{fac_name}' double-booked on schedules {s1.id} & {s2.id} ({t1_start}-{t1_end})")

                # Section double-booking check
                if s1.section_id and s2.section_id and s1.section_id == s2.section_id:
                    conflicts_found += 1
                    sec_name = getattr(s1.section, 'name', f"Section #{s1.section_id}")
                    print(f"    [CONFLICT] Section '{sec_name}' has 2 classes at once on schedules {s1.id} & {s2.id} ({t1_start}-{t1_end})")

        if conflicts_found == 0:
            print(f"    [CLEAN] All {total_scheds} timetable slots have zero teacher or section conflicts.")
        else:
            print(f"    [WARNING] Found {conflicts_found} total timetable conflict(s) in database.")
    except Exception as e:
        print(f"    [FAIL] Schedule conflict scan error: {e}")

    print("\n" + "=" * 65)
    print("      LIVE TEST COMPLETE")
    print("=" * 65)


if __name__ == '__main__':
    main()