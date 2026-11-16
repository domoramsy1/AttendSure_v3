@echo off
setlocal
cd /d "%~dp0"
set "BAT_FILE=%~f0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=$false; $s=(Get-Content -LiteralPath $env:BAT_FILE | Where-Object { if ($_ -eq '#PS_PAYLOAD') { $f=$true; $false } else { $f } }) -join [Environment]::NewLine; Invoke-Expression $s"

pause
exit /b %errorlevel%

#PS_PAYLOAD
$rootDir = if ($env:BAT_FILE) { Split-Path -Parent $env:BAT_FILE } else { (Get-Location).Path }
$outputFile = Join-Path $rootDir "project_files.txt"

# 1. Folders to skip instantly
$excludeDirs = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@("node_modules", ".git", ".expo", ".vscode", "__pycache__", "venv", "env", ".venv", "dist", "build", "coverage", ".cache", "media") | ForEach-Object { [void]$excludeDirs.Add($_) }

# 2. Cybersecurity filter (blocks keys, secrets, logs, and database files)
$excludeRegex = '^(project_files.*\.txt|all_source_codes\.txt|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.env.*|.*\.sqlite3|.*\.db|.*\.log|.*\.pyc|.*\.keystore|.*\.jks|.*\.pem|.*\.key|.*\.pfx|google-services\.json|GoogleService-Info\.plist)$'

$stats = @{
    DirCount  = 0
    FileCount = 0
    FlatList  = [System.Collections.Generic.List[string]]::new()
    TreeLines = [System.Collections.Generic.List[string]]::new()
}

function Build-StructureTree([string]$currentPath, [string]$prefix, [string]$baseDir, $skipDirs, [string]$skipPattern, $state) {
    try {
        $subDirs = [System.IO.Directory]::GetDirectories($currentPath) | Where-Object {
            -not $skipDirs.Contains([System.IO.Path]::GetFileName($_))
        } | Sort-Object

        $files = [System.IO.Directory]::GetFiles($currentPath) | Where-Object {
            [System.IO.Path]::GetFileName($_) -notmatch $skipPattern
        } | Sort-Object

        $entries = [System.Collections.Generic.List[PSCustomObject]]::new()
        foreach ($d in $subDirs) {
            $entries.Add([PSCustomObject]@{ IsDir = $true; Path = $d; Name = [System.IO.Path]::GetFileName($d) })
        }
        foreach ($f in $files) {
            $entries.Add([PSCustomObject]@{ IsDir = $false; Path = $f; Name = [System.IO.Path]::GetFileName($f) })
        }

        $total = $entries.Count
        for ($i = 0; $i -lt $total; $i++) {
            $entry = $entries[$i]
            $isLast = ($i -eq ($total - 1))

            if ($isLast) {
                $branch = [char]0x2514 + [char]0x2500 + [char]0x2500 + ' '
                $nextPrefix = $prefix + '    '
            } else {
                $branch = [char]0x251C + [char]0x2500 + [char]0x2500 + ' '
                $nextPrefix = $prefix + [char]0x2502 + '   '
            }

            if ($entry.IsDir) {
                $state.DirCount++
                $state.TreeLines.Add("$prefix$branch$($entry.Name)/")
                Build-StructureTree $entry.Path $nextPrefix $baseDir $skipDirs $skipPattern $state
            } else {
                $state.FileCount++
                $rel = $entry.Path.Substring($baseDir.Length).TrimStart('\', '/')
                $state.FlatList.Add($rel)
                $state.TreeLines.Add("$prefix$branch$($entry.Name)")
            }
        }
    } catch {
        Write-Warning "Directory scan error in $($currentPath) - $($_.Exception.Message)"
    }
}

Write-Host "Scanning AttendSure V3 project structure..." -ForegroundColor Cyan
Build-StructureTree $rootDir "" $rootDir $excludeDirs $excludeRegex $stats

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$writer = [System.IO.StreamWriter]::new($outputFile, $false, $utf8NoBom)

try {
    $header = "================================================================================`n" +
              "ATTENDSURE V3 - PROJECT FILE & DIRECTORY STRUCTURE`n" +
              "Generated : " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "`n" +
              "Root Path : $rootDir`n" +
              "Summary   : $($stats.DirCount) Directories, $($stats.FileCount) Source Files`n" +
              "================================================================================`n`n" +
              "--- VISUAL DIRECTORY TREE ---`n" +
              "AttendSure_V3/`n"
    $writer.Write($header)

    $stats.TreeLines | ForEach-Object { $writer.WriteLine($_) }

    $divider = "`n================================================================================`n" +
               "--- FLAT RELATIVE PATH LIST ($($stats.FileCount) Files) ---`n" +
               "================================================================================`n"
    $writer.Write($divider)

    $stats.FlatList | ForEach-Object { $writer.WriteLine($_) }
} finally {
    $writer.Dispose()
}

Write-Host "Success! Scanned $($stats.DirCount) folders and $($stats.FileCount) files." -ForegroundColor Green
Write-Host "Output saved to: $outputFile" -ForegroundColor Cyan