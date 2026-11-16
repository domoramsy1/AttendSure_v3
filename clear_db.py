# backend/clear_db.py
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("""
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = current_database() 
          AND pid != pg_backend_pid();
    """)

print("Successfully terminated all stuck PostgreSQL connections.")