@echo off
@REM AttendSure Scripts - Start All
@REM File: D:\AttendSure_V3\scripts\start_all.bat

setlocal
title AttendSure - Full System Launcher
for %%I in ("%~dp0..") do set "ROOT_DIR=%%~fI"

echo ============================================================
echo   ATTENDSURE - STARTING DEVELOPMENT SERVICES
echo   Project Root: %ROOT_DIR%
echo ============================================================
echo.

echo [1/4] Launching Django Backend API (Port 8000)...
start "AttendSure - Backend API" cmd /k "cd /d "%ROOT_DIR%\backend" && call be.bat"
timeout /t 3 /nobreak >nul

if exist "%ROOT_DIR%\web\wa.bat" (
    echo [2/4] Launching Web Portal ^(wa.bat^)...
    start "AttendSure - Web Portal" cmd /k "cd /d "%ROOT_DIR%\web" && call wa.bat"
) else if exist "%ROOT_DIR%\web\package.json" (
    echo [2/4] Launching Web Portal ^(npm run dev^)...
    start "AttendSure - Web Portal" cmd /k "cd /d "%ROOT_DIR%\web" && npm run dev"
)
timeout /t 2 /nobreak >nul

if /I "%~1"=="--with-mobile" (
    echo [3/4] Launching Cloudflare Tunnel...
    start "AttendSure - Cloudflare Tunnel" cmd /k "cd /d "%~dp0" && call start_tunnel.bat"
    timeout /t 2 /nobreak >nul

    if exist "%ROOT_DIR%\mobile\ma.bat" (
        echo [4/4] Launching Mobile App ^(ma.bat^)...
        start "AttendSure - Mobile App" cmd /k "cd /d "%ROOT_DIR%\mobile" && call ma.bat"
    ) else if exist "%ROOT_DIR%\mobile\package.json" (
        echo [4/4] Launching Mobile App ^(npx expo start^)...
        start "AttendSure - Mobile App" cmd /k "cd /d "%ROOT_DIR%\mobile" && npx expo start"
    )
) else (
    echo [TIP] Run "start_all.bat --with-mobile" to also launch Cloudflare Tunnel and Expo Mobile.
)

echo.
echo Services launched in separate windows.
