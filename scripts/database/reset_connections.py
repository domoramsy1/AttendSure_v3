# AttendSure Scripts - Reset Connections
# File: D:\AttendSure_V3\scripts\database\reset_connections.py

r"""
AttendSure - Terminate Stuck Idle PostgreSQL Connections
Run: python database\reset_connections.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import setup_django

setup_django()

from django.db import connection


def main():
    if connection.vendor != "postgresql":
        print(f"Skipped: active engine is {connection.vendor}.")
        return
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND state = 'idle';
        """)
        terminated = cursor.rowcount
    print(f"[OK] Terminated {terminated} idle PostgreSQL connection(s).")


if __name__ == "__main__":
    main()
