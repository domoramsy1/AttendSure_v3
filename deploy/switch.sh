#!/bin/bash
# AttendSure - Linux Zero-Downtime Deployment Switcher
# File: D:\AttendSure_V3\deploy\switch.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

NGINX_CONF="${NGINX_CONF:-$SCRIPT_DIR/nginx.conf}"
if [ ! -f "$NGINX_CONF" ]; then
    echo "Error: nginx.conf not found at $NGINX_CONF"
    exit 1
fi

if grep -qE "(web_blue|127\.0\.0\.1):8001" "$NGINX_CONF"; then
    CURRENT_PORT="8001"
    TARGET_COLOR="green"
    TARGET_PORT="8002"
    CURRENT_UPSTREAM=$(grep -oE "(web_blue|127\.0\.0\.1):8001" "$NGINX_CONF" | head -n 1)
    TARGET_UPSTREAM="${CURRENT_UPSTREAM/blue:8001/green:8002}"
    TARGET_UPSTREAM="${TARGET_UPSTREAM/127.0.0.1:8001/127.0.0.1:8002}"
else
    CURRENT_PORT="8002"
    TARGET_COLOR="blue"
    TARGET_PORT="8001"
    CURRENT_UPSTREAM=$(grep -oE "(web_green|127\.0\.0\.1):8002" "$NGINX_CONF" | head -n 1)
    TARGET_UPSTREAM="${CURRENT_UPSTREAM/green:8002/blue:8001}"
    TARGET_UPSTREAM="${TARGET_UPSTREAM/127.0.0.1:8002/127.0.0.1:8001}"
fi

echo "=================================================="
echo "Active: $CURRENT_PORT ($CURRENT_UPSTREAM) | Deploying: web_$TARGET_COLOR ($TARGET_PORT)"
echo "=================================================="

docker compose build "web_$TARGET_COLOR"
docker compose up -d "web_$TARGET_COLOR"

docker compose exec -T "web_$TARGET_COLOR" python manage.py migrate --noinput
docker compose exec -T "web_$TARGET_COLOR" python manage.py collectstatic --noinput

echo "Verifying health on http://127.0.0.1:$TARGET_PORT/api/v1/health/db/..."
HEALTHY=0

for ATTEMPT in $(seq 1 12); do
    sleep 2
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$TARGET_PORT/api/v1/health/db/" || true)
    if [ "$HTTP_CODE" = "200" ]; then
        HEALTHY=1
        break
    fi
    echo "Attempt $ATTEMPT/12 waiting for web_$TARGET_COLOR..."
done

if [ "$HEALTHY" -ne 1 ]; then
    echo "Deployment aborted: web_$TARGET_COLOR returned HTTP $HTTP_CODE. Stopping target container."
    docker compose stop "web_$TARGET_COLOR"
    exit 1
fi

sed -i "s|$CURRENT_UPSTREAM|$TARGET_UPSTREAM|g" "$NGINX_CONF"

if docker compose ps --status running | grep -q "nginx"; then
    docker compose exec -T nginx nginx -s reload
elif command -v nginx >/dev/null 2>&1; then
    nginx -s reload
fi

echo "=================================================="
echo "Traffic switched to web_$TARGET_COLOR ($TARGET_PORT) with zero downtime."
echo "=================================================="
