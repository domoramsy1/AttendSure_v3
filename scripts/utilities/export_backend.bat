@echo off
setlocal
cd /d "%~dp0\..\.."

set "SOURCE_DIR=%cd%\backend"
set "OUTPUT_DIR=%cd%\scripts\results"
set "OUTPUT_FILE=%OUTPUT_DIR%\backend_code_export.txt"

echo ===================================================
echo AttendSure V3 - Backend Codebase and Tree Exporter
echo Source: %SOURCE_DIR%
echo Output: %OUTPUT_FILE%
echo ===================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$source = '%SOURCE_DIR%';" ^
    "$outDir = '%OUTPUT_DIR%';" ^
    "$out = '%OUTPUT_FILE%';" ^
    "$skipDirs = @('venv', 'env', '.venv', '__pycache__', '.git', '.vscode', 'logs', 'staticfiles', 'media');" ^
    "$codeExts = @('*.py', '*.html', '*.css', '*.js', '*.json', '*.sql', '*.bat', '*.md');" ^
    "if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null };" ^
    "if (Test-Path $out) { Remove-Item $out -Force };" ^
    "$utf8 = New-Object System.Text.UTF8Encoding($false);" ^
    "$allFiles = Get-ChildItem -Path $source -Recurse -File | Where-Object {" ^
    "    $path = $_.FullName;" ^
    "    $skip = $false;" ^
    "    foreach ($d in $skipDirs) {" ^
    "        if ($path -match '[\\/]' + [regex]::Escape($d) + '[\\/]') { $skip = $true; break }" ^
    "    };" ^
    "    -not $skip" ^
    "};" ^
    "$codeFiles = $allFiles | Where-Object {" ^
    "    $f = $_;" ^
    "    $match = $false;" ^
    "    foreach ($ext in $codeExts) {" ^
    "        if ($f.Name -like $ext) { $match = $true; break }" ^
    "    };" ^
    "    $match" ^
    "};" ^
    "$header = '================================================================================' + [Environment]::NewLine;" ^
    "$header += 'ATTENDSURE V3 - BACKEND FILE STRUCTURE & SOURCE CODE EXPORT' + [Environment]::NewLine;" ^
    "$header += 'Date: ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + [Environment]::NewLine;" ^
    "$header += 'Total Backend Files: ' + $codeFiles.Count + [Environment]::NewLine;" ^
    "$header += '================================================================================' + [Environment]::NewLine + [Environment]::NewLine;" ^
    "$header += 'PART 1: FILE AND FOLDER STRUCTURE TREE' + [Environment]::NewLine;" ^
    "$header += '--------------------------------------------------------------------------------' + [Environment]::NewLine;" ^
    "[System.IO.File]::AppendAllText($out, $header, $utf8);" ^
    "foreach ($f in ($allFiles | Sort-Object FullName)) {" ^
    "    $relative = 'backend' + $f.FullName.Substring($source.Length);" ^
    "    [System.IO.File]::AppendAllText($out, '  [FILE] ' + $relative + [Environment]::NewLine, $utf8);" ^
    "};" ^
    "$part2 = [Environment]::NewLine + '================================================================================' + [Environment]::NewLine;" ^
    "$part2 += 'PART 2: COMPLETE SOURCE CODE CONTENTS' + [Environment]::NewLine;" ^
    "$part2 += '================================================================================' + [Environment]::NewLine + [Environment]::NewLine;" ^
    "[System.IO.File]::AppendAllText($out, $part2, $utf8);" ^
    "$count = 0;" ^
    "foreach ($f in $codeFiles) {" ^
    "    $relPath = 'backend' + $f.FullName.Substring($source.Length);" ^
    "    Write-Host ('Exporting [' + ($count + 1) + '/' + $codeFiles.Count + ']: ' + $relPath);" ^
    "    $fileBanner = [Environment]::NewLine + ('=' * 80) + [Environment]::NewLine;" ^
    "    $fileBanner += 'FILE: ' + $relPath + [Environment]::NewLine;" ^
    "    $fileBanner += ('=' * 80) + [Environment]::NewLine;" ^
    "    [System.IO.File]::AppendAllText($out, $fileBanner, $utf8);" ^
    "    try {" ^
    "        $body = [System.IO.File]::ReadAllText($f.FullName, $utf8);" ^
    "        [System.IO.File]::AppendAllText($out, $body + [Environment]::NewLine, $utf8);" ^
    "        $count++;" ^
    "    } catch {" ^
    "        [System.IO.File]::AppendAllText($out, '/* Error reading file: ' + $_.Exception.Message + ' */' + [Environment]::NewLine, $utf8);" ^
    "    }" ^
    "};" ^
    "Write-Host '' ;" ^
    "Write-Host ('Successfully exported ' + $count + ' code files to: ' + $out) -ForegroundColor Green;"

pause