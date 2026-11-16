"""
AttendSure V3 - Web & Mobile Pure-Software Endpoint & UI Cleaner
File: D:\AttendSure_V3\scripts\clean_legacy_frontend.py
"""

import re
from pathlib import Path

PROJECT_ROOT = Path(r"D:\AttendSure_V3")
TARGET_DIRS = [PROJECT_ROOT / "web" / "src", PROJECT_ROOT / "mobile" / "src"]
EXTENSIONS = {".ts", ".tsx"}

EXACT_REPLACEMENTS = [
    # DashboardView.tsx pure-software metrics
    ("kiosks_online: number;", "push_alerts_today: number;"),
    ("total_kiosks: number;", "mobile_parents_connected: number;"),
    ("kiosks_online: 0,", "push_alerts_today: 0,"),
    ("total_kiosks: 0,", "mobile_parents_connected: 0,"),
    ("kiosks_online: Number(res.data.kiosks_online) || 0,", "push_alerts_today: Number(res.data.push_alerts_today) || 0,"),
    ("total_kiosks: Number(res.data.total_kiosks) || 0,", "mobile_parents_connected: Number(res.data.mobile_parents_connected) || 0,"),
    ("onGateStatusChange((Number(res.data.kiosks_online) || 0) > 0);", "onGateStatusChange(true);"),
    ("<span>Kiosks: {data.kiosks_online} of {data.total_kiosks} Online</span>", "<span>Push Alerts Today: {data.push_alerts_today} • Parents Connected: {data.mobile_parents_connected}</span>"),

    # EnterpriseSDGWidget.tsx & Sidebar.tsx & StudentIdPassModal.tsx
    ("Zero Gate Kiosks", "Pure Software & Mobile Push"),
    ("label: 'Gate Kiosks'", "label: 'USB QR Station'"),
    ("High-Contrast QR Code for Gate Kiosks", "High-Contrast QR Code for Classroom USB QR Scanner"),

    # Header.tsx & SystemHealthModal.tsx variable cleanup
    ("const kiosks =", "const stations ="),
    ("kiosks.length", "stations.length"),
    ("kiosks.some(", "stations.some("),
    ("kiosks.filter(", "stations.filter("),
    ("hasOnlineKiosks", "hasOnlineSystem"),
    ("const offlineKiosks = kioskList.filter(", "const offlineStations = stationList.filter("),
    ("kioskList", "stationList"),
    ("offlineKiosks", "offlineStations"),
    ("Gate Scanner(s) are offline", "Software Station(s) offline"),

    # Mobile screens & endpoints.ts
    ("SMS_OUTBOX: 'sms-outbox/',", "NOTIFICATIONS: 'notifications/',\n  SYSTEM_STATUS: 'system/status/',"),
    (
        "Present this dynamic QR code to campus gate kiosks for physical check-in and check-out.",
        "Verify your attendance using on-device facial recognition and campus GPS check-in.",
    ),
    (
        "Scan this QR code at campus gate kiosks for check-in and check-out.",
        "Check in and out using facial recognition and campus GPS boundary verification.",
    ),

    # API endpoint migrations (Web & Mobile)
    ("'/api/sms-outbox/metrics/'", "'/api/system/status/'"),
    ("'/sms-outbox/metrics/'", "'/system/status/'"),
    ("'/api/sms-outbox/retry-all-failed/'", "'/api/notifications/mark-read/'"),
    ("'/sms-outbox/retry-all-failed/'", "'/notifications/mark-read/'"),
    ("'/sms-outbox/broadcast/'", "'/notifications/'"),
    ("'/sms-outbox/delete-delivered/'", "'/notifications/mark-read/'"),
    ("'/sms-outbox/clear-pending/'", "'/notifications/mark-read/'"),
    ("'/api/sms-outbox/'", "'/api/notifications/'"),
    ("'/sms-outbox/'", "'/notifications/'"),
    ("'/api/kiosks/'", "'/api/system/status/'"),
    ("'/kiosks/'", "'/system/status/'"),
    ("'/sms/test-gateway/'", "'/system/status/'"),
    ("'/telemetry/ping-scanners/'", "'/system/status/'"),
    ("apiClient.delete('/notifications/mark-read/')", "apiClient.post('/notifications/mark-read/')"),
]

REGEX_REPLACEMENTS = [
    (re.compile(r"`/api/sms-outbox/\$\{([^}]+)\}/retry/`"), "'/api/notifications/mark-read/'"),
    (re.compile(r"`/sms-outbox/\$\{([^}]+)\}/retry/`"), "'/notifications/mark-read/'"),
    (re.compile(r"`/sms-outbox/\$\{([^}]+)\}/`"), r"`/notifications/${\1}/`"),
    (re.compile(r"\bgate kiosks?\b", re.IGNORECASE), "campus GPS check-in"),
]


def clean_frontend_files():
    updated_files = 0

    for base_dir in TARGET_DIRS:
        if not base_dir.exists():
            continue

        for file_path in sorted(base_dir.rglob("*")):
            if not file_path.is_file() or file_path.suffix.lower() not in EXTENSIONS:
                continue

            original = file_path.read_text(encoding="utf-8", errors="ignore")
            updated = original

            for old_text, new_text in EXACT_REPLACEMENTS:
                updated = updated.replace(old_text, new_text)

            for pattern, replacement in REGEX_REPLACEMENTS:
                updated = pattern.sub(replacement, updated)

            if updated != original:
                file_path.write_text(updated, encoding="utf-8")
                updated_files += 1
                print(f"[UPDATED] {file_path.relative_to(PROJECT_ROOT)}")

    print(f"\nCompleted: Updated {updated_files} frontend file(s) to pure-software endpoints.")


if __name__ == "__main__":
    clean_frontend_files()