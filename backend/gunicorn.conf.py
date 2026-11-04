"""
AttendSure V3 - Gunicorn Production Configuration
Formula for workers: (2 x CPU cores) + 1
Example: 4 CPU cores = 9 workers
"""

import multiprocessing

# Bind to internal port (Nginx will talk to this)
bind = "127.0.0.1:8000"

# Number of worker processes handling requests
workers = (multiprocessing.cpu_count() * 2) + 1

# Worker type
worker_class = "sync"

# Maximum time a worker can take to answer before restarting (prevents frozen requests)
timeout = 30

# Keep-alive connections for fast mobile requests
keepalive = 5

# Restart workers periodically to prevent memory leaks from photo processing
max_requests = 1000
max_requests_jitter = 100

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"