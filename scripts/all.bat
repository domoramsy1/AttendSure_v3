@echo off
title AttendSure - Full System
cd /d "%~dp0"

echo Starting all AttendSure services...
echo.

echo [1/4] Launching Backend (backend\be.bat)...
start "AttendSure - Backend API" cmd /k "cd /d "%~dp0backend" && be.bat"
timeout /t 3 /nobreak >nul

echo [2/4] Launching Web App (web\wa.bat)...
start "AttendSure - Web App" cmd /k "cd /d "%~dp0web" && wa.bat"
timeout /t 2 /nobreak >nul

echo [3/4] Launching Cloudflare Tunnel (cf.bat)...
start "AttendSure - Cloudflare Tunnel" cmd /k "cd /d "%~dp0" && cf.bat"
timeout /t 2 /nobreak >nul

echo [4/4] Launching Mobile App (mobile\ma.bat)...
start "AttendSure - Mobile App" cmd /k "cd /d "%~dp0mobile" && ma.bat"

echo.
echo All services launched in separate windows.
timeout /t 3 