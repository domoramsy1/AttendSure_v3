# D:\AttendSure_V3\backend\apps\accounts\migrations\0002_teacherprofile_face_template.py
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="teacherprofile",
            name="face_template",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="teacherprofile",
            name="face_enrolled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]