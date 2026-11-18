import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

app = Celery('attendsure_core')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Periodic scheduler: Drains and flushes raw telemetry batches every 3 seconds
app.conf.beat_schedule = {
    'flush-telemetry-batch-every-3-seconds': {
        'task': 'apps.telemetry.tasks.flush_telemetry_queue_batch',
        'schedule': 3.0,
    },
}