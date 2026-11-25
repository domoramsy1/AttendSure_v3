@echo off
@REM AttendSure Backend - Be
@REM File: D:\AttendSure_V3\backend\be.bat

title AttendSure - Backend API
cd /d "%~dp0"

:: Auto-detect virtual environment
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) else if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else if exist "..\.venv\Scripts\activate.bat" (
    call ..\.venv\Scripts\activate.bat
) else if exist "..\venv\Scripts\activate.bat" (
    call ..\venv\Scripts\activate.bat
)

echo Starting Django backend API on 0.0.0.0:8000...
python manage.py runserver 0.0.0.0:8000
pause
