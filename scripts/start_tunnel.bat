@echo off
@REM AttendSure Scripts - Start Tunnel
@REM File: D:\AttendSure_V3\scripts\start_tunnel.bat

title AttendSure - Cloudflare Tunnel
echo Starting Cloudflare tunnel to local Django API (http://127.0.0.1:8000)...
cloudflared tunnel --url http://127.0.0.1:8000
pause
