import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("attendsure")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "flush-location-logs-every-5-seconds": {
        "task": "apps.campus.tasks.flush_location_queue",
        "schedule": 5.0,
    },
}