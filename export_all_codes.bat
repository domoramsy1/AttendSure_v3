@echo off
setlocal EnableDelayedExpansion

title AttendSure V3 - Project Code Exporter
echo ========================================================
echo       AttendSure V3 - Exporting All Project Codes
echo ========================================================
echo.

set "OUTPUT_FILE=%~dp0results\all_codes_export.txt"

if exist "%OUTPUT_FILE%" (
    echo Removing previous export file...
    del /f /q "%OUTPUT_FILE%"
)

echo Scanning main project folders and collecting source code...
echo Skipping libraries, modules, virtual environments, scripts, and secret files.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$scriptDir = '%~dp0'.TrimEnd('\'); " ^
    "$folderName = Split-Path $scriptDir -Leaf; " ^
    "if ($folderName -eq 'utilities') { $root = (Resolve-Path (Join-Path $scriptDir '..\..')).Path } " ^
    "elseif ($folderName -eq 'scripts') { $root = (Resolve-Path (Join-Path $scriptDir '..')).Path } " ^
    "else { $root = $scriptDir } " ^
    "$out = '%OUTPUT_FILE%'; " ^
    "$exts = @('*.py', '*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.html', '*.css', '*.sql'); " ^
    "$skipFolders = @( " ^
    "    '.git', '.github', '.vscode', '.idea', " ^
    "    'node_modules', '.expo', '.next', 'dist', 'build', 'coverage', " ^
    "    'venv', '.venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache', 'site-packages', " ^
    "    'scripts', 'media', 'staticfiles' " ^
    "); " ^
    "$skipFiles = @('results\all_codes_export.txt', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock'); " ^
    "$files = Get-ChildItem -Path $root -Recurse -File -Include $exts | Where-Object { " ^
    "    $name = $_.Name; " ^
    "    $skip = $false; " ^
    "    if ($skipFiles -contains $name) { $skip = $true } " ^
    "    if (-not $skip -and $name -match '(?i)(secret|credential|firebase|google-services|\.env)') { $skip = $true } " ^
    "    if (-not $skip) { " ^
    "        $relPath = $_.FullName.Substring($root.Length).TrimStart('\', '/'); " ^
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
    "Write-Host ('Project Root: ' + $root) -ForegroundColor Yellow; " ^
    "Write-Host ('Found ' + $count + ' source code files to export.') -ForegroundColor Cyan; " ^
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
    "Write-Host 'Export finished successfully!' -ForegroundColor Green"

echo.
echo ========================================================
echo Done! All project code is saved in:
echo %OUTPUT_FILE%
echo ========================================================
echo.
pause