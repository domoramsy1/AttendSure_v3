r"""
AttendSure V3 - Project Audit & Cleanup Script for Unused Features
File: D:\AttendSure_V3\scripts\check_unused_features.py
"""

import argparse
import os
import re
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(r"D:\AttendSure_V3")
BACKEND_DIR = PROJECT_ROOT / "backend"
RESULTS_DIR = PROJECT_ROOT / "scripts" / "results"
REPORT_FILE = RESULTS_DIR / "unused_features_audit.txt"

SKIP_DIRS = {
    "node_modules", ".git", ".next", ".expo", "dist", "build",
    "__pycache__", "venv", ".venv", "results", "migrations",
}

SCAN_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".bat", ".cmd", ".ps1"}

RETIRED_PATTERNS = {
    "SMS Outbox & Modem": re.compile(
        r"\b(app_notifications|AppNotification|'notifications/'|test-gateway|test_gateway|send_sms|serial_modem|gsm_modem)\b",
        re.IGNORECASE,
    ),
    "Gate 'geofence/status/' & Hardware Scanner": re.compile(
        r"(['\"/]'geofence/status/'/?['\"]|\b(iot_'geofence/status/'|IoT'geofence/status/'|'geofence/status/'_code|ping-scanners|ping_scanners|FacultyGateLog|StudentGateLog|faculty_gate_logs|student_gate_logs|verify_hardware_secret)\b)",
        re.IGNORECASE,
    ),
    "QR ID Card Fields": re.compile(
        r"\b(qr_token|qr_token|idx_student_rfid|QR ID_TAP)\b",
        re.IGNORECASE,
    ),
    "Retired Security Guard Role": re.compile(
        r"(['\"]GUARD['\"]|Gate Security Guard|Security & Gate Operations|Security Officer)"
    ),
    "Insecure Browser Flag": re.compile(
        r"--unsafely-treat-insecure-origin-as-secure",
        re.IGNORECASE,
    ),
}

TEMP_SCRIPT_NAMES = {
    "create_notif.py", "sync_v3_schema.py", "fix_crud_endpoints.py", "inspect_targets.py",
    "inspect_gatepass.py", "apply_final_fixes.py", "apply_all_updates.py", "inspect_views.py",
    "apply_route_updates.py", "apply_alias_routes.py", "apply_final_maintenance.py",
    "apply_optimizations.py", "apply_clean_v3.py", "scan_frontend_legacy.py",
    "fix_and_list_frontend.py", "clean_browser_flag.py", "apply_usb_qr_and_face.py",
    "upgrade_enterprise_v3.py", "install_sdg_widget.py", "clean_all_flagged_files.py",
    "run_complete_v3_cleanup.py",
}


