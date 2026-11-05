"""
AttendSure V3 - Core System & Hardware Configuration
File: backend/attendsure_core/settings.py
"""

import os
import sys
import json
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

# ==============================================================================
# 1. BASE SYSTEM PATHS & ENVIRONMENT CONFIGURATION
# ==============================================================================

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(os.path.join(BASE_DIR, '.env'))

SECRET_KEY = os.getenv('SECRET_KEY')
DEBUG = os.getenv('DEBUG', 'False').strip().lower() in ('true', '1', 'yes')

if not SECRET_KEY and not DEBUG:
    raise ImproperlyConfigured("CRITICAL: SECRET_KEY environment variable is missing in production.")

if not SECRET_KEY:
    SECRET_KEY = 'django-insecure-attendsure-dev-key-never-use-in-production'

LOGS_DIR = os.path.join(BASE_DIR, 'logs')
os.makedirs(LOGS_DIR, exist_ok=True)

# ==============================================================================
# 2. DYNAMIC NETWORK & HOST RESOLUTION (CYBERSECURITY CONTROLS)
# ==============================================================================

ENDPOINTS_JSON_PATH = BASE_DIR.parent / 'endpoints.json'
dynamic_tunnel_host = ''
dynamic_tunnel_origin = ''
centralized_lan_ips = []

if ENDPOINTS_JSON_PATH.exists():
    try:
        with open(ENDPOINTS_JSON_PATH, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
            tunnel_url = cfg.get('active_tunnel_url', '').strip()
            if tunnel_url:
                parsed = urlparse(tunnel_url)
                dynamic_tunnel_host = parsed.netloc
                dynamic_tunnel_origin = f"{parsed.scheme or 'https'}://{parsed.netloc}"

            for lan in cfg.get('lan_servers', []):
                p_lan = urlparse(lan)
                if p_lan.hostname:
                    centralized_lan_ips.append(p_lan.hostname)
    except Exception:
        pass

env_hosts = os.getenv('ALLOWED_HOSTS', '')
if env_hosts:
    ALLOWED_HOSTS = [h.strip() for h in env_hosts.split(',') if h.strip()]
else:
    ALLOWED_HOSTS = []

REQUIRED_HOSTS = [
    'lapasan.attendsure.com.ph',
    '.attendsure.com.ph',
    '.trycloudflare.com',
    '10.16.115.49',
    '172.20.140.221',
    '172.20.141.220',
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
]

if dynamic_tunnel_host and dynamic_tunnel_host not in REQUIRED_HOSTS:
    REQUIRED_HOSTS.append(dynamic_tunnel_host)

for lan_ip in centralized_lan_ips:
    if lan_ip not in REQUIRED_HOSTS:
        REQUIRED_HOSTS.append(lan_ip)

for host in REQUIRED_HOSTS:
    if host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

CSRF_TRUSTED_ORIGINS = [
    'https://*.trycloudflare.com',
    'http://*.trycloudflare.com',
    'http://lapasan.attendsure.com.ph:8000',
    'http://lapasan.attendsure.com.ph:5173',
    'http://lapasan.attendsure.com.ph',
    'https://lapasan.attendsure.com.ph',
    'http://10.16.115.49:8000',
    'http://10.16.115.49:8081',
    'http://10.16.115.49',
    'http://172.20.140.221:8000',
    'http://172.20.140.221:5173',
    'http://172.20.140.221',
    'https://172.20.140.221',
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]

if dynamic_tunnel_origin and dynamic_tunnel_origin not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append(dynamic_tunnel_origin)

# ==============================================================================
# 3. INSTALLED APPLICATIONS
# ==============================================================================

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',

    'apps.core.apps.CoreConfig',
    'apps.academics.apps.AcademicsConfig',
    'apps.api.apps.ApiConfig',
    'apps.scanners.apps.ScannersConfig',
    'apps.telemetry.apps.TelemetryConfig',
]

# ==============================================================================
# 4. MIDDLEWARE PIPELINE
# ==============================================================================

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.core.middleware.SoftwareLicenseMiddleware',
    'apps.api.color_logger.ColorTerminalMiddleware',
]

ROOT_URLCONF = 'attendsure_core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'attendsure_core.wsgi.application'
ASGI_APPLICATION = 'attendsure_core.asgi.application'

# ==============================================================================
# 5. DATABASE CONFIGURATION (DEFENDS AGAINST CONNECTION SLOT EXHAUSTION)
# ==============================================================================

db_engine_choice = os.getenv('DB_ENGINE', 'postgresql').strip().lower()

if 'test' in sys.argv:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': ':memory:',
        }
    }
