# AttendSure Backend - Dockerfile
# File: D:\AttendSure_V3\backend\Dockerfile

# D:\AttendSure_V3\backend\Dockerfile
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    USE_REDIS_CACHE=True

WORKDIR /app

# Install system dependencies required by Pillow and psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

COPY . /app

# Create non-root runtime user and ensure writable static/media/log paths
RUN useradd --create-home --shell /bin/bash attendsure \
    && mkdir -p /app/staticfiles /app/media /app/logs \
    && chown -R attendsure:attendsure /app

USER attendsure

EXPOSE 8000 8001 8002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/api/v1/health/db/" || exit 1

CMD ["gunicorn", "config.wsgi:application", "-c", "gunicorn.conf.py"]
