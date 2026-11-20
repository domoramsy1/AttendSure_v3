# D:\AttendSure_V3\backend\apps\attendance\migrations\0002_exitpass_attachment.py

from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="exitpass",
            name="attachment",
            field=models.FileField(blank=True, null=True, upload_to="exit_passes/"),
        ),
        migrations.AlterField(
            model_name="classattendance",
            name="attendance_date",
            field=models.DateField(db_index=True, default=django.utils.timezone.localdate),
        ),
        migrations.AlterField(
            model_name="dailyattendance",
            name="attendance_date",
            field=models.DateField(db_index=True, default=django.utils.timezone.localdate),
        ),
    ]