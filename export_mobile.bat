Set-Content -Path "D:\AttendSure_V3\export_mobile.bat" -Value @'
@echo off
set "SOURCE_DIR=D:\AttendSure_V3\mobile"
set "OUTPUT_FILE=D:\AttendSure_V3\mobile_codebase_export.txt"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$source = '%SOURCE_DIR%';" ^
    "$out = '%OUTPUT_FILE%';" ^
    "$dirs = @('node_modules', '.expo', '.git', 'android', 'ios', 'dist', 'build', '.vscode', 'coverage');" ^
    "$exts = @('*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.env*', '*.config.*');" ^
    "if (Test-Path $out) { Remove-Item $out -Force };" ^
    "$files = Get-ChildItem -Path $source -Recurse -File -Include $exts | Where-Object { $p = $_.FullName; $skip = $false; foreach ($d in $dirs) { if ($p -match '[\\/]' + [regex]::Escape($d) + '[\\/]') { $skip = $true; break } }; -not $skip };" ^
    "$count = 0;" ^
    "foreach ($f in $files) {" ^
    "    $header = [Environment]::NewLine + ('=' * 80) + [Environment]::NewLine + 'FILE: ' + $f.FullName.Replace($source, 'mobile') + [Environment]::NewLine + ('=' * 80) + [Environment]::NewLine;" ^
    "    [System.IO.File]::AppendAllText($out, $header);" ^
    "    [System.IO.File]::AppendAllText($out, [System.IO.File]::ReadAllText($f.FullName) + [Environment]::NewLine);" ^
    "    $count++;" ^
    "};" ^
    "Write-Host \"Export done. Total files: $count\" -ForegroundColor Green;" ^
    "Write-Host \"Saved to: $out\" -ForegroundColor Cyan;"

pause
'@