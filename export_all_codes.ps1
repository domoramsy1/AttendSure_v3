# AttendSure V3 - Single-File Source Code Exporter
# Location: D:\AttendSure_V3\export_all_codes.ps1

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = "D:\AttendSure_V3" }
$outputFile = Join-Path $rootDir "all_source_codes.txt"

# ---------------------------------------------------------------------------
# 1. FILE EXTENSIONS & FILTER RULES
# ---------------------------------------------------------------------------
# Source code extensions to include
$validExtensions = @(
    '.py',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.html',
    '.css',
    '.json',
    '.ps1',
    '.sql'
)

# Folders and cache paths to ignore
$excludePathPatterns = @(
    '\\node_modules($|\\)',
    '\\\.git($|\\)',
    '\\\.expo($|\\)',
    '\\\.vscode($|\\)',
    '\\__pycache__($|\\)',
    '\\venv($|\\)',
    '\\env($|\\)',
    '\\\.venv($|\\)',
    '\\dist($|\\)',
    '\\build($|\\)',
    '\\media($|\\)',
    '\\assets($|\\)'
)

# Cybersecurity: Never export secrets, credentials, binary files, or lockfiles
$excludeFileNames = @(
    '.env',
    '.env.local',
    '.env.production',
    'package-lock.json',
    'yarn.lock',
    'all_source_codes.txt',
    'project_files.txt',
    'db.sqlite3'
)

$excludePathRegex = ($excludePathPatterns -join '|')

Write-Host "Collecting all source code files..." -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 2. SCAN AND FILTER FILES
# ---------------------------------------------------------------------------
$allFiles = Get-ChildItem -Path $rootDir -Recurse -File | Where-Object {
    $file = $_
    $hasValidExt = $validExtensions -contains $file.Extension.ToLower()
    $notExcludedFolder = $file.FullName -notmatch $excludePathRegex
    $notExcludedFile = $excludeFileNames -notcontains $file.Name

    return $hasValidExt -and $notExcludedFolder -and $notExcludedFile
} | Sort-Object FullName

if ($allFiles.Count -eq 0) {
    Write-Host "No matching source files found." -ForegroundColor Yellow
    exit 0
}

# ---------------------------------------------------------------------------
# 3. WRITE COMBINED TEXT FILE
# ---------------------------------------------------------------------------
$headerText = @"
================================================================================
ATTENDSURE V3 - FULL SOURCE CODE BACKUP
Export Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Total Files: $($allFiles.Count)
================================================================================
"@

$headerText | Set-Content -Path $outputFile -Encoding UTF8

$count = 0
foreach ($file in $allFiles) {
    $count++
    $relativePath = $file.FullName.Substring($rootDir.Length).TrimStart('\')

    $separator = @"

================================================================================
FILE [$count/$($allFiles.Count)]: $relativePath
PATH: $($file.FullName)
================================================================================

"@

    Write-Host "[$count/$($allFiles.Count)] Merging: $relativePath" -ForegroundColor Gray
    $separator | Add-Content -Path $outputFile -Encoding UTF8
    Get-Content -Path $file.FullName -Raw -Encoding UTF8 | Add-Content -Path $outputFile -Encoding UTF8
}

Write-Host "`nCompleted! Successfully merged $($allFiles.Count) source files into:" -ForegroundColor Green
Write-Host "$outputFile" -ForegroundColor Yellow