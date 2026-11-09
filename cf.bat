@echo off
title AttendSure - Cloudflare Tunnel
cd /d "%~dp0"

echo Starting Cloudflare tunnel to local backend (http://127.0.0.1:8000)...
cloudflared tunnel --url http://127.0.0.1:8000
pause