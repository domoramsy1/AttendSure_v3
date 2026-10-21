"""
AttendSure - Core System & Hardware Configuration
Optimized for Campus IoT Gate Kiosks, Mobile Geofencing, and Administrative Portal.
File: backend/attendsure_core/settings.py
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

# ==============================================================================
# 1. BASE SYSTEM PATHS & ENVIRONMENT CONFIGURATION
# ==============================================================================

BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment file (.env) from backend root directory
load_dotenv(os.path.join(BASE_DIR, '.env'))

# Security: Refuse to boot in production if SECRET_KEY is missing
SECRET_KEY = os.getenv('SECRET_KEY')
DEBUG = os.getenv('DEBUG', 'False').strip().lower() in ('true', '1', 'yes')

if not SECRET_KEY and not DEBUG:
    raise ImproperlyConfigured("CRITICAL: SECRET_KEY environment variable is missing in production!")

# Fallback development key if running in debug mode
if not SECRET_KEY:
    SECRET_KEY = 'django-insecure-attendsure-dev-key-never-use-in-production'

# Ensure dedicated logs directory exists for audit trails
LOGS_DIR = os.path.join(BASE_DIR, 'logs')
os.makedirs(LOGS_DIR, exist_ok=True)


# ==============================================================================
# 2. NETWORKING, REVERSE PROXY & HOST RESOLUTION (CYBERSECURITY APPLIED)
# ==============================================================================

# Parse ALLOWED_HOSTS from .env
env_hosts = os.getenv('ALLOWED_HOSTS', '')
if env_hosts:
    ALLOWED_HOSTS = [h.strip() for h in env_hosts.split(',') if h.strip()]
else:
    ALLOWED_HOSTS = []

REQUIRED_HOSTS = [
    'lapasan.attendsure.com.ph',
    '.attendsure.com.ph',
    '.trycloudflare.com',        # Allows any active Cloudflare tunnel
    '10.16.115.49',
    '172.20.140.221',
    '172.20.141.220',
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
]

for host in REQUIRED_HOSTS:
    if host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)

if DEBUG and '*' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('*')

# Reverse Proxy / L3 Gateway Forwarding
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# CSRF Trusted Origins (Includes Cloudflare wildcards to stop 403 CSRF lockouts)
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
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]


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

    # Third-party utilities
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',

    # AttendSure local apps
    'apps.core',
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


# ==============================================================================
# 5. DATABASE ARCHITECTURE (POSTGRESQL DEFAULT + FASTER FETCHING)
# ==============================================================================

# Explicitly check DB_ENGINE. Defaults directly to postgresql.
db_engine_choice = os.getenv('DB_ENGINE', 'postgresql').strip().lower()

if db_engine_choice == 'postgresql':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'attendsure_v3_db'),
            'USER': os.getenv('DB_USER', 'attendsure_admin'),
            'PASSWORD': os.getenv('DB_PASSWORD', '88888888'),
            'HOST': os.getenv('DB_HOST', '127.0.0.1'),
            'PORT': os.getenv('DB_PORT', '5432'),
            # Keeps TCP connections open for 300 seconds to accelerate queries
            'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', 300)),
            'OPTIONS': {
                'connect_timeout': 5,
            },
        }
    }
else:
    # Fallback to local SQLite only when explicitly requested
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }


# ==============================================================================
# 6. IN-MEMORY CACHE (HIGH-SPEED RAM CACHING)
# ==============================================================================

REDIS_URL = os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0')

if DEBUG:
    # High-speed local RAM cache for development (no Redis server required)
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "attendsure-local-ram-cache",
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "CONNECTION_POOL_KWARGS": {"max_connections": 100},
                "SOCKET_CONNECT_TIMEOUT": 5,
                "SOCKET_TIMEOUT": 5,
            },
            "KEY_PREFIX": "attendsure",
        }
    }


# ==============================================================================
# 7. ASYNCHRONOUS BACKGROUND TASKS (CELERY & REDIS)
# ==============================================================================

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
# 8. REST API & THROTTLING (CYBERSECURITY DEFENSE)
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
        'anon': '120/minute',       # Protects endpoints from brute-force attacks
        'user': '1200/minute',      # High-throughput capacity for authenticated GPS pings
    },
}

# Cross-Origin Resource Sharing (CORS) Configuration
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
    ]

CORS_ALLOW_CREDENTIALS = True


# ==============================================================================
# 9. ATTENDSURE HARDWARE, SMS & IOT PARAMETERS
# ==============================================================================

GATE_DEBOUNCE_SECONDS = int(os.getenv('GATE_DEBOUNCE_SECONDS', 10))
GATE_DEBOUNCE_MINUTES = int(os.getenv('GATE_DEBOUNCE_MINUTES', 3))
SMS_UNIT_COST = float(os.getenv('SMS_UNIT_COST', 0.40))
DEFAULT_GEOFENCE_RADIUS_METERS = int(os.getenv('GEOFENCE_RADIUS_METERS', 150))

GSM_MODEM_PORT = os.getenv('GSM_MODEM_PORT', 'COM3' if os.name == 'nt' else '/dev/ttyUSB0')
GSM_MODEM_BAUDRATE = int(os.getenv('GSM_MODEM_BAUDRATE', 115200))


# ==============================================================================
# 10. ROTATING AUDIT LOGGERS (SYSADMIN & SECURITY MONITORING)
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
# 11. LOCALIZATION & REGIONAL STANDARDS
# ==============================================================================

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Manila'
USE_I18N = True
USE_TZ = True


# ==============================================================================
# 12. MEDIA & STATIC STORAGE
# ==============================================================================

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2621440
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ==============================================================================
# 13. CYBERSECURITY HARDENING
# ==============================================================================

# Protect cookies from JavaScript injection (Cross-Site Scripting / XSS defense)
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False  # Allows frontend Axios client to read CSRF token

# Anti-clickjacking defense
X_FRAME_OPTIONS = 'DENY'

if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True