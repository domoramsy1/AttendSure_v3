@echo off
echo ==============================================
echo Updating AttendSure V3 to Latest Version...
echo ==============================================

:: 1. Download latest code and tags
git fetch --all --tags
git checkout main
git pull origin main

:: 2. Apply database migrations
echo.
echo Updating Backend Database...
cd backend
python manage.py migrate
cd ..

:: 3. Update Web dependencies
echo.
echo Checking Web Dependencies...
cd web
call npm install
cd ..

echo.
echo ==============================================
echo AttendSure is fully updated and ready to test!
echo ==============================================
pause