r"""
AttendSure - System Health, Timetable Conflict & Pure-Software Codebase Auditor
Run: python testing\audit_codebase.py
"""

import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import PROJECT_ROOT, RESULTS_DIR, setup_django

setup_django()

from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.urls import resolve
from apps.school.models import ClassPeriod

SKIP_DIRS = {
    ".git", "node_modules", ".expo", "dist", "build", "__pycache__",
    "venv", ".venv", "_legacy_backup", "_archived_legacy", "exports", "results", "migrations", "media", "staticfiles",
}
OBSOLETE_REGEX = re.compile(r"\b(sms_outbox|iot_kiosks|rfid_uid|turnstile|gsm_modem)\b", re.IGNORECASE)


def main():
    lines = [
        "=" * 80,
        f"ATTENDSURE SYSTEM & CODEBASE AUDIT ({datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')})",
        "=" * 80,
    ]

    # 1. Django System & Migration Check
    call_command("check")
    executor = MigrationExecutor(connection)
    pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
    lines.append(f"[PASS] Django check passed | Pending migrations: {len(pending)}")

    # 2. Core Route Resolution
    routes = [
        "/api/v1/health/db/",
        "/api/v1/accounts/login/",
        "/api/v1/school/settings/",
        "/api/v1/students/",
        "/api/v1/attendance/scan/",
        "/api/v1/campus/boundary/",
        "/api/v1/messaging/threads/",
        "/api/v1/reports/sf4/",
        "/api/classroom/class_list/",
        "/api/faculty/dropdown/",
    ]
    for route in routes:
        resolve(route)
    lines.append(f"[PASS] Verified {len(routes)} core v1 and legacy URL routes.")

    # 3. Timetable Double-Booking Check
    periods = list(ClassPeriod.objects.filter(is_active=True).select_related("section", "teacher"))
    conflicts = 0
    for i, p1 in enumerate(periods):
        for p2 in periods[i + 1:]:
            if p1.start_time < p2.end_time and p1.end_time > p2.start_time:
                if p1.teacher_id and p1.teacher_id == p2.teacher_id:
                    conflicts += 1
                if p1.section_id and p1.section_id == p2.section_id:
                    conflicts += 1
    lines.append(f"[{'PASS' if conflicts == 0 else 'WARN'}] Active class periods: {len(periods)} | Schedule conflicts: {conflicts}")

    # 4. Retired Hardware Keyword Scan
    this_file = Path(__file__).resolve()
    hits = []
    for path in PROJECT_ROOT.rglob("*"):
        if not path.is_file() or path.resolve() == this_file or any(p in SKIP_DIRS for p in path.parts):
            continue
        if path.suffix.lower() not in {".py", ".ts", ".tsx"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        match = OBSOLETE_REGEX.search(text)
        if match:
            hits.append(f"  - {path.relative_to(PROJECT_ROOT)}: '{match.group(0)}'")

    lines.append(f"[{'PASS' if not hits else 'WARN'}] Retired hardware identifier hits: {len(hits)}")
    lines.extend(hits[:25])
    lines.append("=" * 80)

    report = "\n".join(lines)
    print(report)
    out = RESULTS_DIR / "system_audit.txt"
    out.write_text(report, encoding="utf-8")
    print(f"Saved audit report to: {out}")


if __name__ == "__main__":
    main()
