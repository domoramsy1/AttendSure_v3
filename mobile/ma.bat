@echo off
@REM AttendSure Mobile - Ma
@REM File: D:\AttendSure_V3\mobile\ma.bat

title AttendSure - Mobile App
cd /d "%~dp0"

echo Starting Mobile App bundler...
npx expo start -c
@REM  npx expo start -c --tunnel

pause