elif db_engine_choice == 'postgresql':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'attendsure_v3_db'),
            'USER': os.getenv('DB_USER', 'attendsure_admin'),
            'PASSWORD': os.getenv('DB_PASSWORD'),
            'HOST': os.getenv('DB_HOST', '127.0.0.1'),
            'PORT': os.getenv('DB_PORT', '5432'),
            # Auto-close idle connections in development, pool for 60s in production
            'CONN_MAX_AGE': 0 if DEBUG else int(os.getenv('DB_CONN_MAX_AGE', 60)),
            'CONN_HEALTH_CHECKS': True,
            'OPTIONS': {
                'connect_timeout': 5,
            },
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
            'CONN_MAX_AGE': 0,
        }
    }

# ==============================================================================
# 6. IN-MEMORY CACHE & HIGH-SPEED SESSIONS
# ==============================================================================

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "attendsure-production-ram-cache",
        "TIMEOUT": 300,
        "OPTIONS": {
            "MAX_ENTRIES": 10000,
        }
    }
}

SESSION_ENGINE = 'django.contrib.sessions.backends.cached_db'
SESSION_COOKIE_AGE = 86400 * 7

# ==============================================================================
# 7. ASYNCHRONOUS TASKS (CELERY & REDIS)
# ==============================================================================

REDIS_URL = os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0')
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Manila'
CELERY_ENABLE_UTC = False
CELERY_WORKER_CONCURRENCY = int(os.getenv('CELERY_WORKER_CONCURRENCY', 4))
CELERY_WORKER_PREFETCH_MULTIPLIER = 4

# ==============================================================================
# 8. REST FRAMEWORK & CYBERSECURITY RATE LIMITS
# ==============================================================================

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/minute',
        'user': '600/minute',
    },
}

if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = [
        'http://lapasan.attendsure.com.ph',
        'https://lapasan.attendsure.com.ph',
        'http://lapasan.attendsure.com.ph:5173',
        'http://lapasan.attendsure.com.ph:8000',
        'http://10.16.115.49:8000',
        'http://10.16.115.49:8081',
        'http://10.16.115.49',
        'http://172.20.140.221',
        'http://172.20.140.221:5173',
        'http://172.20.140.221:8000',
        'http://localhost',
        'http://127.0.0.1',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ]

CORS_ALLOW_CREDENTIALS = True

# ==============================================================================
# 9. HARDWARE, IOT & SMS PARAMETERS
# ==============================================================================

GATE_DEBOUNCE_SECONDS = int(os.getenv('GATE_DEBOUNCE_SECONDS', 10))
GATE_DEBOUNCE_MINUTES = int(os.getenv('GATE_DEBOUNCE_MINUTES', 3))
SMS_UNIT_COST = float(os.getenv('SMS_UNIT_COST', 0.40))
DEFAULT_GEOFENCE_RADIUS_METERS = int(os.getenv('GEOFENCE_RADIUS_METERS', 150))

GSM_MODEM_PORT = os.getenv('GSM_MODEM_PORT', 'COM3' if os.name == 'nt' else '/dev/ttyUSB0')
GSM_MODEM_BAUDRATE = int(os.getenv('GSM_MODEM_BAUDRATE', 115200))

# ==============================================================================
# 10. ROTATING AUDIT LOGGERS
# ==============================================================================

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] [{levelname}] [{name}:{lineno}] - {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file_general': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(LOGS_DIR, 'attendsure_system.log'),
            'maxBytes': 10 * 1024 * 1024,
            'backupCount': 5,
            'formatter': 'verbose',
            'encoding': 'utf-8',
        },
        'file_security': {
            'level': 'WARNING',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(LOGS_DIR, 'security_audit.log'),
            'maxBytes': 10 * 1024 * 1024,
            'backupCount': 10,
            'formatter': 'verbose',
            'encoding': 'utf-8',
        },
    },
    'loggers': {
        'django.server': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console', 'file_general'],
            'level': 'ERROR',
            'propagate': False,
        },
        'django': {
            'handlers': ['console', 'file_general'],
            'level': 'INFO',
            'propagate': True,
        },
        'apps.api': {
            'handlers': ['console'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
        'apps.academics': {
            'handlers': ['console', 'file_security'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# ==============================================================================
# 11. LOCALIZATION & SECURITY STANDARDS
# ==============================================================================

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Manila'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

FILE_UPLOAD_PERMISSIONS = 0o644
FILE_UPLOAD_DIRECTORY_PERMISSIONS = 0o755
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True

IS_HTTPS_STRICT = os.getenv('ENABLE_HTTPS_STRICT', 'False').strip().lower() in ('true', '1')
if IS_HTTPS_STRICT and not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
else:
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    SECURE_SSL_REDIRECT = False