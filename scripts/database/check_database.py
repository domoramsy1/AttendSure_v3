r"""
AttendSure - PostgreSQL Health, Latency & Domain Table Counter
Run: python database\check_database.py
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import setup_django

setup_django()

from django.db import connection
from apps.accounts.models import AuditLog, TeacherProfile, UserProfile
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.campus.models import CampusBoundary, TeacherLocationLog
from apps.messaging.models import ChatMessage, Notification
from apps.school.models import ClassPeriod, GradeLevel, Room, SchoolSettings, SchoolYear, Section, Subject
from apps.students.models import Enrollment, Student


def main():
    t0 = time.perf_counter()
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_database();")
        db_name = cursor.fetchone()[0]
    latency_ms = max(1, round((time.perf_counter() - t0) * 1000))

    print("=" * 64)
    print(f"  ATTENDSURE DATABASE HEALTH ({connection.vendor.upper()})")
    print(f"  Database : {db_name} | Latency: {latency_ms} ms")
    print("=" * 64)

    models = [
        ("SchoolSettings", SchoolSettings),
        ("SchoolYear", SchoolYear),
        ("GradeLevel", GradeLevel),
        ("Room", Room),
        ("Section", Section),
        ("Subject", Subject),
        ("ClassPeriod", ClassPeriod),
        ("TeacherProfile", TeacherProfile),
        ("UserProfile", UserProfile),
        ("Student", Student),
        ("Enrollment", Enrollment),
        ("ClassAttendance", ClassAttendance),
        ("DailyAttendance", DailyAttendance),
        ("ExitPass", ExitPass),
        ("CampusBoundary", CampusBoundary),
        ("TeacherLocationLog", TeacherLocationLog),
        ("Notification", Notification),
        ("ChatMessage", ChatMessage),
        ("AuditLog", AuditLog),
    ]
    for label, model in models:
        print(f"  {label:<22} : {model.objects.count():>6} rows  ({model._meta.db_table})")
    print("=" * 64)


if __name__ == "__main__":
    main()
