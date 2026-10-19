# AttendSure V3 - Project File Structure Exporter
# Location: D:\AttendSure_V3\generate_structure.ps1

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = "D:\AttendSure_V3" }
$outputFile = Join-Path $rootDir "project_files.txt"

# Folders, virtual environments, and binary caches to ignore
$excludePatterns = @(
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
    '\.pyc$',
    '\.log$',
    'project_files\.txt$'
)

$excludeRegex = ($excludePatterns -join '|')

Write-Host "Scanning project directory..." -ForegroundColor Cyan

$items = Get-ChildItem -Path $rootDir -Recurse | Where-Object {
    $_.FullName -notmatch $excludeRegex
}

# Convert full paths to clean relative paths
$relativePaths = $items | ForEach-Object {
    $_.FullName.Substring($rootDir.Length).TrimStart('\')
} | Sort-Object

# Write to text file
$relativePaths | Set-Content -Path $outputFile -Encoding UTF8

Write-Host "Success! Exported $($relativePaths.Count) project files to $outputFile" -ForegroundColor Green