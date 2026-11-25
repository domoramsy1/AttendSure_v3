# AttendSure Backend - Django System Settings
# File: D:\AttendSure_V3\backend\config\settings.py

import os
import socket
import sys
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DEBUG = os.getenv("DEBUG", "False").strip().lower() in ("true", "1", "yes")
SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY and not DEBUG:
    raise ImproperlyConfigured("SECRET_KEY environment variable is required in production.")
if not SECRET_KEY:
    SECRET_KEY = "django-insecure-local-dev-only-key"

LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)


def _detect_local_lan_ips() -> list[str]:
    ips: set[str] = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127."):
                ips.add(ip)
    except OSError:
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            primary_ip = s.getsockname()[0]
            if primary_ip and not primary_ip.startswith("127."):
                ips.add(primary_ip)
    except OSError:
        pass
    return sorted(ips)


_DETECTED_LAN_IPS = _detect_local_lan_ips()

ALLOWED_HOSTS = [
    h.strip()
    for h in os.getenv(
        "ALLOWED_HOSTS",
        "localhost,127.0.0.1,[::1],testserver,10.0.2.2,.attendsure.ph,.attendsure.com.ph,.trycloudflare.com",
    ).split(",")
    if h.strip() and h.strip() != "*"
]

if DEBUG or "test" in sys.argv:
    for _safe_host in (
        "localhost",
        "127.0.0.1",
        "[::1]",
        "testserver",
        "10.0.2.2",
        *_DETECTED_LAN_IPS,
    ):
        if _safe_host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(_safe_host)

CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081,http://macasandig.attendsure.com.ph,https://macasandig.attendsure.com.ph",
    ).split(",")
    if o.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.accounts.apps.AccountsConfig",
    "apps.school.apps.SchoolConfig",
    "apps.students.apps.StudentsConfig",
    "apps.attendance.apps.AttendanceConfig",
    "apps.campus.apps.CampusConfig",
    "apps.reports.apps.ReportsConfig",
]

MIDDLEWARE = [
    "django.middleware.gzip.GZipMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "common.request_logger.RequestLoggerMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "common.security.ApiSecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DB_ENGINE = os.getenv("DB_ENGINE", "postgresql").strip().lower()
USE_POSTGRES_FOR_TESTS = os.getenv("USE_POSTGRES_FOR_TESTS", "False").strip().lower() in ("true", "1", "yes")
if "test" in sys.argv and not USE_POSTGRES_FOR_TESTS:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
elif "postgres" in DB_ENGINE or ("test" in sys.argv and USE_POSTGRES_FOR_TESTS):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME", "attendsure_v3_db"),
            "USER": os.getenv("DB_USER", "attendsure_admin"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("DB_HOST", "127.0.0.1"),
            "PORT": os.getenv("DB_PORT", "5432"),
            "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"connect_timeout": 5},
        }
    }
    if "test" in sys.argv:
        PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
            "CONN_MAX_AGE": 60,
        }
    }

def _resolve_use_redis_cache(
    raw_use_redis: str | None,
    raw_redis_url: str | None,
    *,
    is_testing: bool = False,
) -> bool:
    if is_testing:
        return False
    if raw_use_redis is not None and raw_use_redis.strip() != "":
        return raw_use_redis.strip().lower() in ("true", "1", "yes")
    return bool((raw_redis_url or "").strip())


_RAW_REDIS_URL = os.getenv("REDIS_URL", "").strip()
REDIS_URL = _RAW_REDIS_URL or "redis://127.0.0.1:6379/0"
USE_REDIS_CACHE = _resolve_use_redis_cache(
    os.getenv("USE_REDIS_CACHE"),
    _RAW_REDIS_URL,
    is_testing="test" in sys.argv,
)

if USE_REDIS_CACHE:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "IGNORE_EXCEPTIONS": True,
            },
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "attendsure-local-cache",
        }
    }

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TIMEZONE = "Asia/Manila"
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_EAGER", str(DEBUG)).lower() in ("true", "1", "yes")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPagination",
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/minute",
        "login": "10/minute",
        "user": "300/minute",
        "scan_ping": "60/minute",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True
_DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,"
    "http://127.0.0.1:5173,"
    "http://localhost:5174,"
    "http://127.0.0.1:5174,"
    "http://localhost:8081,"
    "http://127.0.0.1:8081,"
    "http://localhost:19006,"
    "http://127.0.0.1:19006,"
    "http://localhost,"
    "http://127.0.0.1,"
    "http://macasandig.attendsure.com.ph,"
    "https://macasandig.attendsure.com.ph"
)
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ALLOWED_ORIGINS", _DEFAULT_CORS_ORIGINS).split(",")
    if o.strip() and o.strip() != "*"
]

if DEBUG:
    for _lan_ip in _DETECTED_LAN_IPS:
        for _port in (8000, 8081, 5173, 5174, 19006):
            _origin = f"http://{_lan_ip}:{_port}"
            if _origin not in CORS_ALLOWED_ORIGINS:
                CORS_ALLOWED_ORIGINS.append(_origin)
            if _origin not in CSRF_TRUSTED_ORIGINS:
                CSRF_TRUSTED_ORIGINS.append(_origin)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "[{asctime}] [{levelname}] [{name}] {message}",
            "style": "{",
            "datefmt": "%Y-%m-%d %I:%M:%S %p",
        },
    },
    "handlers": {
        "console": {
            "level": "WARNING",
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
        "system_file": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOGS_DIR / "attendsure_system.log",
            "maxBytes": 10 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "standard",
            "encoding": "utf-8",
        },
        "security_file": {
            "level": "WARNING",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOGS_DIR / "security_audit.log",
            "maxBytes": 10 * 1024 * 1024,
            "backupCount": 10,
            "formatter": "standard",
            "encoding": "utf-8",
        },
    },
    "loggers": {
        "django.server": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["system_file"],
            "level": "ERROR",
            "propagate": False,
        },
        "attendsure.security": {
            "handlers": ["security_file"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

ENABLE_HTTPS_STRICT = os.getenv("ENABLE_HTTPS_STRICT", "False").strip().lower() in ("true", "1", "yes")
if ENABLE_HTTPS_STRICT and not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

REQUIRE_GPS_FOR_QR_SCAN = os.getenv("REQUIRE_GPS_FOR_QR_SCAN", "False").strip().lower() in ("true", "1", "yes")
ENABLE_JUDGE_DEMO = os.getenv("ENABLE_JUDGE_DEMO", "False").strip().lower() in ("true", "1", "yes")
ENABLE_LEGACY_API_ROUTES = os.getenv("ENABLE_LEGACY_API_ROUTES", "False").strip().lower() in ("true", "1", "yes")
ONBOARDING_CURRENT_VERSION = int(os.getenv("ONBOARDING_CURRENT_VERSION", "1"))
