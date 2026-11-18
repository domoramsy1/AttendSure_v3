"""
AttendSure - App Notifications, Parent Linking & Pure-Software Schema
File: backend/apps/academics/migrations/0023_appnotification_and_more.py
"""

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def drop_legacy_views_and_tables(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for view_name in ('vw_deped_sf1_register', 'vw_hourly_gate_traffic', 'vw_faculty_dtr_status'):
            cursor.execute(f'DROP VIEW IF EXISTS "{view_name}" CASCADE;')
        for table_name in (
            'sms_outbox',
            'iot_kiosks',
            'faculty_gate_logs',
            'student_gate_logs_partitioned',
            'student_gate_logs',
        ):
            cursor.execute(f'DROP TABLE IF EXISTS "{table_name}" CASCADE;')


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0021_room_schedule_code_schedule_days_of_week_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(drop_legacy_views_and_tables, reverse_code=migrations.RunPython.noop),
        migrations.CreateModel(
            name='AppNotification',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=150)),
                ('message', models.TextField()),
                ('category', models.CharField(
                    choices=[
                        ('ATTENDANCE', 'Classroom Attendance'),
                        ('CUTTING_ALERT', 'Cutting Class Alert'),
                        ('GATE_PASS', 'Exit Pass Update'),
                        ('GEOFENCE', 'Campus Boundary Alert'),
                        ('ANNOUNCEMENT', 'School Announcement'),
                    ],
                    db_index=True,
                    default='ATTENDANCE',
                    max_length=25,
                )),
                ('is_read', models.BooleanField(db_index=True, default=False)),
                ('is_pushed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('recipient', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='app_notifications',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('student', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='parent_notifications',
                    to='academics.student',
                )),
            ],
            options={
                'db_table': 'app_notifications',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddField(
            model_name='schedule',
            name='is_active',
            field=models.BooleanField(db_index=True, default=True),
        ),
        migrations.AddField(
            model_name='section',
            name='is_active',
            field=models.BooleanField(db_index=True, default=True),
        ),
        migrations.AddField(
            model_name='subject',
            name='grade_level',
            field=models.ForeignKey(
                blank=True,
                help_text='Grade level that shares this uniform subject',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='uniform_subjects',
                to='academics.gradelevel',
            ),
        ),
        migrations.AddField(
            model_name='student',
            name='parent_user',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='children',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='subjectattendancelog',
            name='scan_method',
            field=models.CharField(
                choices=[('QR', 'Printed QR ID Scan'), ('MANUAL', 'Manual Class List Entry')],
                default='QR',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='phone_number',
            field=models.CharField(blank=True, db_index=True, default='', max_length=30),
        ),
        migrations.AlterField(
            model_name='userprofile',
            name='role',
            field=models.CharField(
                choices=[
                    ('ADMIN', 'System Administrator'),
                    ('PRINCIPAL', 'School Principal'),
                    ('DEPT_HEAD', 'Department Head'),
                    ('FACULTY', 'Faculty / Adviser'),
                    ('PARENT', 'Parent / Guardian'),
                ],
                default='FACULTY',
                max_length=20,
            ),
        ),
        migrations.AddIndex(
            model_name='appnotification',
            index=models.Index(fields=['recipient', 'is_read', 'created_at'], name='app_notific_recipie_f0cc9d_idx'),
        ),
    ]