def check_database(auto_clean: bool = False) -> list[str]:
    issues = []
    if not BACKEND_DIR.exists():
        return ["Backend folder not found; skipped database check."]

    sys.path.insert(0, str(BACKEND_DIR))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendsure_core.settings")

    try:
        import django
        django.setup()
        from django.db import connection
    except Exception as exc:
        return [f"Could not connect to Django database: {exc}"]

    retired_tables = ("app_notifications", "iot_'geofence/status/', "faculty_gate_logs", "student_gate_logs", "student_gate_logs_partitioned")
    retired_views = ("vw_deped_sf1_register", "vw_hourly_gate_traffic", "vw_faculty_dtr_status")

    with connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.views WHERE table_schema = 'public'")
        active_views = {row[0] for row in cursor.fetchall()}
        for v_name in retired_views:
            if v_name in active_views:
                if auto_clean:
                    cursor.execute(f'DROP VIEW IF EXISTS "{v_name}" CASCADE;')
                    issues.append(f"[CLEANED] Dropped retired database view: {v_name}")
                else:
                    issues.append(f"[DB VIEW] Retired view still exists: {v_name}")

        existing_tables = set(connection.introspection.table_names(cursor))
        for t_name in retired_tables:
            if t_name in existing_tables:
                if auto_clean:
                    cursor.execute(f'DROP TABLE IF EXISTS "{t_name}" CASCADE;')
                    issues.append(f"[CLEANED] Dropped retired database table: {t_name}")
                else:
                    issues.append(f"[DB TABLE] Retired table still exists: {t_name}")

        for table_name in ("students", "faculty_profiles"):
            if table_name in existing_tables:
                cols = {col.name for col in connection.introspection.get_table_description(cursor, table_name)}
                if "qr_token" in cols:
                    if auto_clean:
                        cursor.execute(f'ALTER TABLE "{table_name}" DROP COLUMN IF EXISTS qr_token CASCADE;')
                        issues.append(f"[CLEANED] Dropped qr_token column from {table_name}")
                    else:
                        issues.append(f"[DB COLUMN] Retired column qr_token still exists on: {table_name}")

        if "user_profiles" in existing_tables:
            cursor.execute("SELECT COUNT(*) FROM user_profiles WHERE UPPER(role) = 'GUARD';")
            guard_count = cursor.fetchone()[0]
            if guard_count > 0:
                if auto_clean:
                    cursor.execute("UPDATE user_profiles SET role = 'PARENT', is_teaching = FALSE WHERE UPPER(role) = 'GUARD';")
                    issues.append(f"[CLEANED] Converted {guard_count} legacy GUARD profile(s) to PARENT.")
                else:
                    issues.append(f"[DB DATA] Found {guard_count} user profile(s) still using 'GUARD'.")

    return issues


def scan_source_files() -> list[dict]:
    this_script = Path(__file__).resolve()
    findings = []

    for path in sorted(PROJECT_ROOT.rglob("*")):
        if not path.is_file() or path.resolve() == this_script:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in SCAN_EXTENSIONS:
            continue

        try:
            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except Exception:
            continue

        file_hits = []
        for line_no, line in enumerate(lines, start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith(("#", "//", "*", "/*")):
                continue
            for category, regex in RETIRED_PATTERNS.items():
                match = regex.search(line)
                if match:
                    file_hits.append({
                        "line": line_no,
                        "category": category,
                        "keyword": match.group(0),
                        "code": stripped[:120],
                    })

        if file_hits:
            findings.append({"file": str(path.relative_to(PROJECT_ROOT)), "hits": file_hits})

    return findings


def find_leftover_files(auto_clean: bool = False) -> list[str]:
    leftovers = []
    for path in sorted(PROJECT_ROOT.rglob("*")):
        if not path.is_file() or any(part in {"node_modules", ".git", "venv", ".venv"} for part in path.parts):
            continue
        if path.name.endswith(".bak") or path.name in TEMP_SCRIPT_NAMES:
            rel = path.relative_to(PROJECT_ROOT)
            if auto_clean:
                path.unlink()
                leftovers.append(f"[DELETED] Removed leftover file: {rel}")
            else:
                leftovers.append(f"[FILE] Leftover file: {rel}")
    return leftovers


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    db_issues = check_database(auto_clean=args.clean)
    leftover_files = find_leftover_files(auto_clean=args.clean)
    code_findings = scan_source_files()

    report_lines = [
        "========================================================================================",
        "AttendSure V3 - Unused Features & Cleanliness Audit Report",
        f"Run Time: {datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')}",
        f"Mode:     {'AUTO-CLEAN ENABLED' if args.clean else 'READ-ONLY AUDIT'}",
        "========================================================================================",
        "",
        "1. POSTGRESQL DATABASE CHECK",
        "----------------------------------------------------------------------------------------",
        *([f"  - {i}" for i in db_issues] or ["  [PASS] PostgreSQL database is 100% clean."]),
        "",
        "2. LEFTOVER BACKUP & TEMP FILES",
        "----------------------------------------------------------------------------------------",
        *([f"  - {i}" for i in leftover_files] or ["  [PASS] No leftover backup or temp files."]),
        "",
        "3. SOURCE CODE SCAN (Backend, Web Portal & Mobile App)",
        "----------------------------------------------------------------------------------------",
    ]

    total_code_hits = sum(len(f["hits"]) for f in code_findings)
    if code_findings:
        for entry in code_findings:
            report_lines.append(f"\n  FILE: {entry['file']} ({len(entry['hits'])} match(es))")
            for hit in entry["hits"]:
                report_lines.append(f"    Line {hit['line']:04d} [{hit['category']}] ({hit['keyword']}): {hit['code']}")
    else:
        report_lines.append("  [PASS] Zero SMS, gate 'geofence/status/', QR ID, or guard references found in active code files.")

    report_lines.extend([
        "",
        "========================================================================================",
        f"SUMMARY: {len(db_issues)} DB Item(s) | {len(leftover_files)} Leftover File(s) | {total_code_hits} Code Match(es) in {len(code_findings)} File(s)",
        f"Report Saved To: {REPORT_FILE}",
        "========================================================================================",
    ])

    full_report = "\n".join(report_lines)
    print(full_report)
    REPORT_FILE.write_text(full_report, encoding="utf-8")


if __name__ == "__main__":
    main()
