@echo off
setlocal DisableDelayedExpansion

title AttendSure - Mobile Codebase Exporter
echo ================================================================================
echo         AttendSure - Exporting Mobile File Structure and Codebase
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
} elseif ($folderName -ieq 'scripts') {
    $root = (Resolve-Path (Join-Path $scriptPath '..')).Path
} else {
    $root = $scriptPath
}

$targetFolders = @('mobile')
$outFile = Join-Path $scriptPath 'mobile_codes_export.txt'

if (Test-Path -LiteralPath $outFile) {
    Write-Host "Removing previous export file..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $outFile -Force
}

$skipDirs = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    '.git', '.github', '.idea',
    'node_modules', '.expo', '.next', 'dist', 'build', 'coverage',
    'venv', '.venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache', 'site-packages',
    'media', 'staticfiles', 'results', '_backup_monoliths'
) | ForEach-Object { [void]$skipDirs.Add($_) }

$skipFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    'all_codes_export.txt', 'backend_codes_export.txt', 'web_codes_export.txt',
    'mobile_codes_export.txt', 'mobile_and_web_codes_export.txt', 'backend_code_export.txt', 'project_files.txt',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock'
) | ForEach-Object { [void]$skipFiles.Add($_) }

$allowedExts = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    '.py', '.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.sql',
    '.env', '.bat', '.cmd', '.ps1', '.sh', '.md', '.yml', '.yaml',
    '.toml', '.ini', '.conf', '.cfg', '.pem', '.key', '.crt', '.txt'
) | ForEach-Object { [void]$allowedExts.Add($_) }

$collectedFiles = New-Object 'System.Collections.Generic.List[System.IO.FileInfo]'
$visitedDirs = New-Object 'System.Collections.Generic.List[string]'

function Scan-Directory([string]$currentDir) {
    $dirInfo = New-Object System.IO.DirectoryInfo($currentDir)

    foreach ($file in ($dirInfo.GetFiles() | Sort-Object Name)) {
        if ($skipFiles.Contains($file.Name)) { continue }

        $isSecretOrEnv = (
            $file.Name.StartsWith('.env', [System.StringComparison]::OrdinalIgnoreCase) -or
            $file.Name -match '(?i)(secret|credential|firebase|google-services|\.env)'
        )

        if ($isSecretOrEnv -or $allowedExts.Contains($file.Extension)) {
            $collectedFiles.Add($file)
        }
    }

    foreach ($subDir in ($dirInfo.GetDirectories() | Sort-Object Name)) {
        if ($skipDirs.Contains($subDir.Name)) { continue }
        $visitedDirs.Add($subDir.FullName)
        Scan-Directory $subDir.FullName
    }
}

foreach ($tf in $targetFolders) {
    $targetPath = Join-Path $root $tf
    if (Test-Path -LiteralPath $targetPath) {
        Write-Host "Scanning folder (including secret and .env files): $targetPath" -ForegroundColor Cyan
        $visitedDirs.Add($targetPath)
        Scan-Directory $targetPath
    } else {
        Write-Host "Warning: Folder not found -> $targetPath" -ForegroundColor Yellow
    }
}

$totalFiles = $collectedFiles.Count
$totalDirs = $visitedDirs.Count
Write-Host "Found $totalFiles files across $totalDirs folders." -ForegroundColor Green

