@echo off
setlocal EnableDelayedExpansion

title AttendSure V3 - Web Portal Code Exporter
echo ========================================================
echo       AttendSure V3 - Exporting Web Portal Code Only
echo ========================================================
echo.

set "RESULTS_DIR=%~dp0results"
if not exist "%RESULTS_DIR%" (
    mkdir "%RESULTS_DIR%"
)

set "OUTPUT_FILE=%RESULTS_DIR%\web_export.txt"

if exist "%OUTPUT_FILE%" (
    echo Removing previous web export file...
    del /f /q "%OUTPUT_FILE%"
)

echo Scanning web folder and collecting source code...
echo Skipping node_modules, build caches, lockfiles, and secret files.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$scriptDir = '%~dp0'.TrimEnd('\'); " ^
    "$root = (Resolve-Path (Join-Path $scriptDir '..')).Path; " ^
    "$webDir = Join-Path $root 'web'; " ^
    "if (-not (Test-Path $webDir)) { " ^
    "    Write-Host ('Error: Web folder not found at ' + $webDir) -ForegroundColor Red; " ^
    "    exit 1; " ^
    "} " ^
    "$out = '%OUTPUT_FILE%'; " ^
    "$exts = @('*.ts', '*.tsx', '*.js', '*.jsx', '*.html', '*.css', '*.json'); " ^
    "$skipFolders = @( " ^
    "    '.git', '.github', '.vscode', '.idea', " ^
    "    'node_modules', '.vite', '.next', '.turbo', '.cache', " ^
    "    'dist', 'build', 'coverage', 'scripts', 'results' " ^
    "); " ^
    "$skipFiles = @( " ^
    "    'web_export.txt', 'web_code_export.txt', 'all_codes_export.txt', " ^
    "    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml' " ^
    "); " ^
    "$files = Get-ChildItem -Path $webDir -Recurse -File -Include $exts | Where-Object { " ^
    "    $name = $_.Name; " ^
    "    $skip = $false; " ^
    "    if ($skipFiles -contains $name) { $skip = $true } " ^
    "    if (-not $skip -and $name -match '(?i)(secret|credential|firebase|google-services|\.env|\.pem$|\.key$)') { $skip = $true } " ^
    "    if (-not $skip) { " ^
    "        $relPath = $_.FullName.Substring($webDir.Length).TrimStart('\', '/'); " ^
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
    "Write-Host ('Web Path: ' + $webDir) -ForegroundColor Yellow; " ^
    "Write-Host ('Found ' + $count + ' web source files to export.') -ForegroundColor Cyan; " ^
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
    "Write-Host 'Web export finished successfully!' -ForegroundColor Green"

echo.
echo ========================================================
echo Done! Web portal code is saved in:
echo %OUTPUT_FILE%
echo ========================================================
echo.
pause