@echo off
title AttendSure - Mobile App
cd /d "%~dp0"

echo Starting Mobile App bundler...
@REM  npx expo start -c
npx expo start -c --tunnel

pause