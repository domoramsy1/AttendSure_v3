import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='schedules';")
    cols = [r[0] for r in cursor.fetchall()]
    print("Columns currently in schedules:", cols)

    if 'teacher_id' in cols and 'faculty_id' not in cols:
        cursor.execute('ALTER TABLE "schedules" RENAME COLUMN "teacher_id" TO "faculty_id";')
        print("Renamed column: schedules.teacher_id -> faculty_id")
    elif 'faculty_id' in cols:
        print("Column schedules.faculty_id already exists.")
    else:
        print("Notice: Neither teacher_id nor faculty_id found in schedules.")

print("Done!")