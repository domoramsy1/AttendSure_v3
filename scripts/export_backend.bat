@echo off
setlocal EnableDelayedExpansion

title AttendSure V3 - Backend Code Exporter
echo ========================================================
echo       AttendSure V3 - Exporting Backend Code Only
echo ========================================================
echo.

set "RESULTS_DIR=%~dp0results"
if not exist "%RESULTS_DIR%" (
    mkdir "%RESULTS_DIR%"
)

set "OUTPUT_FILE=%RESULTS_DIR%\backend_export.txt"

if exist "%OUTPUT_FILE%" (
    echo Removing previous backend export file...
    del /f /q "%OUTPUT_FILE%"
)

echo Scanning backend folder and collecting source code...
echo Skipping virtual environments, Python libraries, caches, and secret files.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$scriptDir = '%~dp0'.TrimEnd('\'); " ^
    "$root = (Resolve-Path (Join-Path $scriptDir '..')).Path; " ^
    "$backendDir = Join-Path $root 'backend'; " ^
    "if (-not (Test-Path $backendDir)) { " ^
    "    Write-Host ('Error: Backend folder not found at ' + $backendDir) -ForegroundColor Red; " ^
    "    exit 1; " ^
    "} " ^
    "$out = '%OUTPUT_FILE%'; " ^
    "$exts = @('*.py', '*.sql', '*.html', '*.json', '*.yml', '*.yaml'); " ^
    "$skipFolders = @( " ^
    "    '.git', '.github', '.vscode', '.idea', " ^
    "    'venv', '.venv', 'env', 'Lib', 'Scripts', 'Include', 'site-packages', " ^
    "    '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', " ^
    "    'node_modules', 'media', 'staticfiles', 'logs', 'scripts', 'results' " ^
    "); " ^
    "$skipFiles = @('backend_export.txt', 'all_codes_export.txt', 'db.sqlite3', 'poetry.lock'); " ^
    "$files = Get-ChildItem -Path $backendDir -Recurse -File -Include $exts | Where-Object { " ^
    "    $name = $_.Name; " ^
    "    $skip = $false; " ^
    "    if ($skipFiles -contains $name) { $skip = $true } " ^
    "    if (-not $skip -and $name -match '(?i)(secret|credential|firebase|google-services|\.env|\.pem$|\.key$|\.sqlite3$|\.db$)') { $skip = $true } " ^
    "    if (-not $skip) { " ^
    "        $relPath = $_.FullName.Substring($backendDir.Length).TrimStart('\', '/'); " ^
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
    "Write-Host ('Backend Path: ' + $backendDir) -ForegroundColor Yellow; " ^
    "Write-Host ('Found ' + $count + ' backend code files to export.') -ForegroundColor Cyan; " ^
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
    "Write-Host 'Backend export finished successfully!' -ForegroundColor Green"

echo.
echo ========================================================
echo Done! Backend code is saved in:
echo %OUTPUT_FILE%
echo ========================================================
echo.
pause