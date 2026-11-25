# AttendSure Backend - Gunicorn Server Configuration
# File: D:\AttendSure_V3\backend\gunicorn.conf.py

# D:\AttendSure_V3\backend\gunicorn.conf.py
"""
ATTENDSURE - Gunicorn Production Configuration
Reads GUNICORN_BIND so Blue (8001), Green (8002), and standalone (8000) all work from one config.
"""

import multiprocessing
import os

bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")
workers = int(os.getenv("GUNICORN_WORKERS", str(min((multiprocessing.cpu_count() * 2) + 1, 9))))
threads = int(os.getenv("GUNICORN_THREADS", "2"))
worker_class = "gthread"
timeout = 60
keepalive = 5

# Periodically recycle workers to prevent Pillow image memory growth
max_requests = 1000
max_requests_jitter = 100

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
