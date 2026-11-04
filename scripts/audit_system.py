"""
AttendSure V3 - Project Auditor & Health Checker
File: D:\\AttendSure_V3\\scripts\\audit_system.py
"""

import os
import sys
import re
from datetime import date
from pathlib import Path

# Paths configuration
SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
BACKEND_DIR = PROJECT_ROOT / 'backend'
WEB_DIR = PROJECT_ROOT / 'web'
MOBILE_DIR = PROJECT_ROOT / 'mobile'
RESULTS_DIR = SCRIPTS_DIR / 'results'
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

try:
    import django
    django.setup()
except Exception as exc:
    print(f"\n[FATAL ERROR] Django could not start: {exc}")
    sys.exit(1)

from django.conf import settings
from django.db import connection, transaction
from django.core.management import call_command
from django.urls import resolve
from django.db.models import Q

from apps.academics.models import (
    Student, Section, Schedule, FacultyProfile, Enrollment,
    GatePass, AcademicYear, GradeLevel
)


class ProjectAuditor:
    def __init__(self):
        self.passes = 0
        self.warnings = 0
        self.failures = 0
        self.log_lines = []

    def log(self, text=""):
        print(text)
        self.log_lines.append(text)

    def banner(self, title: str):
        self.log("\n" + "=" * 80)
        self.log(f" {title.upper()}")
        self.log("=" * 80)

    def log_pass(self, title: str, note: str = ""):
        self.passes += 1
        msg = f">> [PASSED] {title}" + (f" -> {note}" if note else "")
        self.log(msg)

    def log_warn(self, title: str, note: str):
        self.warnings += 1
        self.log(f">> [WARNING] {title}\n   Note: {note}")

    def log_fail(self, bug_id: str, title: str, error: str):
        self.failures += 1
        self.log(f">> [BUG FOUND - {bug_id}] {title}\n   Error: {error}")

    def check_core(self):
        self.banner("Suite 1: Backend Core & Settings")
        try:
            call_command('check')
            self.log_pass("Django System Checks", "0 syntax or model errors.")
        except Exception as err:
            self.log_fail("CORE-01", "Django System Check", str(err))

        if getattr(settings, 'SECRET_KEY', None):
            self.log_pass("Security Secret Key", "Cryptographic key configured.")
        else:
            self.log_fail("CORE-02", "Secret Key", "SECRET_KEY is empty.")

    def check_database(self):
        self.banner("Suite 2: Database Connection & Migrations")
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            self.log_pass("Database Handshake", f"Connected to {connection.vendor.upper()}.")
        except Exception as err:
            self.log_fail("DB-01", "Database Handshake", str(err))

        try:
            from django.db.migrations.executor import MigrationExecutor
            executor = MigrationExecutor(connection)
            plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
            if not plan:
                self.log_pass("Database Migrations", "All migrations applied.")
            else:
                self.log_warn("Pending Migrations", f"{len(plan)} unapplied migrations.")
        except Exception as err:
            self.log_warn("Migration State", str(err))

    def check_live_crud(self):
        self.banner("Suite 3: Live Database Atomic CRUD Test")
        try:
            with transaction.atomic():
                ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
                if not ay:
                    ay = AcademicYear.objects.create(code="2026-2027", start_date=date(2026, 6, 1), first_friday_june=date(2026, 6, 5), end_date=date(2027, 3, 31), is_active=True)

                gl = GradeLevel.objects.first() or GradeLevel.objects.create(code="G7", name="Grade 7", level_order=7)
                sec = Section.objects.create(name="_AUDIT_TEMP", academic_year=ay, grade_level=gl)
                stu = Student.objects.create(first_name="Audit", last_name="Test", lrn="000000000001", birthdate=date(2012, 1, 1), sex="Male", is_active=True)
                enr = Enrollment.objects.create(student=stu, section=sec, academic_year=ay, status="ENROLLED")

                # Verify Read
                read_stu = Student.objects.filter(enrollments__section=sec, lrn="000000000001").first()
                if not read_stu:
                    raise ValueError("Student lookup via enrollment relation failed.")

                # Cleanup & Rollback
                enr.delete()
                stu.delete()
                sec.delete()
                transaction.set_rollback(True)

            self.log_pass("Live CRUD & Safe Rollback", "Database Create, Read, and Delete verified cleanly.")
        except Exception as err:
            self.log_fail("CRUD-01", "Live CRUD", str(err))

    def check_routes(self):
        self.banner("Suite 4: API Route Resolution")
        routes = ['/api/me/', '/api/settings/school/', '/api/students/', '/api/sections/', '/api/kiosks/']
        for r in routes:
            try:
                resolve(r)
                self.log_pass(f"Route '{r}'", "Resolves cleanly.")
            except Exception as err:
                self.log_fail("ROUTE-01", f"Route '{r}'", str(err))

    def run(self):
        self.check_core()
        self.check_database()
        self.check_live_crud()
        self.check_routes()

        self.banner("Audit Summary")
        self.log(f"Passed:   {self.passes}")
        self.log(f"Warnings: {self.warnings}")
        self.log(f"Failures: {self.failures}")

        out_file = RESULTS_DIR / "system_audit.txt"
        with open(out_file, "w", encoding="utf-8") as f:
            f.write("\n".join(self.log_lines))
        self.log(f"\nReport written to: {out_file}")


if __name__ == '__main__':
    ProjectAuditor().run()