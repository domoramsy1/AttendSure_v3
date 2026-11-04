"""
AttendSure V3 - Hardware Kiosks Ping Test
File: scripts/ping_hardware_kiosks.py
Run: python scripts/ping_hardware_kiosks.py
"""

import os
import sys
from datetime import timedelta
import django

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, 'backend')
sys.path.extend([ROOT_DIR, BACKEND_DIR])

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
django.setup()

from django.utils import timezone
from apps.academics.models import IoTKiosk

def run():
    now = timezone.now()
    active_cutoff = now - timedelta(minutes=5)
    kiosks = IoTKiosk.objects.filter(is_active=True)

    print(f"\n--- Checking {kiosks.count()} Gate Hardware Kiosks ---")
    for k in kiosks:
        is_online = bool(k.last_ping and k.last_ping >= active_cutoff)
        status_text = "ONLINE" if is_online else "OFFLINE"
        last_seen = timezone.localtime(k.last_ping).strftime('%I:%M:%S %p') if k.last_ping else 'Never'
        print(f"[{status_text}] {k.terminal_name} ({k.kiosk_code}) at {k.location} - Last Ping: {last_seen}")
    print("--------------------------------------------------\n")

if __name__ == '__main__':
    run()