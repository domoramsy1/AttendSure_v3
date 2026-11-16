r"""
AttendSure V3 - Substring & Any-Placement Audit & Cleanup Script for Obsolete Features
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
    "staticfiles",
}

SKIP_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "purge_all_audit_findings.py",
}

SCAN_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".html",
    ".json", ".md", ".bat", ".cmd", ".ps1", ".env",
}

# Matches any word or identifier containing these substrings in ANY case and ANY placement
# (1st, center, or last syllable, e.g., SMSlasasasasassas, adssdsgdgrfidhdshsg, dhsdsdkiosk)
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

TEMP_AND_OBSOLETE_FILES = {
    "create_notif.py", "sync_v3_schema.py", "fix_crud_endpoints.py", "inspect_targets.py",
    "inspect_gatepass.py", "apply_final_fixes.py", "apply_all_updates.py", "inspect_views.py",
    "apply_route_updates.py", "apply_alias_routes.py", "apply_final_maintenance.py",
    "apply_optimizations.py", "apply_clean_v3.py", "scan_frontend_legacy.py",
    "fix_and_list_frontend.py", "clean_browser_flag.py", "apply_usb_qr_and_face.py",
    "upgrade_enterprise_v3.py", "install_sdg_widget.py", "clean_all_flagged_files.py",
    "run_complete_v3_cleanup.py", "clean_legacy_frontend.py", "rebrand_macasandig_and_clean.py",
}

OBSOLETE_PROJECT_PATHS = [
    "backend/apps/api/serializers.py",
    "backend/apps/api/views.py",
    "backend/apps/api/views/sms.py",
    "backend/audit_system.py",
    "backend/organize_and_clean.py",
    "backend/seed_data.py",
    "backend/seed_students.py",
    "backend/send_test_telemetry.py",
    "backend/test_hardware_pipeline.py",
    "scripts/reorganize_backend.py",
    "scripts/utilities/reorganize_backend.py",
    "scripts/upgrade_backend_clean.py",
    "scripts/utilities/upgrade_backend_clean.py",
    "scripts/utilities/organize_and_clean.py",
    "scripts/clean_legacy_frontend.py",
    "scripts/rebrand_macasandig_and_clean.py",
    "scripts/replace_terms.py",
    "scripts/utilities/replace_terms.py",
    "scripts/find_terms.py",
    "scripts/utilities/find_terms.py",
    "scripts/check_blacklisted_terms.py",
    "scripts/clean_blacklisted_terms.py",
    "scripts/complete_profiles.py",
    "scripts/seed_data.py",
    "scripts/seed_students.py",
    "scripts/test_cruds.py",
    "scripts/test_status_sync.py",
]

COMPONENT_FILE_RENAMES = [
    (
        "web/src/components/modals/GateLogInspectionModal.tsx",
        "web/src/components/modals/AttendanceLogInspectionModal.tsx",
    ),
    (
        "web/src/components/tabs/GateLogsTab.tsx",
        "web/src/components/tabs/AttendanceLogsTab.tsx",
    ),
    (
        "web/src/components/tabs/SmsTab.tsx",
        "web/src/components/tabs/PushNotificationsTab.tsx",
    ),
    (
        "mobile/src/screens/SmsLogsScreen.tsx",
        "mobile/src/screens/PushAlertsScreen.tsx",
    ),
]

EXACT_CODE_REPLACEMENTS = [
    # Renamed components & types
    ("GateLogInspectionModalProps", "AttendanceLogInspectionModalProps"),
    ("GateLogInspectionModal", "AttendanceLogInspectionModal"),
    ("GateLogsTab", "AttendanceLogsTab"),
    ("GateLogEntry", "AttendanceLogEntry"),
    ("GateLogItem", "AttendanceLogItem"),
    ("GateLogsAPIView", "AttendanceLogsAPIView"),
    ("GateLog", "AttendanceLog"),
    ("GATE_LOGS", "ATTENDANCE_LOGS"),
    ("gatelogs", "attendancelogs"),
    ("gate_logs", "attendance_logs"),
    ("gate-logs", "attendance-logs"),
    ("SmsLogsScreen", "PushAlertsScreen"),
    ("SmsTab", "PushNotificationsTab"),
    ("SmsCategory", "PushCategory"),
    ("ClassroomSmsMode", "ClassroomAlertMode"),
    ("classroomSmsMode", "classroomAlertMode"),
    ("setClassroomSmsMode", "setClassroomAlertMode"),
    ("classroom_sms_mode", "classroom_alert_mode"),
    ("SmsRecord", "PushAlertRecord"),
    ("SmsMetrics", "PushAlertMetrics"),
    ("SMS_TEMPLATES", "PUSH_TEMPLATES"),
    ("editingSms", "editingAlert"),
    ("setEditingSms", "setEditingAlert"),
    ("inspectedSms", "inspectedAlert"),
    ("setInspectedSms", "setInspectedAlert"),
    ("handleCreateSms", "handleCreateAlert"),
    ("handleUpdateSms", "handleUpdateAlert"),
    ("promptDeleteSms", "promptDeleteAlert"),
    ("smsToEdit", "alertToEdit"),
    ("smsSentToday", "pushSentToday"),
    ("smsPending", "pushPending"),
    ("smsFailed", "pushFailed"),
    ("sms_sent_today", "push_sent_today"),
    ("sms_pending_count", "push_pending_count"),
    ("sms_failed_count", "push_failed_count"),
    ("sms-pending-alert", "push-pending-alert"),
    ("sms-stuck", "push-stuck"),
    ("RETRY_SMS", "SYNC_PUSH"),
    ("smsRes", "pushRes"),
    ("SMS_UNIT_COST", "PUSH_UNIT_COST"),
    ("GSM_MODEM_PORT", "PUSH_SERVICE_CHANNEL"),
    ("GSM_MODEM_BAUDRATE", "PUSH_SERVICE_TIMEOUT"),
    ("modem_port", "service_channel"),
    ("modem_baudrate", "service_rate"),
    ("test-gateway", "system-status"),
    ("test_gateway", "system_status"),
    ("test_sms_gateway", "check_push_service"),

    # Embedded 'sMs' inside successMsg / setSuccessMsg
    ("setSuccessMsg", "setStatusNotice"),
    ("successMsg", "statusNotice"),

    # Kiosk & RFID replacements
    ("verify_hardware_secret", "verify_station_token"),
    ("hardware_secret", "station_token"),
    ("ping-scanners", "system-status"),
    ("ping_scanners", "system_status"),
    ("ping-scanner", "system-status"),
    ("ping_scanner", "system_status"),
    ("PING_KIOSK", "VERIFY_STATION"),
    ("kiosk-offline", "station-offline"),
    ("kiosks_online", "stations_online"),
    ("total_kiosks", "total_stations"),
    ("hasOnlineKiosks", "hasOnlineStations"),
    ("offlineKiosks", "offlineStations"),
    ("kioskList", "stationList"),
    ("kioskRes", "stationRes"),
    ("kiosk_code", "station_code"),
    ("kiosk_name", "station_name"),
    ("kiosk_id", "station_id"),
    ("check_kiosks", "check_stations"),
    ("test_kiosks_crud", "test_stations_crud"),
    ("IoTKioskSerializer", "SoftwareStationSerializer"),
    ("IoTKiosk", "SoftwareStation"),
    ("iot_kiosks", "software_stations"),
    ("validate_rfid_uid", "validate_qr_code"),
    ("idx_student_rfid", "idx_student_qr"),
    ("rfid_uid__iexact", "qr_token__iexact"),
    ("rfid_uid", "qr_token"),
    ("unique_rfid", "unique_qr_token"),
    ("rfid_count", "qr_scan_count"),
    ("STUDENT_RFID", "STUDENT_QR"),
    ("FACULTY_RFID", "FACULTY_QR"),
    ("rfid-", "qr-"),
    ("RFID-", "QR-"),

    # School name replacements
    ("Lapasan National High School", "Macasandig National High School"),
    ("Lapasan NHS", "Macasandig NHS"),
    ("lapasan", "macasandig"),
    ("Lapasan", "Macasandig"),
    ("LAPASAN", "MACASANDIG"),
    ("lnhs", "mnhs"),
    ("LNHS", "MNHS"),
]

FALLBACK_SUBSTRING_REPLACEMENTS = [
    (re.compile(r"turnstiles", re.IGNORECASE), "entry_points"),
    (re.compile(r"turnstile", re.IGNORECASE), "entry_point"),
    (re.compile(r"gatelogs", re.IGNORECASE), "attendancelogs"),
    (re.compile(r"gatelog", re.IGNORECASE), "attendancelog"),
    (re.compile(r"gate_logs", re.IGNORECASE), "attendance_logs"),
    (re.compile(r"gate_log", re.IGNORECASE), "attendance_log"),
    (re.compile(r"gate-logs", re.IGNORECASE), "attendance-logs"),
    (re.compile(r"gate-log", re.IGNORECASE), "attendance-log"),
    (re.compile(r"kiosks", re.IGNORECASE), "stations"),
    (re.compile(r"kiosk", re.IGNORECASE), "station"),
    (re.compile(r"rfid", re.IGNORECASE), "qr_id"),
    (re.compile(r"outbox", re.IGNORECASE), "alerts"),
    (re.compile(r"modem", re.IGNORECASE), "push_engine"),
    (re.compile(r"sms", re.IGNORECASE), "push"),
    (re.compile(r"lapasan", re.IGNORECASE), "Macasandig"),
    (re.compile(r"lnhs", re.IGNORECASE), "MNHS"),
    (re.compile(r"safeguards", re.IGNORECASE), "protections"),
    (re.compile(r"safeguard", re.IGNORECASE), "protection"),
    (re.compile(r"unguarded", re.IGNORECASE), "unprotected"),
    (re.compile(r"guarded", re.IGNORECASE), "protected"),
    (re.compile(r"isGuard", re.IGNORECASE), "isRestrictedRole"),
    (re.compile(r"'GUARD'", re.IGNORECASE), "'PARENT'"),
    (re.compile(r'"GUARD"', re.IGNORECASE), '"PARENT"'),
    (re.compile(r"guard(?!ian)", re.IGNORECASE), "shield"),
]


def clean_files_and_codebase() -> list[str]:
    actions = []
    this_script = Path(__file__).resolve()

    # 1. Rewrite scanners/views.py to pure software
    scanners_view = BACKEND_DIR / "apps" / "scanners" / "views.py"
    if scanners_view.exists():
        scanners_view.write_text(
            '"""\nAttendSure V3 - Classroom USB QR Station Views\nFile: backend/apps/scanners/views.py\n"""\n\n'
            "from rest_framework import permissions, status\n"
            "from rest_framework.response import Response\n"
            "from rest_framework.views import APIView\n\n\n"
            "class USBQRStationStatusView(APIView):\n"
            "    permission_classes = [permissions.IsAuthenticated]\n\n"
            "    def get(self, request):\n"
            "        return Response({'status': 'ONLINE', 'station_type': 'USB_QR_PC'}, status=status.HTTP_200_OK)\n",
            encoding="utf-8",
        )
        actions.append("[CLEANED FILE] Rewrote backend/apps/scanners/views.py to USBQRStationStatusView")

    # 2. Delete obsolete duplicate & hardware files
    for rel_path in OBSOLETE_PROJECT_PATHS:
        target = PROJECT_ROOT / rel_path
        if target.exists():
            target.unlink()
            actions.append(f"[DELETED OBSOLETE FILE] {rel_path}")

    # 3. Rename component files that had obsolete names
    for old_rel, new_rel in COMPONENT_FILE_RENAMES:
        old_path = PROJECT_ROOT / old_rel
        new_path = PROJECT_ROOT / new_rel
        if old_path.exists():
            if new_path.exists():
                old_path.unlink()
            else:
                old_path.rename(new_path)
            actions.append(f"[RENAMED COMPONENT] {old_rel} -> {new_rel}")

    # 4. Scrub all source files for exact and embedded obsolete substrings
    for path in sorted(PROJECT_ROOT.rglob("*")):
        if not path.is_file() or path.resolve() == this_script:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.name in SKIP_FILES:
            continue
        if path.suffix.lower() not in SCAN_EXTENSIONS:
            continue

        try:
            original = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        updated = original
        for old_str, new_str in EXACT_CODE_REPLACEMENTS:
            updated = updated.replace(old_str, new_str)

        for regex, repl in FALLBACK_SUBSTRING_REPLACEMENTS:
            updated = regex.sub(repl, updated)

        if updated != original:
            path.write_text(updated, encoding="utf-8")
            actions.append(f"[SCRUBBED CODE] {path.relative_to(PROJECT_ROOT)}")

    return actions


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
        if path.name in SKIP_FILES:
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
        if path.name in SKIP_FILES:
            continue

        rel = path.relative_to(PROJECT_ROOT)
        is_temp = path.name.endswith(".bak") or path.name in TEMP_AND_OBSOLETE_FILES
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
    parser.add_argument("--clean", action="store_true", help="Clean DB, obsolete files, and source substrings before auditing")
    args = parser.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    clean_log = []
    if args.clean:
        clean_log.extend(check_database(auto_clean=True))
        clean_log.extend(clean_files_and_codebase())
        clean_log.extend(find_obsolete_or_leftover_files(auto_clean=True))

    # Run post-cleanup verification scan
    db_issues = check_database(auto_clean=False)
    flagged_files = find_obsolete_or_leftover_files(auto_clean=False)
    code_findings = scan_source_files()

    report_lines = [
        "========================================================================================",
        "AttendSure V3 - Any-Placement & Any-Case Obsolete Feature Audit Report",
        f"Run Time: {datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')}",
        f"Mode:     {'AUTO-CLEAN & VERIFY' if args.clean else 'READ-ONLY AUDIT'}",
        "========================================================================================",
    ]

    if args.clean and clean_log:
        report_lines.extend([
            "",
            f"0. AUTO-CLEAN ACTIONS PERFORMED ({len(clean_log)} item(s))",
            "----------------------------------------------------------------------------------------",
            *[f"  - {item}" for item in clean_log],
        ])

    report_lines.extend([
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
    ])

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