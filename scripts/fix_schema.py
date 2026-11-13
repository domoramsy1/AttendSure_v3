import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    # 1. Inspect schedules columns
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='schedules';")
    sched_cols = [r[0] for r in cursor.fetchall()]
    if 'faculty_id' in sched_cols and 'teacher_id' not in sched_cols:
        cursor.execute('ALTER TABLE "schedules" RENAME COLUMN "faculty_id" TO "teacher_id";')
        print("Reverted schedules.faculty_id -> teacher_id")
    else:
        print("schedules.teacher_id is already in place.")

    # 2. Inspect subject_attendance_logs columns
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='subject_attendance_logs';")
    sub_cols = [r[0] for r in cursor.fetchall()]
    if 'faculty_id' in sub_cols and 'teacher_id' not in sub_cols:
        cursor.execute('ALTER TABLE "subject_attendance_logs" RENAME COLUMN "faculty_id" TO "teacher_id";')
        print("Reverted subject_attendance_logs.faculty_id -> teacher_id")
    else:
        print("subject_attendance_logs.teacher_id is already in place.")

print("\nSchedule column restoration complete!")