@echo off
@REM AttendSure Web - Wa
@REM File: D:\AttendSure_V3\web\wa.bat

title AttendSure - Web App
cd /d "%~dp0"

echo Starting Web App dashboard...
npm run dev
pause
