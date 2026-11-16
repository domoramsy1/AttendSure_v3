"""
AttendSure V3 - Clean State Removal of Retired SMS & terminals Models
File: backend/apps/academics/migrations/0024_appnotification_and_more.py
"""

from django.db import migrations


def drop_retired_tables(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for view_name in ('vw_deped_sf1_register', 'vw_hourly_gate_traffic', 'vw_faculty_dtr_status'):
            cursor.execute(f'DROP VIEW IF EXISTS "{view_name}" CASCADE;')
        for table_name in (
            'app_notifications',
            'geofence_settings',
            'faculty_gate_logs',
            'student_gate_logs_partitioned',
            'student_gate_logs',
        ):
            cursor.execute(f'DROP TABLE IF EXISTS "{table_name}" CASCADE;')


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0023_appnotification_and_more'),
    ]

    operations = [
        migrations.RunPython(drop_retired_tables, reverse_code=migrations.RunPython.noop),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='AppNotification'),
                migrations.DeleteModel(name='FacultyGateLog'),
                migrations.DeleteModel(name='GeofenceSetting'),
                migrations.DeleteModel(name='StudentGateLog'),
            ],
            database_operations=[],
        ),
    ]
