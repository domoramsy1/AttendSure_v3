# AttendSure Backend - WSGI Server Entry Point
# File: D:\AttendSure_V3\backend\config\wsgi.py

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_wsgi_application()
