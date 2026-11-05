@echo off
setlocal
cd /d "%~dp0\.."
set "SOURCE_DIR=%cd%\web"
set "OUTPUT_FILE=%cd%\scripts\results\web_code_export.txt"

echo Exporting Web Portal source files to %OUTPUT_FILE%...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$source = '%SOURCE_DIR%';" ^
    "$out = '%OUTPUT_FILE%';" ^
    "$dirs = @('node_modules', 'dist', 'build', '.git', '.vscode', 'coverage', '.vite');" ^
    "$exts = @('*.ts', '*.tsx', '*.js', '*.jsx', '*.html', '*.css', '*.json');" ^
    "if (Test-Path $out) { Remove-Item $out -Force };" ^
    "$files = Get-ChildItem -Path $source -Recurse -File -Include $exts | Where-Object { $p = $_.FullName; $skip = $false; foreach ($d in $dirs) { if ($p -match '[\\/]' + [regex]::Escape($d) + '[\\/]') { $skip = $true; break } }; -not $skip };" ^
    "$count = 0;" ^
    "foreach ($f in $files) {" ^
    "    $header = [Environment]::NewLine + ('=' * 80) + [Environment]::NewLine + 'FILE: ' + $f.FullName.Replace($source, 'web') + [Environment]::NewLine + ('=' * 80) + [Environment]::NewLine;" ^
    "    [System.IO.File]::AppendAllText($out, $header);" ^
    "    [System.IO.File]::AppendAllText($out, [System.IO.File]::ReadAllText($f.FullName) + [Environment]::NewLine);" ^
    "    $count++;" ^
    "};" ^
    "Write-Host \"Export done. Total web files: $count\" -ForegroundColor Green;"

pause