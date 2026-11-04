@echo off
setlocal EnableDelayedExpansion

title AttendSure V3 - Project Code Exporter
echo ========================================================
echo       AttendSure V3 - Exporting All Project Codes
echo ========================================================
echo.

set "OUTPUT_FILE=%~dp0all_codes_export.txt"

if exist "%OUTPUT_FILE%" (
    echo Removing previous export file...
    del /f /q "%OUTPUT_FILE%"
)

echo Scanning project files and collecting code...
echo Skipping node_modules, .git, venv, cache folders, and package-lock.json.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$root = '%~dp0'; " ^
    "$out = Join-Path $root 'all_codes_export.txt'; " ^
    "$exts = @('*.py', '*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.html', '*.css', '*.sql'); " ^
    "$skipFolders = @('.git', 'node_modules', 'venv', 'env', '__pycache__', 'dist', 'build', 'media', 'staticfiles', '.vscode'); " ^
    "$skipFiles = @('all_codes_export.txt', 'package-lock.json'); " ^
    "$files = Get-ChildItem -Path $root -Recurse -File -Include $exts | Where-Object { " ^
    "    $full = $_.FullName; " ^
    "    $skip = $false; " ^
    "    if ($skipFiles -contains $_.Name) { $skip = $true } " ^
    "    if (-not $skip) { " ^
    "        foreach ($folder in $skipFolders) { " ^
    "            if ($full -match '[\\/]' + [regex]::Escape($folder) + '[\\/]') { $skip = $true; break } " ^
    "        } " ^
    "    } " ^
    "    -not $skip " ^
    "}; " ^
    "$count = $files.Count; " ^
    "Write-Host \"Found $count code files to export.\" -ForegroundColor Cyan; " ^
    "foreach ($f in $files) { " ^
    "    $rel = Resolve-Path -Relative $f.FullName; " ^
    "    Add-Content -Path $out -Value \"`n========================================================`nFile: $rel`n========================================================`n\"; " ^
    "    Get-Content -Path $f.FullName | Add-Content -Path $out; " ^
    "} " ^
    "Write-Host \"Export finished successfully!\" -ForegroundColor Green"

echo.
echo ========================================================
echo Done! All project code is saved in:
echo %OUTPUT_FILE%
echo ========================================================
echo.
pause