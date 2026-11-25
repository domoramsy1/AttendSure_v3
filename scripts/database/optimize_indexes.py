r"""
AttendSure - PostgreSQL Composite Index Optimizer (3NF Schema)
Creates composite indexes on high-frequency lookup columns for fast API reads.
"""

import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
VENV_PYTHON = BACKEND_DIR / "venv" / "Scripts" / "python.exe"

if VENV_PYTHON.is_file() and Path(sys.executable).resolve() != VENV_PYTHON.resolve():
    sys.exit(subprocess.call([str(VENV_PYTHON), str(Path(__file__).resolve()), *sys.argv[1:]]))

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402
from django.apps import apps  # noqa: E402

if not apps.ready:
    django.setup()

from django.db import connection  # noqa: E402

INDEX_SPECS = [
    ("attendance", "ClassAttendance", "idx_classatt_date_enrollment", ["attendance_date", "enrollment"]),
    ("attendance", "ClassAttendance", "idx_classatt_period_date", ["class_period", "attendance_date"]),
    ("attendance", "DailyAttendance", "idx_dailyatt_date_status", ["attendance_date", "status"]),
    ("attendance", "ExitPass", "idx_exitpass_state_window", ["is_cancelled", "returned_at", "valid_until"]),
    ("students", "Enrollment", "idx_enroll_section_status", ["section", "status"]),
    ("students", "Student", "idx_student_active_name", ["is_active", "last_name", "first_name"]),
    ("campus", "TeacherLocationPing", "idx_locping_teacher_time", ["teacher", "recorded_at"]),
    ("campus", "LoafingIncident", "idx_loafing_status_detected", ["status", "detected_at"]),
]


def main() -> None:
    created = 0
    with connection.cursor() as cursor:
        for app_label, model_name, index_name, field_names in INDEX_SPECS:
            try:
                model = apps.get_model(app_label, model_name)
                db_columns = [model._meta.get_field(fname).column for fname in field_names]
            except Exception:
                continue

            table = connection.ops.quote_name(model._meta.db_table)
            idx = connection.ops.quote_name(index_name)
            cols_sql = ", ".join(connection.ops.quote_name(c) for c in db_columns)
            cursor.execute(f"CREATE INDEX IF NOT EXISTS {idx} ON {table} ({cols_sql});")
            print(f"[INDEX READY] {model._meta.db_table} ({', '.join(db_columns)})")
            created += 1

        if connection.vendor == "postgresql":
            cursor.execute("ANALYZE;")
            print("[ANALYZE] Updated PostgreSQL query planner statistics.")

    print(f"\n[OK] Verified {created} composite database indexes.")


if __name__ == "__main__":
    main()
