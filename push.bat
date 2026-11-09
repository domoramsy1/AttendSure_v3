@echo off
setlocal enabledelayedexpansion
title AttendSure - Auto-Tag & Git Push
cd /d "%~dp0"

echo ====================================================
echo        AttendSure V3 - Code & Tag Publisher
echo ====================================================
echo.

:: 1. Stage all changes
echo [1/5] Staging all files...
git add -A

:: Check if there are active changes
git status --short
echo.

:: 2. Prompt for commit message
set /p "COMMIT_MSG=Enter commit message (Press Enter for auto-date): "
if "!COMMIT_MSG!"=="" (
    set "COMMIT_MSG=AttendSure release update (%date% %time%)"
)

:: Commit staged files
echo [2/5] Committing changes...
git commit -m "!COMMIT_MSG!"

:: 3. Detect current branch
for /f "tokens=*" %%b in ('git branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%b"
if "!CURRENT_BRANCH!"=="" set "CURRENT_BRANCH=main"

:: 4. Detect latest tag and auto-increment (+1 patch)
for /f "tokens=*" %%t in ('git describe --tags --abbrev^=0 2^>nul') do set "LATEST_TAG=%%t"

if "!LATEST_TAG!"=="" (
    set "NEW_TAG=v1.0.0"
    echo [3/5] No previous tag found. Starting with initial tag: !NEW_TAG!
) else (
    echo [3/5] Current tag found: !LATEST_TAG!
    set "CLEAN_TAG=!LATEST_TAG:v=!"

    for /f "tokens=1,2,3 delims=." %%x in ("!CLEAN_TAG!") do (
        set "MAJOR=%%x"
        set "MINOR=%%y"
        set "PATCH=%%z"
    )

    if "!MAJOR!"=="" set "MAJOR=1"
    if "!MINOR!"=="" set "MINOR=0"
    if "!PATCH!"=="" set "PATCH=0"

    set /a "PATCH+=1"
    set "NEW_TAG=v!MAJOR!.!MINOR!.!PATCH!"
    echo       Auto-incremented to new tag: !NEW_TAG!
)

:: 5. Create local annotated tag
echo [4/5] Creating annotated git tag: !NEW_TAG!...
git tag -a "!NEW_TAG!" -m "Release !NEW_TAG!: !COMMIT_MSG!"

:: 6. Push code and tag to remote
echo [5/5] Pushing branch '!CURRENT_BRANCH!' and tag '!NEW_TAG!' to remote...
git push origin !CURRENT_BRANCH!
git push origin !NEW_TAG!

echo.
echo ====================================================
echo   Successfully pushed all code with tag: !NEW_TAG!
echo ====================================================
pause