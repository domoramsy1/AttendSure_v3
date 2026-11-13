@echo off
setlocal EnableDelayedExpansion

title AttendSure V3 - Mobile Code Exporter
echo ========================================================
echo       AttendSure V3 - Exporting Mobile Code Only
echo ========================================================
echo.

set "RESULTS_DIR=%~dp0results"
if not exist "%RESULTS_DIR%" (
    mkdir "%RESULTS_DIR%"
)

set "OUTPUT_FILE=%RESULTS_DIR%\mobile_export.txt"

if exist "%OUTPUT_FILE%" (
    echo Removing previous mobile export file...
    del /f /q "%OUTPUT_FILE%"
)

echo Scanning mobile folder and collecting source code...
echo Skipping node_modules, Expo caches, native build folders, and secret files.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$scriptDir = '%~dp0'.TrimEnd('\'); " ^
    "$root = (Resolve-Path (Join-Path $scriptDir '..')).Path; " ^
    "$mobileDir = Join-Path $root 'mobile'; " ^
    "if (-not (Test-Path $mobileDir)) { " ^
    "    Write-Host ('Error: Mobile folder not found at ' + $mobileDir) -ForegroundColor Red; " ^
    "    exit 1; " ^
    "} " ^
    "$out = '%OUTPUT_FILE%'; " ^
    "$exts = @('*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.css'); " ^
    "$skipFolders = @( " ^
    "    '.git', '.github', '.vscode', '.idea', " ^
    "    'node_modules', '.expo', '.expo-shared', '.next', '.turbo', '.cache', " ^
    "    'android', 'ios', 'dist', 'build', 'web-build', 'coverage', " ^
    "    'scripts', 'results' " ^
    "); " ^
    "$skipFiles = @( " ^
    "    'mobile_export.txt', 'mobile_code_export.txt', 'all_codes_export.txt', " ^
    "    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', " ^
    "    'google-services.json', 'GoogleService-Info.plist' " ^
    "); " ^
    "$files = Get-ChildItem -Path $mobileDir -Recurse -File -Include $exts | Where-Object { " ^
    "    $name = $_.Name; " ^
    "    $skip = $false; " ^
    "    if ($skipFiles -contains $name) { $skip = $true } " ^
    "    if (-not $skip -and $name -match '(?i)(secret|credential|keystore|firebase|google-services|\.env|\.pem$|\.key$|\.jks$)') { $skip = $true } " ^
    "    if (-not $skip) { " ^
    "        $relPath = $_.FullName.Substring($mobileDir.Length).TrimStart('\', '/'); " ^
    "        $parts = $relPath -split '[\\/]'; " ^
    "        if ($parts.Length -gt 1) { " ^
    "            foreach ($part in $parts[0..($parts.Length - 2)]) { " ^
    "                if ($skipFolders -contains $part) { $skip = $true; break } " ^
    "            } " ^
    "        } " ^
    "    } " ^
    "    -not $skip " ^
    "}; " ^
    "$count = $files.Count; " ^
    "Write-Host ('Mobile Path: ' + $mobileDir) -ForegroundColor Yellow; " ^
    "Write-Host ('Found ' + $count + ' mobile source files to export.') -ForegroundColor Cyan; " ^
    "$utf8NoBom = New-Object System.Text.UTF8Encoding($false); " ^
    "$writer = New-Object System.IO.StreamWriter($out, $false, $utf8NoBom); " ^
    "try { " ^
    "    foreach ($f in $files) { " ^
    "        $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/'); " ^
    "        $writer.WriteLine(''); " ^
    "        $writer.WriteLine('========================================================'); " ^
    "        $writer.WriteLine('File: ' + $rel); " ^
    "        $writer.WriteLine('========================================================'); " ^
    "        $writer.WriteLine([System.IO.File]::ReadAllText($f.FullName)); " ^
    "    } " ^
    "} finally { " ^
    "    $writer.Close(); " ^
    "} " ^
    "Write-Host 'Mobile export finished successfully!' -ForegroundColor Green"

echo.
echo ========================================================
echo Done! Mobile code is saved in:
echo %OUTPUT_FILE%
echo ========================================================
echo.
pause