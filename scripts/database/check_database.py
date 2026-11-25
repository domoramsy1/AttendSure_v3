# AttendSure Scripts - Check Database
# File: D:\AttendSure_V3\scripts\database\check_database.py

r"""
AttendSure - PostgreSQL Health, Latency & 3NF Domain Table Counter
Run: python database\check_database.py
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import setup_django

setup_django()

from django.db import connection
from apps.accounts.models import AuditLog, Department, PositionTitle, TeacherProfile, UserProfile
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.campus.models import (
    CampusBoundary,
    LoafingIncident,
    MonthlyTimeRecord,
    TeacherDailyAttendance,
    TeacherLocationPing,
)
from apps.school.models import (
    AdministrativeDivision,
    Building,
    ClassPeriod,
    GradeLevel,
    Room,
    SchoolHoliday,
    SchoolSettings,
    SchoolYear,
    Section,
    Subject,
)
from apps.students.models import AddressLocation, Enrollment, Student


def main():
    t0 = time.perf_counter()
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_database();")
        db_name = cursor.fetchone()[0]
    latency_ms = max(1, round((time.perf_counter() - t0) * 1000))

    print("=" * 68)
    print(f"  ATTENDSURE 3NF DATABASE HEALTH ({connection.vendor.upper()})")
    print(f"  Database : {db_name} | Latency: {latency_ms} ms")
    print("=" * 68)

    models = [
        ("Department", Department),
        ("PositionTitle", PositionTitle),
        ("TeacherProfile", TeacherProfile),
        ("UserProfile", UserProfile),
        ("AdministrativeDivision", AdministrativeDivision),
        ("SchoolYear", SchoolYear),
        ("SchoolSettings", SchoolSettings),
        ("SchoolHoliday", SchoolHoliday),
        ("Building", Building),
        ("Room", Room),
        ("GradeLevel", GradeLevel),
        ("Subject", Subject),
        ("Section", Section),
        ("ClassPeriod", ClassPeriod),
        ("AddressLocation", AddressLocation),
        ("Student", Student),
        ("Enrollment", Enrollment),
        ("DailyAttendance", DailyAttendance),
        ("ClassAttendance", ClassAttendance),
        ("ExitPass", ExitPass),
        ("CampusBoundary", CampusBoundary),
        ("TeacherDailyAttendance", TeacherDailyAttendance),
        ("TeacherLocationPing", TeacherLocationPing),
        ("LoafingIncident", LoafingIncident),
        ("MonthlyTimeRecord", MonthlyTimeRecord),
        ("AuditLog", AuditLog),
    ]
    for label, model in models:
        print(f"  {label:<24} : {model.objects.count():>6} rows  ({model._meta.db_table})")
    print("=" * 68)


if __name__ == "__main__":
    main()
