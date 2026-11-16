r"""
AttendSure V3 - Substring & Any-Placement Audit Script for Obsolete Features
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
    "node_modules",
    ".git",
    ".next",
    ".expo",
    "dist",
    "build",
    "__pycache__",
    "venv",
    ".venv",
    "results",
    "migrations",
    "_backup_monoliths",
}

SCAN_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".html",
    ".json", ".md", ".bat", ".cmd", ".ps1", ".env",
}

# Matches any word or identifier containing these substrings in any case and any placement
# (beginning, middle, or end of the word, e.g. SMSlasasasasassas, adssdsgdgrfidhdshsg, dhsdsdkiosk)
OBSOLETE_SUBSTRINGS = {
    "Obsolete SMS & Modem": [
        "sms",
        "modem",
        "outbox",
        "test-gateway",
        "test_gateway",
    ],
    "Obsolete Kiosk, RFID & Gate Hardware": [
        "rfid",
        "kiosk",
        "turnstile",
        "gatelog",
        "gate_log",
        "gate-log",
        "hardware_secret",
        "ping_scanner",
        "ping-scanner",
    ],
    "Obsolete School Name (Lapasan)": [
        "lapasan",
        "lnhs",
    ],
    "Obsolete Guard Role": [
        r"guard(?!ian)",
    ],
    "Insecure Browser Flag": [
        "unsafely-treat-insecure-origin-as-secure",
    ],
}

COMPILED_PATTERNS = {
    category: re.compile(
        r"[\w-]*(?:" + "|".join(terms) + r")[\w-]*",
        re.IGNORECASE,
    )
    for category, terms in OBSOLETE_SUBSTRINGS.items()
}

COMBINED_FILENAME_REGEX = re.compile(
    r"[\w.-]*(?:sms|modem|outbox|rfid|kiosk|turnstile|gatelog|gate_log|lapasan|lnhs)[\w.-]*",
    re.IGNORECASE,
)

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

    retired_tables = (
        "sms_outbox",
        "iot_kiosks",
        "faculty_gate_logs",
        "student_gate_logs",
        "student_gate_logs_partitioned",
    )
    retired_views = (
        "vw_deped_sf1_register",
        "vw_hourly_gate_traffic",
        "vw_faculty_dtr_status",
    )
    db_substring_regex = re.compile(
        r"(sms|modem|outbox|rfid|kiosk|turnstile|gatelog|gate_log|lapasan)",
        re.IGNORECASE,
    )

    with connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.views WHERE table_schema = 'public'")
        active_views = {row[0] for row in cursor.fetchall()}
        for v_name in sorted(active_views):
            if v_name in retired_views or db_substring_regex.search(v_name):
                if auto_clean:
                    cursor.execute(f'DROP VIEW IF EXISTS "{v_name}" CASCADE;')
                    issues.append(f"[CLEANED] Dropped obsolete database view: {v_name}")
                else:
                    issues.append(f"[DB VIEW] Obsolete view exists: {v_name}")

        existing_tables = set(connection.introspection.table_names(cursor))
        for t_name in sorted(existing_tables):
            if t_name in retired_tables or db_substring_regex.search(t_name):
                if auto_clean:
                    cursor.execute(f'DROP TABLE IF EXISTS "{t_name}" CASCADE;')
                    issues.append(f"[CLEANED] Dropped obsolete database table: {t_name}")
                else:
                    issues.append(f"[DB TABLE] Obsolete table exists: {t_name}")

        remaining_tables = set(connection.introspection.table_names(cursor))
        for table_name in sorted(remaining_tables):
            cols = [col.name for col in connection.introspection.get_table_description(cursor, table_name)]
            for col_name in cols:
                if db_substring_regex.search(col_name):
                    if auto_clean and col_name.lower() == "rfid_uid":
                        cursor.execute(f'ALTER TABLE "{table_name}" DROP COLUMN IF EXISTS "{col_name}" CASCADE;')
                        issues.append(f"[CLEANED] Dropped obsolete column {col_name} from {table_name}")
                    else:
                        issues.append(f"[DB COLUMN] Obsolete column '{col_name}' found on table '{table_name}'")

        if "user_profiles" in remaining_tables:
            cursor.execute("SELECT COUNT(*) FROM user_profiles WHERE UPPER(role) LIKE '%GUARD%';")
            guard_count = cursor.fetchone()[0]
            if guard_count > 0:
                if auto_clean:
                    cursor.execute(
                        "UPDATE user_profiles SET role = 'PARENT', is_teaching = FALSE WHERE UPPER(role) LIKE '%GUARD%';"
                    )
                    issues.append(f"[CLEANED] Converted {guard_count} legacy GUARD profile(s) to PARENT.")
                else:
                    issues.append(f"[DB DATA] Found {guard_count} user profile(s) matching 'GUARD'.")

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
            if not stripped:
                continue

            for category, regex in COMPILED_PATTERNS.items():
                for match in regex.finditer(line):
                    matched_word = match.group(0)
                    file_hits.append({
                        "line": line_no,
                        "category": category,
                        "keyword": matched_word,
                        "code": stripped[:140],
                    })

        if file_hits:
            findings.append({
                "file": str(path.relative_to(PROJECT_ROOT)),
                "hits": file_hits,
            })

    return findings


def find_obsolete_or_leftover_files(auto_clean: bool = False) -> list[str]:
    this_script = Path(__file__).resolve()
    flagged_files = []

    for path in sorted(PROJECT_ROOT.rglob("*")):
        if not path.is_file() or path.resolve() == this_script:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue

        rel = path.relative_to(PROJECT_ROOT)
        is_temp = path.name.endswith(".bak") or path.name in TEMP_SCRIPT_NAMES
        name_match = COMBINED_FILENAME_REGEX.search(path.name)

        if is_temp:
            if auto_clean:
                path.unlink()
                flagged_files.append(f"[DELETED TEMP FILE] {rel}")
            else:
                flagged_files.append(f"[TEMP FILE] {rel}")
        elif name_match:
            flagged_files.append(f"[OBSOLETE FILENAME MATCH: '{name_match.group(0)}'] {rel}")

    return flagged_files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    db_issues = check_database(auto_clean=args.clean)
    flagged_files = find_obsolete_or_leftover_files(auto_clean=args.clean)
    code_findings = scan_source_files()

    report_lines = [
        "========================================================================================",
        "AttendSure V3 - Any-Placement & Any-Case Obsolete Feature Audit Report",
        f"Run Time: {datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')}",
        f"Mode:     {'AUTO-CLEAN ENABLED' if args.clean else 'READ-ONLY AUDIT'}",
        "========================================================================================",
        "",
        "1. POSTGRESQL DATABASE CHECK (Tables, Views, Columns & Roles)",
        "----------------------------------------------------------------------------------------",
        *([f"  - {i}" for i in db_issues] or ["  [PASS] PostgreSQL database is 100% clean."]),
        "",
        "2. FILE NAMES & LEFTOVER TEMP FILES MATCHING OBSOLETE TERMS",
        "----------------------------------------------------------------------------------------",
        *([f"  - {i}" for i in flagged_files] or ["  [PASS] No file names or temp files match obsolete terms."]),
        "",
        "3. SOURCE CODE SCAN (Matches in 1st, Center, or Last Syllable in Any Case)",
        "----------------------------------------------------------------------------------------",
    ]

    total_code_hits = sum(len(f["hits"]) for f in code_findings)
    if code_findings:
        for entry in code_findings:
            report_lines.append(f"\n  FILE: {entry['file']} ({len(entry['hits'])} match(es))")
            for hit in entry["hits"]:
                report_lines.append(
                    f"    Line {hit['line']:04d} [{hit['category']}] Word: ({hit['keyword']}) -> {hit['code']}"
                )
    else:
        report_lines.append("  [PASS] Zero obsolete substrings found anywhere in the codebase.")

    report_lines.extend([
        "",
        "========================================================================================",
        f"SUMMARY: {len(db_issues)} DB Item(s) | {len(flagged_files)} File Name Match(es) | {total_code_hits} Word Match(es) in {len(code_findings)} File(s)",
        f"Report Saved To: {REPORT_FILE}",
        "========================================================================================",
    ])

    full_report = "\n".join(report_lines)
    print(full_report)
    REPORT_FILE.write_text(full_report, encoding="utf-8")


if __name__ == "__main__":
    main()