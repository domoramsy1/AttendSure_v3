@echo off
setlocal
cd /d "%~dp0\.."
echo ========================================================
echo AttendSure V3 - Git Push
echo ========================================================
echo.
git status
echo.
set /p commit_msg="Enter commit message (Press Enter for auto message): "
if "%commit_msg%"=="" set commit_msg=Update AttendSure V3 production codebase
git add .
git commit -m "%commit_msg%"
git push origin main
echo.
echo [Done] Changes pushed to GitHub origin main.
pause