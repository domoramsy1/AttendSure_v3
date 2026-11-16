r"""
AttendSure V3 - Macasandig NHS Rebrand & Obsolete Feature Purge
File: D:\AttendSure_V3\scripts\rebrand_macasandig_and_clean.py
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(r"D:\AttendSure_V3")
BACKEND_DIR = PROJECT_ROOT / "backend"

SKIP_DIRS = {
    "node_modules", ".git", ".next", ".expo", "dist", "build",
    "__pycache__", "venv", ".venv", "migrations", "_backup_monoliths",
}

SCAN_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".json",
    ".md", ".bat", ".cmd", ".ps1", ".env",
}

TEXT_REPLACEMENTS = [
    # 1. School Name, Abbreviation & Domain Rebranding
    ("Lapasan National High School", "Macasandig National High School"),
    ("LAPASAN NATIONAL HIGH SCHOOL", "MACASANDIG NATIONAL HIGH SCHOOL"),
    ("lapasan national high school", "macasandig national high school"),
    ("Lapasan NHS", "Macasandig NHS"),
    ("LAPASAN NHS", "MACASANDIG NHS"),
    ("lapasan.attendsure.com.ph", "macasandig.attendsure.com.ph"),
    ("lapasan@deped.gov.ph", "macasandig.nhs@deped.gov.ph"),
    ("lnhs@deped.gov.ph", "macasandig.nhs@deped.gov.ph"),
    ("Lapasan, Cagayan de Oro City", "Macasandig, Cagayan de Oro City"),
    ("'LNHS'", "'MNHS'"),
    ('"LNHS"', '"MNHS"'),

    # 2. Settings Tab - Obsolete Metric Cards & One-Click System Fixes
    ("GATE SCANNERS", "USB QR & CAMPUS GPS"),
    ("Gate Scanners", "USB QR & Campus GPS"),
    ("TEXTS SENT TODAY", "PUSH ALERTS TODAY"),
    ("Texts Sent Today", "Push Alerts Today"),
    ("FAILED / QUEUED TEXTS", "PENDING PUSH ALERTS"),
    ("Failed / Queued Texts", "Pending Push Alerts"),
    ("Retry Failed Parent Texts", "Sync Parent Push Alerts"),
    ("Fixes messages blocked by signal drops", "Delivers pending mobile app notifications"),
    (
        "If parents are not receiving gate entry or exit notifications due to temporary SIM signal loss, click here to restart the queue and re-send all failed texts automatically.",
        "Refreshes the mobile push notification service so parents immediately receive classroom attendance and exit pass alerts on the AttendSure mobile app.",
    ),
    ("Retry All Failed Texts", "Sync Push Alerts Now"),
    ("Check Gate Scanners", "Verify USB QR & Campus GPS"),
    ("Tests connection to RFID & QR terminals", "Checks USB QR station & campus GPS boundary"),
    (
        "Sends a live ping signal to the school gate scanners. Verifies whether RFID card readers and cameras are responding and ready to record learner entries.",
        "Verifies that classroom USB QR code scanning and faculty mobile facial recognition & campus GPS check-ins are online and connected to PostgreSQL.",
    ),
    ("Check Scanner Terminals", "Verify Software Stations"),
    ("Unlock Staff Accounts", "Unlock Faculty Accounts"),

    # 3. Header, Footer & Modal Pure-Software Labels
    ("Gate Online", "System Online"),
    ("Gate Offline", "System Offline"),
    ("Gate Ready", "QR & Push Ready"),
    ("Gate Passes", "Exit Passes"),
    ("GATE & TELEMETRY", "ATTENDANCE & ALERTS"),
]


def update_database_records():
    if not BACKEND_DIR.exists():
        return

    sys.path.insert(0, str(BACKEND_DIR))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendsure_core.settings")

    try:
        import django
        django.setup()
        from apps.academics.models import SchoolProfile, Student
        from django.core.cache import cache

        school = SchoolProfile.objects.first()
        if school:
            changed = False
            if not school.school_name or "lapasan" in school.school_name.lower():
                school.school_name = "Macasandig National High School"
                changed = True
            if not school.address or "lapasan" in school.address.lower():
                school.address = "Macasandig, Cagayan de Oro City, Misamis Oriental"
                changed = True
            if school.email and "lapasan" in school.email.lower():
                school.email = "macasandig.nhs@deped.gov.ph"
                changed = True
            if changed:
                school.save()
                print("[DB UPDATED] SchoolProfile updated to Macasandig National High School.")

        updated_students = Student.objects.filter(barangay__iexact="Lapasan").update(barangay="Macasandig")
        if updated_students:
            print(f"[DB UPDATED] Updated {updated_students} student barangay record(s) to Macasandig.")

        cache.clear()
    except Exception as exc:
        print(f"[DB WARNING] Could not update database directly: {exc}")


def update_codebase_files():
    this_file = Path(__file__).resolve()
    modified_count = 0

    for path in sorted(PROJECT_ROOT.rglob("*")):
        if not path.is_file() or path.resolve() == this_file:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in SCAN_EXTENSIONS:
            continue

        try:
            original = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        updated = original
        for old_str, new_str in TEXT_REPLACEMENTS:
            updated = updated.replace(old_str, new_str)

        if updated != original:
            path.write_text(updated, encoding="utf-8")
            modified_count += 1
            print(f"[UPDATED] {path.relative_to(PROJECT_ROOT)}")

    print(f"\nCompleted: Updated {modified_count} file(s) across the project.")


if __name__ == "__main__":
    update_database_records()
    update_codebase_files()