function Build-TreeLines([string]$baseDir, [System.Collections.Generic.List[System.IO.FileInfo]]$files) {
    $treeLines = New-Object 'System.Collections.Generic.List[string]'
    $rootName = Split-Path $baseDir -Leaf
    $treeLines.Add("$rootName/")

    $relPaths = New-Object 'System.Collections.Generic.List[string]'
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($baseDir.Length).TrimStart('\', '/') -replace '\\', '/'
        $relPaths.Add($rel)
    }

    $nodeMap = @{}
    foreach ($path in $relPaths) {
        $parts = $path -split '/'
        $curr = $nodeMap
        for ($i = 0; $i -lt $parts.Length; $i++) {
            $part = $parts[$i]
            if (-not $curr.ContainsKey($part)) {
                $curr[$part] = @{}
            }
            $curr = $curr[$part]
        }
    }

    function Render-Nodes([hashtable]$map, [string]$prefix) {
        $keys = $map.Keys | Sort-Object {
            if ($map[$_].Count -gt 0) { "0_$_" } else { "1_$_" }
        }
        $keyList = @($keys)
        for ($i = 0; $i -lt $keyList.Count; $i++) {
            $k = $keyList[$i]
            $isLast = ($i -eq ($keyList.Count - 1))
            $branch = if ($isLast) { "+-- " } else { "|-- " }
            $childMap = $map[$k]
            if ($childMap.Count -gt 0) {
                $treeLines.Add("$prefix$branch$k/")
                $nextPrefix = if ($isLast) { "$prefix    " } else { "$prefix|   " }
                Render-Nodes $childMap $nextPrefix
            } else {
                $treeLines.Add("$prefix$branch$k")
            }
        }
    }

    Render-Nodes $nodeMap ""
    return $treeLines
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$writer = New-Object System.IO.StreamWriter($outFile, $false, $utf8NoBom)

try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $padWidth = [Math]::Max(3, $totalFiles.ToString().Length)

    $writer.WriteLine("================================================================================")
    $writer.WriteLine("ATTENDSURE  - MOBILE APP STRUCTURE & SOURCE CODE EXPORT")
    $writer.WriteLine("Generated   : $timestamp")
    $writer.WriteLine("Project Root: $root")
    $writer.WriteLine("Target      : mobile/")
    $writer.WriteLine("Summary     : $totalDirs Folders, $totalFiles Files (Includes Secret & Config Files)")
    $writer.WriteLine("================================================================================")
    $writer.WriteLine("")

    $writer.WriteLine("================================================================================")
    $writer.WriteLine("SECTION 1: VISUAL DIRECTORY STRUCTURE")
    $writer.WriteLine("================================================================================")
    $treeOutput = Build-TreeLines $root $collectedFiles
    foreach ($tLine in $treeOutput) {
        $writer.WriteLine($tLine)
    }
    $writer.WriteLine("")

    $writer.WriteLine("================================================================================")
    $writer.WriteLine("SECTION 2: NUMBERED COMPLETE FILE PATH INDEX (1 to $totalFiles)")
    $writer.WriteLine("================================================================================")
    for ($i = 0; $i -lt $totalFiles; $i++) {
        $num = ($i + 1).ToString().PadLeft($padWidth, '0')
        $fullPath = $collectedFiles[$i].FullName
        $writer.WriteLine("[$num] $fullPath")
    }
    $writer.WriteLine("")

    $writer.WriteLine("================================================================================")
    $writer.WriteLine("SECTION 3: COMPLETE FILE CODES (1 to $totalFiles)")
    $writer.WriteLine("================================================================================")

    for ($i = 0; $i -lt $totalFiles; $i++) {
        $f = $collectedFiles[$i]
        $num = ($i + 1).ToString().PadLeft($padWidth, '0')
        $totalStr = $totalFiles.ToString().PadLeft($padWidth, '0')
        $relPath = $f.FullName.Substring($root.Length).TrimStart('\', '/')

        $writer.WriteLine("")
        $writer.WriteLine("================================================================================")
        $writer.WriteLine("FILE [$num of $totalStr]")
        $writer.WriteLine("Complete Path : $($f.FullName)")
        $writer.WriteLine("Relative Path : $relPath")
        $writer.WriteLine("================================================================================")

        try {
            $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
            $writer.WriteLine($content)
        } catch {
            $writer.WriteLine("[Could not read file as text: $($_.Exception.Message)]")
        }
    }
} finally {
    $writer.Close()
}

Write-Host "================================================================================" -ForegroundColor Green
Write-Host "Mobile export finished! Saved $totalFiles numbered files to:" -ForegroundColor Green
Write-Host $outFile -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Green