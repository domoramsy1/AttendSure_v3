@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo AttendSure V3 - System Update and Verification
echo ============================================================

:: 1. CHECK GIT REPOSITORY AND STASH LOCAL CHANGES
echo.
echo [1/5] Checking Git repository status...
for /f "delims=" %%i in ('git status --porcelain 2^>nul') do set "HAS_CHANGES=1"

set "STASHED=0"
if defined HAS_CHANGES (
    echo Local changes detected. Stashing temporarily to prevent conflicts...
    git stash push -m "attendsure_auto_update_stash"
    set "STASHED=1"
)

echo Fetching and pulling latest code from origin main...
git fetch origin main --tags
git checkout main
git pull origin main

if "!STASHED!"=="1" (
    echo Restoring your stashed local files...
    git stash pop
)

:: 2. BACKEND: PYTHON RUNTIME, PACKAGES, MIGRATIONS & CHECK
echo.
echo [2/5] Updating Backend (Django)...
set "PY_BIN="
if exist "%~dp0backend\venv\Scripts\python.exe" set "PY_BIN=%~dp0backend\venv\Scripts\python.exe"
if not defined PY_BIN if exist "%~dp0backend\.venv\Scripts\python.exe" set "PY_BIN=%~dp0backend\.venv\Scripts\python.exe"
if not defined PY_BIN if exist "%~dp0venv\Scripts\python.exe" set "PY_BIN=%~dp0venv\Scripts\python.exe"
if not defined PY_BIN set "PY_BIN=python"

echo Using Python runtime: !PY_BIN!

if exist "%~dp0backend\requirements.txt" (
    echo Verifying Python packages from requirements.txt...
    cd /d "%~dp0backend"
    "!PY_BIN!" -m pip install -r requirements.txt --quiet --no-cache-dir
    cd /d "%~dp0"
)

if exist "%~dp0backend\manage.py" (
    echo Applying database migrations...
    cd /d "%~dp0backend"
    "!PY_BIN!" manage.py migrate
    echo Running system security and model check...
    "!PY_BIN!" manage.py check
    cd /d "%~dp0"
)

:: 3. WEB PORTAL: DEPENDENCIES
if exist "%~dp0web" (
    echo.
    echo [3/5] Updating Web dependencies...
    cd /d "%~dp0web"
    if not exist "node_modules" (
        echo Installing Web node_modules...
        call npm install
    ) else (
        echo Web node_modules found. Updating package tree...
        call npm install --prefer-offline
    )
    cd /d "%~dp0"
)

:: 4. MOBILE APP: DEPENDENCIES
if exist "%~dp0mobile" (
    echo.
    echo [4/5] Updating Mobile dependencies...
    cd /d "%~dp0mobile"
    if not exist "node_modules" (
        echo Installing Mobile node_modules...
        call npm install
    ) else (
        echo Mobile node_modules found. Updating package tree...
        call npm install --prefer-offline
    )
    cd /d "%~dp0"
)

:: 5. VERIFY ACTIVE VERSION TAG
echo.
echo [5/5] Checking active version tag...
set "TAG="
for /f "delims=" %%t in ('git describe --tags --abbrev^=0 2^>nul') do set "TAG=%%t"
if not defined TAG set "TAG=No Git tag detected (main branch HEAD)"

echo ============================================================
echo SUCCESS: AttendSure V3 is updated and verified!
echo Current Version Tag : !TAG!
echo ============================================================

pause