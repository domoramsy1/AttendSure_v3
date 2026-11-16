Set-Content -Path "D:\AttendSure_V3\export_backend.bat" -Value @'
@echo off
set "SOURCE_DIR=D:\AttendSure_V3\backend"
set "OUTPUT_FILE=D:\AttendSure_V3\backend_codebase_export.txt"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$source = '%SOURCE_DIR%';" ^
    "$out = '%OUTPUT_FILE%';" ^
    "$dirs = @('venv', 'env', '.venv', '__pycache__', '.git', '.vscode', 'logs', 'staticfiles', 'media');" ^
    "$exts = @('*.py', '*.html', '*.css', '*.js', '*.json', '*.env*', '*.ini', '*.txt', '*.md', '*.sql');" ^
    "$skipFiles = @('db.sqlite3', 'backend_codebase_export.txt');" ^
    "if (Test-Path $out) { Remove-Item $out -Force };" ^
    "$files = Get-ChildItem -Path $source -Recurse -File -Include $exts | Where-Object { $p = $_.FullName; $skip = $false; foreach ($d in $dirs) { if ($p -match '[\\/]' + [regex]::Escape($d) + '[\\/]') { $skip = $true; break } }; if ($skipFiles -contains $_.Name) { $skip = $true }; -not $skip };" ^
    "$count = 0;" ^
    "foreach ($f in $files) {" ^
    "    $header = [Environment]::NewLine + ('=' * 80) + [Environment]::NewLine + 'FILE: ' + $f.FullName.Replace($source, 'backend') + [Environment]::NewLine + ('=' * 80) + [Environment]::NewLine;" ^
    "    [System.IO.File]::AppendAllText($out, $header);" ^
    "    [System.IO.File]::AppendAllText($out, [System.IO.File]::ReadAllText($f.FullName) + [Environment]::NewLine);" ^
    "    $count++;" ^
    "};" ^
    "Write-Host \"Export done. Total backend files: $count\" -ForegroundColor Green;" ^
    "Write-Host \"Saved to: $out\" -ForegroundColor Cyan;"

pause
'@