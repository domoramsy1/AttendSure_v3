# AttendSure Backend - ASGI Server Entry Point
# File: D:\AttendSure_V3\backend\config\asgi.py

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_asgi_application()
