"""
AttendSure V3 - Database Health & Latency Test
File: scripts/check_database.py
Run: python scripts/check_database.py
"""

import os
import sys
import time
import django

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, 'backend')
sys.path.extend([ROOT_DIR, BACKEND_DIR])

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
django.setup()

from django.db import connection

def run():
    start = time.perf_counter()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
        latency_ms = max(1, round((time.perf_counter() - start) * 1000))
        print(f"[AttendSure] Database Engine: {connection.vendor.upper()}")
        print(f"[AttendSure] Status: Connected and Healthy ({latency_ms} ms)")
    except Exception as exc:
        print(f"[AttendSure] Database Error: {exc}")

if __name__ == '__main__':
    run()