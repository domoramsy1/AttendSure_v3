#!/bin/bash
set -e

NGINX_CONF="/etc/nginx/nginx.conf"
CURRENT_PORT=$(grep -oE "127.0.0.1:[0-9]+" $NGINX_CONF | cut -d: -f2)

if [ "$CURRENT_PORT" == "8001" ]; then
    TARGET_COLOR="green"
    TARGET_PORT="8002"
else
    TARGET_COLOR="blue"
    TARGET_PORT="8001"
fi

echo "=================================================="
echo "Active: $CURRENT_PORT | Deploying to: $TARGET_COLOR on $TARGET_PORT"
echo "=================================================="

# 1. Pull changes and rebuild the target container
docker compose build web_$TARGET_COLOR
docker compose up -d web_$TARGET_COLOR

# 2. Wait and test health check endpoint
echo "Verifying health on target port $TARGET_PORT..."
sleep 4
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$TARGET_PORT/api/settings/school/ || true)

if [ "$HEALTH" != "200" ]; then
    echo "Deployment aborted: Target returned HTTP $HEALTH. Rolling back."
    exit 1
fi

# 3. Swap the upstream port inside Nginx configuration
sed -i "s/127.0.0.1:$CURRENT_PORT/127.0.0.1:$TARGET_PORT/g" $NGINX_CONF

# 4. Reload Nginx without dropping active connections
nginx -s reload

echo "=================================================="
echo "Traffic switched to $TARGET_COLOR ($TARGET_PORT) with zero downtime."
echo "=================================================="