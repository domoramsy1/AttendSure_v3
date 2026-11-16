Set-Content -Path "D:\AttendSure_V3\export_all_codes.bat" -Value @'
@echo off
setlocal
cd /d "%~dp0"
set "BAT_FILE=%~f0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=$false; $s=(Get-Content -LiteralPath$env:BAT_FILE | Where-Object { if ($_ -eq '#PS_PAYLOAD') { $f=$true; $false } else { $f } }) -join [Environment]::NewLine; Invoke-Expression$s"

pause
exit /b %errorlevel%

#PS_PAYLOAD
$rootDir = Split-Path -Parent$env:BAT_FILE
$outputFile = Join-Path$rootDir "all_source_codes.txt"

# 1. Allowed file extensions
$validExtensions = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".json", ".ps1", ".sql") | ForEach-Object { [void]$validExtensions.Add($_) }

# 2. Excluded folders (skipped immediately for speed)
$excludeDirs = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@("node_modules", ".git", ".expo", ".vscode", "__pycache__", "venv", "env", ".venv", "dist", "build", "media", "assets", "coverage", ".cache") | ForEach-Object { [void]$excludeDirs.Add($_) }

# 3. Cybersecurity filter (blocks keys, secrets, logs, and database files)
$excludeFileRegex = '^(all_source_codes\.txt|project_files\.txt|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.env.*|.*\.sqlite3|.*\.db|.*\.log|.*\.keystore|.*\.jks|.*\.pem|.*\.key|.*\.pfx|google-services\.json|GoogleService-Info\.plist)$'$maxSizeBytes = 2 * 1024 * 1024

function Collect-SourceFiles([string]$currentDir, [System.Collections.Generic.List[string]]$results) {
    try {
        foreach ($subDir in [System.IO.Directory]::EnumerateDirectories($currentDir)) {
            $dirName = [System.IO.Path]::GetFileName($subDir)
            if (-not $excludeDirs.Contains($dirName)) {
                Collect-SourceFiles $subDir$results
            }
        }
        foreach ($filePath in [System.IO.Directory]::EnumerateFiles($currentDir)) {
            $fileName = [System.IO.Path]::GetFileName($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath)
            if ($validExtensions.Contains($ext) -and ($fileName -notmatch$excludeFileRegex)) {
                try {
                    $fi = [System.IO.FileInfo]::new($filePath)
                    if ($fi.Length -le$maxSizeBytes) {
                        $results.Add($filePath)
                    }
                } catch {}
            }
        }
    } catch {}
}

Write-Host "Scanning repository for source code files..." -ForegroundColor Cyan
$collectedFiles = [System.Collections.Generic.List[string]]::new()
Collect-SourceFiles $rootDir $collectedFiles$collectedFiles.Sort([System.StringComparer]::OrdinalIgnoreCase)

if ($collectedFiles.Count -eq 0) {
    Write-Host "No matching source code files found." -ForegroundColor Yellow
    exit
}

Write-Host "Found $($collectedFiles.Count) verified source files. Writing backup..." -ForegroundColor Green

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$writer = [System.IO.StreamWriter]::new($outputFile, $false,$utf8NoBom)

try {
    $header = "================================================================================`n" +
              "ATTENDSURE V3 - COMPLETE SOURCE CODE REPOSITORY EXPORT`n" +
              "Generated : " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "`n" +
              "Root Path : $rootDir`n" +
              "Total     : $($collectedFiles.Count) files`n" +
              "================================================================================`n`n"
    $writer.Write($header)

    $index = 1
    $total = $collectedFiles.Count

    foreach ($file in $collectedFiles) {
        $relPath = $file.Substring($rootDir.Length).TrimStart('\', '/')
        $banner = "================================================================================`n" +
                  "FILE [$index/$total]:$relPath`n" +
                  "FULL PATH: $file`n" +
                  "================================================================================`n`n"
        $writer.Write($banner)

        try {
            $content = [System.IO.File]::ReadAllText($file,$utf8NoBom)
            $writer.WriteLine($content)
        } catch {
            $writer.WriteLine("// [WARNING] Could not read file contents: $($_.Exception.Message)")
        }

        $writer.WriteLine("`n")
        $index++
    }
} finally {
    $writer.Dispose()
}

$sizeMb = [math]::Round((Get-Item -LiteralPath $outputFile).Length / 1MB, 2)
Write-Host "`nExport complete! Clean source archive generated:" -ForegroundColor Green
Write-Host "Location: $outputFile" -ForegroundColor Cyan
Write-Host "Files Included: $($collectedFiles.Count) ($sizeMb MB)" -ForegroundColor White
'@