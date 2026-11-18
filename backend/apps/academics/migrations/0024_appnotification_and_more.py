"""
AttendSure - Clean Retired Models & Create Direct Chat Table
File: backend/apps/academics/migrations/0024_appnotification_and_more.py
"""

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def remove_legacy_columns(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for table_name in ('faculty_profiles', 'students'):
            cols = {col.name for col in schema_editor.connection.introspection.get_table_description(cursor, table_name)}
            if 'rfid_uid' in cols:
                cursor.execute(f'ALTER TABLE "{table_name}" DROP COLUMN IF EXISTS rfid_uid CASCADE;')


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0023_appnotification_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(remove_legacy_columns, reverse_code=migrations.RunPython.noop),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(model_name='facultyprofile', name='rfid_uid'),
                migrations.RemoveField(model_name='student', name='rfid_uid'),
                migrations.DeleteModel(name='SmsOutbox'),
                migrations.DeleteModel(name='FacultyGateLog'),
                migrations.DeleteModel(name='IoTKiosk'),
                migrations.DeleteModel(name='StudentGateLog'),
            ],
            database_operations=[],
        ),
        migrations.CreateModel(
            name='ParentFacultyMessage',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('body', models.TextField()),
                ('is_read', models.BooleanField(db_index=True, default=False)),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('faculty', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='chat_messages',
                    to='academics.facultyprofile',
                )),
                ('parent', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='parent_chat_messages',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('sender', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sent_chat_messages',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('student', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='chat_messages',
                    to='academics.student',
                )),
            ],
            options={
                'db_table': 'parent_faculty_messages',
                'ordering': ['created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='parentfacultymessage',
            index=models.Index(fields=['student', 'faculty', 'created_at'], name='parent_facu_student_32cff0_idx'),
        ),
        migrations.AddIndex(
            model_name='parentfacultymessage',
            index=models.Index(fields=['parent', 'is_read'], name='parent_facu_parent__51f98a_idx'),
        ),
    ]