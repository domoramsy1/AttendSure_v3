# AttendSure Backend - Background Task Runner Setup
# File: D:\AttendSure_V3\backend\config\celery.py

import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("attendsure")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "run-daily-loafing-audit-every-15-minutes": {
        "task": "apps.campus.tasks.run_scheduled_loafing_audit",
        "schedule": 900.0,
    },
}
