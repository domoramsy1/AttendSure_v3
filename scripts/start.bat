@echo off
title AttendSure V3 Launcher
color 0B
echo ========================================================
echo         STARTING ATTENDSURE V3 SYSTEM
echo ========================================================
echo.

:: Get the directory where this script lives
set ROOT_DIR=%~dp0

:: 1. Launch Django Backend
echo [1/2] Starting Django REST Backend on http://localhost:8000 ...
start "AttendSure - Backend (Port 8000)" cmd /k "cd /d %ROOT_DIR%backend && python manage.py runserver 0.0.0.0:8000"

:: 2. Launch Vite / React Frontend
echo [2/2] Starting React Frontend on http://localhost:5173 ...
start "AttendSure - Frontend" cmd /k "cd /d %ROOT_DIR%frontend && npm run dev"

echo.
echo ========================================================
echo Both servers are running!
echo - Backend:  http://localhost:8000
echo - Frontend: Check the frontend window for the local port
echo ========================================================
echo.
echo This launcher window will close in 5 seconds...
timeout /t 5 >nul
exit