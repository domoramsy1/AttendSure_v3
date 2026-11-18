@echo off
setlocal DisableDelayedExpansion

title AttendSure - Remove Version Label (AttendSure V3 to AttendSure)
echo ================================================================================
echo       AttendSure - Updating System Name from "AttendSure V3" to "AttendSure"
echo ================================================================================
echo.

set "BATCH_DIR=%~dp0"
set "BATCH_FILE=%~f0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$lines = [System.IO.File]::ReadAllLines($env:BATCH_FILE, [System.Text.Encoding]::UTF8); $idx = [Array]::IndexOf($lines, '# === POWERSHELL_LOGIC_START ==='); $code = ($lines[($idx + 1)..($lines.Length - 1)] -join \"`n\"); Invoke-Expression $code"

echo.
pause
exit /b 0

# === POWERSHELL_LOGIC_START ===
$ErrorActionPreference = "Stop"

$scriptPath = $env:BATCH_DIR.TrimEnd('\', '/')
$folderName = Split-Path $scriptPath -Leaf

if ($folderName -ieq 'utilities') {
    $root = (Resolve-Path (Join-Path $scriptPath '..\..')).Path
} elseif ($folderName -ieq 'scripts' -or $folderName -ieq 'web') {
    $root = (Resolve-Path (Join-Path $scriptPath '..')).Path
} else {
    $root = $scriptPath
}

$skipDirs = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    '.git', 'node_modules', '.expo', '.next', 'dist', 'build', 'coverage',
    'venv', '.venv', 'env', '__pycache__', 'media', 'staticfiles', '_backup_monoliths'
) | ForEach-Object { [void]$skipDirs.Add($_) }

$targetExts = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    '.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.json', '.py', '.md', '.bat'
) | ForEach-Object { [void]$targetExts.Add($_) }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$updatedCount = 0

function Process-Folder([string]$dir) {
    $dInfo = New-Object System.IO.DirectoryInfo($dir)

    foreach ($f in $dInfo.GetFiles()) {
        # Skip this script itself and exported text logs
        if ($f.FullName -eq $env:BATCH_FILE -or $f.Extension -ieq '.txt') { continue }
        if (-not $targetExts.Contains($f.Extension)) { continue }

        $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)

        if ($content -match '(?i)AttendSure\s+V3') {
            # Preserve uppercase vs title-case formatting, while protecting disk paths like AttendSure_V3
            $newContent = $content `
                -replace 'ATTENDSURE\s+V3', 'ATTENDSURE' `
                -replace 'AttendSure\s+V3', 'AttendSure' `
                -replace 'attendsure\s+v3', 'attendsure'

            if ($newContent -ne $content) {
                [System.IO.File]::WriteAllText($f.FullName, $newContent, $utf8NoBom)
                $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/')
                Write-Host "  - Updated: $rel" -ForegroundColor Green
                $script:updatedCount++
            }
        }
    }

    foreach ($sub in $dInfo.GetDirectories()) {
        if (-not $skipDirs.Contains($sub.Name)) {
            Process-Folder $sub.FullName
        }
    }
}

Write-Host "Scanning project files in: $root" -ForegroundColor Cyan
Process-Folder $root

Write-Host ""
Write-Host "Updated $updatedCount file(s) to use 'AttendSure'." -ForegroundColor Green

$webDir = Join-Path $root 'web'
if (Test-Path -LiteralPath $webDir) {
    Write-Host ""
    Write-Host "Running web build check (npm run build)..." -ForegroundColor Cyan
    Push-Location $webDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Web build reported an error."
        }
        Write-Host "Web build passed with 0 errors!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}