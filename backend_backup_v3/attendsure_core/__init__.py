# AttendSure Core Package Init
# Safely loads Celery only if it is installed on your laptop.

try:
    from .celery import app as celery_app
    __all__ = ('celery_app',)
except ImportError:
    # Allows Django to run normally during local development without Celery
    celery_app = None
    __all__ = ()