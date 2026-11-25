# AttendSure Backend - Config Package Initializer
# File: D:\AttendSure_V3\backend\config\__init__.py

try:
    from .celery import app as celery_app
    __all__ = ("celery_app",)
except ImportError:
    celery_app = None
    __all__ = ()
