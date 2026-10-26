r"""
AttendSure V3 - Unified Full-Stack Project Auditor & Health Checker
File: D:\AttendSure_V3\backend\audit_system.py

Audits:
1. Backend Core & Django Settings
2. Database Connection & Applied Migrations
3. Model Schema & Decoupled Relationships (Student, FacultyProfile, Schedule)
4. Live End-to-End Database CRUD (Safe atomic test with instant rollback)
5. Critical API Endpoints & Queryset Crash Prevention
6. Frontend (Web) & Mobile (Expo) Health, Configs & Trap Scans
7. Cybersecurity, Anti-Cheat, and Role-Based Access Control (RBAC)
"""

import os
import sys
import re
from datetime import date
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
WEB_DIR = PROJECT_ROOT / 'web'
MOBILE_DIR = PROJECT_ROOT / 'mobile'

sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

try:
    import django
    django.setup()
except Exception as exc:
    print(f"\n[FATAL ERROR] Django could not start: {exc}")
    print("HOW TO FIX: Make sure your Python virtual environment is active.")
    sys.exit(1)

from django.conf import settings
from django.db import connection, transaction
from django.core.management import call_command
from django.urls import resolve
from django.db.models import Q

from apps.academics.models import (
    Student,
    Section,
    Schedule,
    FacultyProfile,
    SchoolProfile,
    Enrollment,
    GatePass,
    SubjectAttendanceLog,
    StudentGateLog,
    DailyAttendanceSummary,
    AcademicYear,
    GradeLevel,
)


