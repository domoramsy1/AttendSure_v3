"""
AttendSure V3 - Core System & Hardware Configuration
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

# Load environment file (.env) from backend root
load_dotenv(os.path.join(BASE_DIR, '.env'))

# Security: Refuse to boot in production if SECRET_KEY is missing
SECRET_KEY = os.getenv('SECRET_KEY')
DEBUG = os.getenv('DEBUG', 'False').strip().lower() in ('true', '1', 'yes')

if not SECRET_KEY and not DEBUG:
    raise ImproperlyConfigured("CRITICAL: SECRET_KEY environment variable is missing in production!")

# Fallback development key if running in debug mode
if not SECRET_KEY:
    SECRET_KEY = 'django-insecure-attendsure-dev-key-never-use-in-production'

# Ensure dedicated logs directory exists for SysAdmin maintenance
LOGS_DIR = os.path.join(BASE_DIR, 'logs')
os.makedirs(LOGS_DIR, exist_ok=True)


# ==============================================================================
# 2. NETWORKING, REVERSE PROXY & HOST RESOLUTION (CCNA STANDARDS)
# ==============================================================================

# Parse ALLOWED_HOSTS from .env if defined
env_hosts = os.getenv('ALLOWED_HOSTS', '')
if env_hosts:
    ALLOWED_HOSTS = [h.strip() for h in env_hosts.split(',') if h.strip()]
else:
    ALLOWED_HOSTS = []

# Core infrastructure hosts required for local, school LAN, and domain routing
REQUIRED_HOSTS = [
    'lapasan.attendsure.com.ph',
    '.attendsure.com.ph',        # Wildcard matching all school subdomains
    '172.20.140.221',            # School Local Server IP
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
]

for host in REQUIRED_HOSTS:
    if host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)

# Permit all hosts in local development / debugging
if DEBUG and '*' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('*')

# Reverse Proxy / L3 Gateway Forwarding (Nginx / Linux Gateway integration)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# CSRF Trusted Origins for Web Portals, Gate Kiosks, and Subdomains
CSRF_TRUSTED_ORIGINS = [
    'http://lapasan.attendsure.com.ph:8000',
    'http://lapasan.attendsure.com.ph:5173',
    'http://lapasan.attendsure.com.ph',
    'https://lapasan.attendsure.com.ph',
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
    # Built-in Django applications
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party tools
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',

    # AttendSure V3 local modules
    'apps.core',
    'apps.academics.apps.AcademicsConfig',
    'apps.api.apps.ApiConfig',
]


# ==============================================================================
# 4. MIDDLEWARE PIPELINE
# ==============================================================================

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',                     # 1. CORS Preflight & Handshake
    'django.middleware.security.SecurityMiddleware',             # 2. Security Headers & SSL Inspection
    'django.contrib.sessions.middleware.SessionMiddleware',       # 3. Session Management
    'django.middleware.common.CommonMiddleware',                 # 4. Canonical URLs
    'django.middleware.csrf.CsrfViewMiddleware',                 # 5. Anti-CSRF Token Enforcement
    'django.contrib.auth.middleware.AuthenticationMiddleware',   # 6. User RBAC Authentication
    'django.contrib.messages.middleware.MessageMiddleware',       # 7. Flash Messaging
    'django.middleware.clickjacking.XFrameOptionsMiddleware',   # 8. Anti-Clickjacking Defense
    'apps.core.middleware.SoftwareLicenseMiddleware',            # 9. Hardware License Guard
    'apps.api.color_logger.ColorTerminalMiddleware',             # 10. Colorized CRUD & Status Terminal Logger
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
# 5. DATABASE ARCHITECTURE (POSTGRESQL & CONNECTION POOLING)
# ==============================================================================

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'attendsure_v3'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
        'CONN_MAX_AGE': 0,  # Persistent connection pooling (60s)
        'OPTIONS': {
            'connect_timeout': 5,
        },
    }
}


# ==============================================================================
# 6. REST API & HARDWARE RATE LIMITING (THROTTLING)
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
        'anon': '180/minute',       # Gate turnstiles and unauthenticated hardware
        'user': '1200/minute',      # Authenticated staff and web portal requests
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
        'http://172.20.140.221',
        'http://172.20.140.221:5173',
        'http://172.20.140.221:8000',
    ]

CORS_ALLOW_CREDENTIALS = True


# ==============================================================================
# 7. ATTENDSURE HARDWARE, SMS & IOT PARAMETERS
# ==============================================================================

# Hardware Anti-Passback Cooldown (Seconds and Minutes)
GATE_DEBOUNCE_SECONDS = int(os.getenv('GATE_DEBOUNCE_SECONDS', 10))
GATE_DEBOUNCE_MINUTES = int(os.getenv('GATE_DEBOUNCE_MINUTES', 3))

# Estimated SMS cost per text in PHP for dashboard balance metrics
SMS_UNIT_COST = float(os.getenv('SMS_UNIT_COST', 0.40))

# Mobile Geofence Radius Default (Meters)
DEFAULT_GEOFENCE_RADIUS_METERS = int(os.getenv('GEOFENCE_RADIUS_METERS', 150))

# GSM Modem Serial Interface Configuration
GSM_MODEM_PORT = os.getenv('GSM_MODEM_PORT', 'COM3' if os.name == 'nt' else '/dev/ttyUSB0')
GSM_MODEM_BAUDRATE = int(os.getenv('GSM_MODEM_BAUDRATE', 9600))


# ==============================================================================
# 8. SYSTEM MAINTENANCE & ROTATING LOGGERS (SYSADMIN AUDIT TRAIL)
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
        'simple': {
            'format': '[{levelname}] {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        # Daily operational log (Rotates every 10MB, retains 5 backups)
        'file_general': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(LOGS_DIR, 'attendsure_system.log'),
            'maxBytes': 10 * 1024 * 1024,
            'backupCount': 5,
            'formatter': 'verbose',
            'encoding': 'utf-8',
        },
        # Dedicated hardware log for IoT Kiosks, Turnstiles, and RFID/QR Taps
        'file_hardware': {
            'level': 'DEBUG' if DEBUG else 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(LOGS_DIR, 'hardware_scanners.log'),
            'maxBytes': 15 * 1024 * 1024,
            'backupCount': 7,
            'formatter': 'verbose',
            'encoding': 'utf-8',
        },
        # Security incident log (GPS spoofing, proxy taps, unapproved edits)
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
        # Mute monotone django.server request lines so ColorTerminalMiddleware handles output
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
            'handlers': ['console', 'file_hardware'],
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
# 9. LOCALIZATION & REGIONAL STANDARDS
# ==============================================================================

# Time Localization: Philippine Standard Time (PST, UTC+8) for DepEd SF2 and CSC 48
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Manila'
USE_I18N = True
USE_TZ = True


# ==============================================================================
# 10. MEDIA & STATIC STORAGE
# ==============================================================================

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# File upload restrictions (2.5 MB maximum payload)
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2621440  # 2.5 MB

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ==============================================================================
# 11. PRODUCTION SECURITY HEADERS
# ==============================================================================

if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SECURE_HSTS_SECONDS = 31536000  # 1 Year Strict-Transport-Security
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True