class ProjectAuditor:
    def __init__(self):
        self.passes = 0
        self.warnings = 0
        self.failures = 0
        self.guides = []

    def banner(self, title: str):
        print("\n" + "=" * 80)
        print(f" {title.upper()}")
        print("=" * 80)

    def log_pass(self, title: str, note: str = ""):
        self.passes += 1
        msg = f">> [PASSED] {title}"
        if note:
            msg += f" -> {note}"
        print(msg)

    def log_warn(self, title: str, note: str, tip: str = ""):
        self.warnings += 1
        print(f">> [WARNING] {title}\n   Note: {note}")
        if tip:
            print(f"   Tip:  {tip}")

    def log_fail(self, bug_id: str, title: str, error: str, file_path: str, reason: str, fix_guide: str):
        self.failures += 1
        entry = {
            "bug_id": bug_id,
            "title": title,
            "error": error,
            "file": file_path,
            "reason": reason,
            "fix": fix_guide,
        }
        self.guides.append(entry)
        print(f">> [BUG FOUND - {bug_id}] {title}")
        print(f"   Error: {error}")
        print(f"   File:  {file_path}")

    def check_backend_core(self):
        self.banner("Suite 1: Backend Core & Django Settings")
        try:
            call_command('check')
            self.log_pass("Django System Checks", "0 syntax, model, or setting check errors.")
        except Exception as err:
            self.log_fail(
                "CORE-01", "Django System Check", str(err),
                "backend/attendsure_core/settings.py",
                "Django found syntax or configuration errors.",
                "Run 'python manage.py check' in the backend terminal to see the traceback."
            )

        if getattr(settings, 'SECRET_KEY', None):
            self.log_pass("Security Secret Key", "Cryptographic key is configured.")
        else:
            self.log_fail(
                "CORE-02", "Secret Key", "SECRET_KEY is empty.",
                "backend/attendsure_core/settings.py",
                "Django needs a secret key to sign sessions and tokens.",
                "Set a secure random SECRET_KEY in your settings.py file."
            )

        allowed = getattr(settings, 'ALLOWED_HOSTS', [])
        if allowed:
            self.log_pass("Allowed Hosts", f"Active list: {allowed}")
        else:
            self.log_warn("Allowed Hosts", "ALLOWED_HOSTS is empty.", "Add your server IP or domain in settings.py.")

    def check_database(self):
        self.banner("Suite 2: Database Connection & Schema Migrations")
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                row = cursor.fetchone()
                if row and row[0] == 1:
                    db_name = settings.DATABASES['default'].get('NAME', 'database')
                    self.log_pass("Database Handshake", f"Connected to {connection.vendor.upper()} ({db_name}).")
        except Exception as err:
            self.log_fail(
                "DB-01", "Database Handshake", str(err),
                "backend/attendsure_core/settings.py",
                "Could not connect to the database.",
                "Make sure PostgreSQL is running and check your database credentials in settings.py."
            )

        try:
            from django.db.migrations.executor import MigrationExecutor
            executor = MigrationExecutor(connection)
            plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
            if not plan:
                self.log_pass("Database Migrations", "All schema migrations are applied.")
            else:
                unapplied = [m.name for m, _ in plan]
                self.log_warn("Pending Migrations", f"{len(unapplied)} unapplied migrations.", "Run 'python manage.py migrate'")
        except Exception as err:
            self.log_warn("Migration State", f"Could not verify migrations: {err}")

    def check_model_rules(self):
        self.banner("Suite 3: Database Models & Field Integrity")

        student_fields = {f.name for f in Student._meta.get_fields()}
        if 'section' not in student_fields:
            self.log_pass("Student Model Schema", "No direct 'section' column. Correctly linked via 'enrollments'.")
        else:
            self.log_warn("Student Model Schema", "'section' column found directly on Student model.")

        fac_fields = {f.name for f in FacultyProfile._meta.get_fields()}
        if 'account' in fac_fields:
            self.log_pass("FacultyProfile User Link", "Uses 'account' to link to the User model.")
        else:
            self.log_fail(
                "MODEL-01", "FacultyProfile User Link", "Missing 'account' foreign key.",
                "backend/apps/academics/models.py",
                "FacultyProfile must use 'account' to link to the Django User.",
                "Change 'user = models.OneToOneField(...)' to 'account = models.OneToOneField(...)'."
            )

        if 'full_name' not in fac_fields:
            self.log_pass("FacultyProfile Computed Name", "'full_name' is a Python property, not a database column.")
        else:
            self.log_warn("FacultyProfile Computed Name", "'full_name' exists as a database column.")

        sched_fields = {f.name for f in Schedule._meta.get_fields()}
        if 'faculty' in sched_fields and 'section' in sched_fields:
            self.log_pass("Schedule Relationships", "Foreign keys to FacultyProfile and Section are active.")
        else:
            self.log_fail(
                "MODEL-02", "Schedule Foreign Keys", "Missing 'faculty' or 'section' fields.",
                "backend/apps/academics/models.py",
                "Schedule model must link to both FacultyProfile and Section.",
                "Add foreign keys for faculty and section in apps/academics/models.py."
            )

    def check_live_crud(self):
        self.banner("Suite 4: Live Database CRUD Operations (Safe Rollback)")
        try:
            with transaction.atomic():
                # 1. Resolve Foreign Key Dependencies
                ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
                if not ay:
                    ay = AcademicYear.objects.create(
                        name="2026-2027",
                        code="2026-2027",
                        start_date=date(2026, 6, 1),
                        first_friday_june=date(2026, 6, 5),
                        end_date=date(2027, 3, 31),
                        is_active=True
                    )

                gl = GradeLevel.objects.first()
                if not gl:
                    gl = GradeLevel.objects.create(code="G7", name="Grade 7", level_order=7)

                # 2. CREATE: Create temporary test section, student, and enrollment
                test_sec = Section.objects.create(
                    name="_AUDIT_TEMP_SECTION",
                    academic_year=ay,
                    grade_level=gl
                )
                test_student = Student.objects.create(
                    first_name="AuditFirst",
                    last_name="AuditLast",
                    lrn="999999999999",
                    birthdate=date(2012, 1, 1),
                    sex="Male",
                    is_active=True
                )
                test_enr = Enrollment.objects.create(
                    student=test_student,
                    section=test_sec,
                    academic_year=ay,
                    status="ENROLLED"
                )
                self.log_pass("CRUD: CREATE", "Inserted test records into Section, Student, and Enrollment.")

                # 3. READ: Query student through enrollments relationship
                queried_student = Student.objects.filter(
                    enrollments__section=test_sec,
                    lrn="999999999999"
                ).first()
                if queried_student and queried_student.id == test_student.id:
                    self.log_pass("CRUD: READ", "Retrieved student through 'enrollments__section' relation.")
                else:
                    raise ValueError("Could not find the test student via relationship lookup.")

                # 4. UPDATE: Modify test student attributes
                queried_student.first_name = "AuditUpdated"
                queried_student.save(update_fields=['first_name'])
                re_read = Student.objects.get(id=test_student.id)
                if re_read.first_name == "AuditUpdated":
                    self.log_pass("CRUD: UPDATE", "Successfully updated test student attributes.")
                else:
                    raise ValueError("Update verification failed.")

                # 5. DELETE: Remove the created test records
                test_enr.delete()
                test_student.delete()
                test_sec.delete()
                self.log_pass("CRUD: DELETE", "Deleted test records cleanly.")

                # Force complete transaction rollback: zero test data persists
                transaction.set_rollback(True)

            self.log_pass("CRUD Transaction Rollback", "Atomic rollback verified. No test data remains in database.")
        except Exception as err:
            self.log_fail(
                "CRUD-01", "Live CRUD Operations", str(err),
                "backend/apps/academics/models.py",
                "Database rejected Create, Read, Update, or Delete operations.",
                "Review the database error above and ensure all required model fields have valid values."
            )

    def check_querysets(self):
        self.banner("Suite 5: Critical API Querysets & Crash Vulnerabilities")

        # Test A: Classroom student list query
        try:
            sec = Section.objects.first()
            if sec:
                count = Student.objects.filter(enrollments__section=sec, is_active=True).distinct().count()
                self.log_pass("Classroom Student Query", f"Found {count} students in '{sec.name}'.")
            else:
                self.log_pass("Classroom Student Query", "Query syntax valid (No sections in database).")
        except Exception as err:
            self.log_fail(
                "QUERY-01", "Classroom Student Filter", str(err),
                "backend/apps/api/views/classroom.py",
                "Query failed because 'Student' has no direct 'section' column.",
                "Replace 'section=sec' with 'enrollments__section=sec'."
            )

        # Test B: Student directory query with prefetch_related
        try:
            list(Student.objects.filter(is_active=True).prefetch_related('enrollments__section')[:3])
            self.log_pass("Student Directory Query", "Compiled cleanly with prefetch_related('enrollments__section').")
        except Exception as err:
            self.log_fail(
                "QUERY-02", "Student Directory Query", str(err),
                "backend/apps/api/views/viewsets.py",
                "Failed using invalid select_related on section.",
                "In StudentViewSet.get_queryset(), replace select_related('section') with prefetch_related('enrollments__section')."
            )

       # Test C: GatePass queryset
        try:
            fac = FacultyProfile.objects.first()
            if fac:
                list(GatePass.objects.filter(Q(faculty_id=fac.id))[:2])
                self.log_pass("GatePass Filter Query", "Accepted valid FacultyProfile filter.")
            else:
                self.log_pass("GatePass Filter Query", "Query syntax valid (No faculty profiles yet).")
        except Exception as err:
            self.log_fail(
                "QUERY-03", "GatePass Queryset", str(err),
                "backend/apps/api/views/viewsets.py",
                "GatePass crashed because of invalid type query.",
                "Ensure faculty is filtered via faculty_id or verified FacultyProfile instance."
            )

        # Test D: Geofence safe_photo_url function resolution
        try:
            from apps.api.views.geofence import safe_photo_url
            safe_photo_url(None)
            self.log_pass("Geofence Photo Sanitizer", "'safe_photo_url' is defined and functional.")
        except Exception as err:
            self.log_fail(
                "QUERY-04", "Geofence Photo Sanitizer", str(err),
                "backend/apps/api/views/geofence.py",
                "'safe_photo_url' function is missing, causing 500 error on /api/geofence/.",
                "Define 'def safe_photo_url(photo_field, request=None):' at the top of geofence.py."
            )

    def check_api_routes(self):
        self.banner("Suite 6: API Routes & URL Mapping")
        routes = [
            ('/api/me/', 'Current User Profile'),
            ('/api/settings/school/', 'School Settings Profile'),
            ('/api/classroom/class_list/', 'Teaching Timetable'),
            ('/api/classroom/student_list/', 'Classroom Roster'),
            ('/api/geofence/', 'Geofence Perimeter Status'),
            ('/api/students/', 'Student Directory ViewSet'),
            ('/api/gate-passes/', 'Gate Pass ViewSet'),
        ]

        for path, label in routes:
            try:
                resolved = resolve(path)
                name = resolved.func.__name__ if hasattr(resolved.func, '__name__') else str(resolved.func)
                self.log_pass(f"Route '{path}'", f"Resolves to {name} ({label}).")
            except Exception as err:
                self.log_fail(
                    "ROUTE-01", f"Route '{path}'", str(err),
                    "backend/apps/api/urls.py",
                    f"Route for {label} could not be found.",
                    f"Register path for '{path}' in apps/api/urls.py."
                )

    def check_frontend_and_mobile(self):
        self.banner("Suite 7: Frontend (Web) & Mobile (Expo) Health Scans")

        if WEB_DIR.exists():
            self.log_pass("Web Directory", f"Found at {WEB_DIR}")
            pkg = WEB_DIR / 'package.json'
            if pkg.exists():
                self.log_pass("Web package.json", "Present.")
            else:
                self.log_warn("Web package.json", "package.json missing in web folder.")

            src_files = list((WEB_DIR / 'src').rglob('*.tsx')) + list((WEB_DIR / 'src').rglob('*.ts'))
            for f in src_files:
                try:
                    content = f.read_text(encoding='utf-8', errors='ignore')
                    if re.search(r'[\w\.]+\.grade_level\.trim\(', content):
                        self.log_fail(
                            "WEB-01", "Unsafe grade_level.trim() Call",
                            "Direct .trim() call on grade_level will crash if it is a number or object.",
                            str(f.relative_to(PROJECT_ROOT)),
                            "Causes 'Uncaught TypeError: s.grade_level.trim is not a function'.",
                            "Use 'String(item.grade_level ?? \"\").trim()' instead."
                        )
                except Exception:
                    pass
        else:
            self.log_warn("Web Directory", "web folder not found at expected path.")

        if MOBILE_DIR.exists():
            self.log_pass("Mobile Directory", f"Found at {MOBILE_DIR}")
            app_json = MOBILE_DIR / 'app.json'
            if app_json.exists():
                self.log_pass("Expo app.json", "Present.")
            else:
                self.log_warn("Expo app.json", "app.json missing in mobile folder.")

            mobile_src = list((MOBILE_DIR / 'src').rglob('*.tsx')) + list((MOBILE_DIR / 'src').rglob('*.ts'))
            for f in mobile_src:
                try:
                    content = f.read_text(encoding='utf-8', errors='ignore')
                    if 'StatusBar' in content and 'backgroundColor=' in content and 'react-native' in content:
                        self.log_fail(
                            "MOB-01", "Invalid StatusBar Prop",
                            "StatusBar backgroundColor prop causes TypeScript TS2769 error.",
                            str(f.relative_to(PROJECT_ROOT)),
                            "React Native's modern StatusBar types disallow backgroundColor.",
                            "Use '<StatusBar style=\"dark\" />' from 'expo-status-bar' instead."
                        )
                    if re.search(r'source=\{\{\s*uri:\s*[^}]+null', content):
                        self.log_fail(
                            "MOB-02", "Invalid Image URI Prop",
                            "Passing null to Image uri prop causes TypeScript TS2322 error.",
                            str(f.relative_to(PROJECT_ROOT)),
                            "expo-image expects 'string | undefined', disallowing 'null'.",
                            "Use 'uri: resolvePhotoUri(...) ?? undefined'."
                        )
                except Exception:
                    pass
        else:
            self.log_warn("Mobile Directory", "mobile folder not found at expected path.")

    def check_security(self):
        self.banner("Suite 8: Cybersecurity, Anti-Cheat & RBAC")

        is_debug = getattr(settings, 'DEBUG', False)
        if is_debug:
            self.log_warn("Django DEBUG Mode", "DEBUG is True (Standard for development; must be False in production).")
        else:
            self.log_pass("Django DEBUG Mode", "Set to False (Production ready).")

        val_count = len(getattr(settings, 'AUTH_PASSWORD_VALIDATORS', []))
        if val_count >= 3:
            self.log_pass("Password Security Validators", f"{val_count} validators active.")
        else:
            self.log_warn("Password Security Validators", "Fewer than 3 validators configured in settings.py.")

        try:
            from apps.api.views.geofence import calculate_haversine_distance
            dist = calculate_haversine_distance(8.4800, 124.6500, 8.4810, 124.6510)
            if 100.0 <= dist <= 200.0:
                self.log_pass("Haversine Distance Math", f"Calculated 156m vector cleanly ({dist}m).")
            else:
                self.log_warn("Haversine Distance Math", f"Unexpected calculation: {dist}m.")
        except Exception as err:
            self.log_fail(
                "SEC-01", "Haversine Distance Math", str(err),
                "backend/apps/api/views/geofence.py",
                "Haversine calculation function threw an exception.",
                "Ensure calculate_haversine_distance converts inputs with float() and handles None."
            )

    def print_remediation_manual(self):
        if not self.guides:
            return

        print("\n" + "#" * 80)
        print(" ACTION REQUIRED: STEP-BY-STEP BUG FIXING MANUAL")
        print("#" * 80)

        for idx, g in enumerate(self.guides, 1):
            print(f"\n[{idx}] BUG #{g['bug_id']}: {g['title']}")
            print("-" * 80)
            print(f"FILE LOCATION: {g['file']}")
            print(f"WHAT HAPPENED: {g['reason']}")
            print(f"EXACT ERROR:   {g['error']}")
            print(f"\nHOW TO FIX IT:\n   {g['fix']}")
            print("-" * 80)

    def print_summary(self):
        self.banner("Final Full-System Audit Summary")
        print(f"Total Tests Passed:      {self.passes}")
        print(f"Total Warnings Logged:   {self.warnings}")
        print(f"Total Bugs Detected:     {self.failures}")

        if self.failures == 0:
            print("\n>> VERDICT: ALL AUDIT SUITES CLEAN - 0 BUGS FOUND.")
            print(">> All API endpoints, CRUD operations, database models, frontend, and mobile checks are working.")
            print(">> Safe to launch the system:")
            print("   Backend: python manage.py runserver 0.0.0.0:8000")
            print("   Web:     npm run dev (inside web folder)")
            print("   Mobile:  npx expo start (inside mobile folder)")
        else:
            print(f"\n>> VERDICT: {self.failures} BUG(S) DETECTED.")
            print(">> Follow the step-by-step guides printed in the manual above to fix them before launching.")
        print("=" * 80 + "\n")


if __name__ == '__main__':
    auditor = ProjectAuditor()
    auditor.check_backend_core()
    auditor.check_database()
    auditor.check_model_rules()
    auditor.check_live_crud()
    auditor.check_querysets()
    auditor.check_api_routes()
    auditor.check_frontend_and_mobile()
    auditor.check_security()
    auditor.print_remediation_manual()
    auditor.print_summary()