# AttendSure V3 - High-Speed Secure Source Code Exporter
# Location: D:\AttendSure_V3\export_all_codes.ps1

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = "D:\AttendSure_V3" }
$outputFile = Join-Path $rootDir "all_source_codes.txt"

# ---------------------------------------------------------------------------
# 1. ALLOWED SOURCE CODE EXTENSIONS
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# 2. CYBERSECURITY & NOISE EXCLUSION PATTERNS
# ---------------------------------------------------------------------------
# Directories to bypass
$excludeDirectories = @(
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
    '\\assets($|\\)',
    '\\coverage($|\\)',
    '\\\.cache($|\\)'
)
$dirRegex = ($excludeDirectories -join '|')

# Sensitive files, credentials, keys, lockfiles, and generated dumps
$excludeFileRegex = '^(all_source_codes\.txt|project_files\.txt|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.env.*|.*\.sqlite3|.*\.db|.*\.log|.*\.keystore|.*\.jks|.*\.pem|.*\.key|.*\.pfx|google-services\.json|GoogleService-Info\.plist)$'

Write-Host "Scanning repository for source code..." -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 3. FAST SCAN & CYBERSECURITY FILTERING
# ---------------------------------------------------------------------------
$allFiles = Get-ChildItem -Path $rootDir -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
    $extMatches = $validExtensions -contains $_.Extension.ToLower()
    $dirAllowed = $_.FullName -notmatch $dirRegex
    $fileAllowed = $_.Name -notmatch $excludeFileRegex
    $sizeAllowed = $_.Length -lt 2MB # Prevent minified vendor files from bloating output

    return $extMatches -and $dirAllowed -and $fileAllowed -and $sizeAllowed
} | Sort-Object FullName

if ($allFiles.Count -eq 0) {
    Write-Host "No matching source code files found." -ForegroundColor Yellow
    exit 0
}

Write-Host "Found $($allFiles.Count) verified source files. Writing backup..." -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 4. HIGH-SPEED BUFFERED STREAM WRITING
# ---------------------------------------------------------------------------
# Using StreamWriter avoids repetitive open/close disk cycles
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$writer = New-Object System.IO.StreamWriter($outputFile, $false, $utf8NoBom)

try {
    # Institutional Header
    $writer.WriteLine("================================================================================")
    $writer.WriteLine("ATTENDSURE V3 - COMPLETE SOURCE CODE REPOSITORY EXPORT")
    $writer.WriteLine("Generated : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
    $writer.WriteLine("Root Path : $rootDir")
    $writer.WriteLine("Total     : $($allFiles.Count) files")
    $writer.WriteLine("================================================================================")
    $writer.WriteLine()

    $index = 0
    foreach ($file in $allFiles) {
        $index++
        $relativePath = $file.FullName.Substring($rootDir.Length).TrimStart('\')

        # Clean file banner
        $writer.WriteLine("================================================================================")
        $writer.WriteLine("FILE [$index/$($allFiles.Count)]: $relativePath")
        $writer.WriteLine("FULL PATH: $($file.FullName)")
        $writer.WriteLine("================================================================================")
        $writer.WriteLine()

        # Stream file content safely with fallback if locked by dev server
        try {
            $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
            $writer.WriteLine($content)
        } catch {
            $writer.WriteLine("// [WARNING] Could not read file contents: $($_.Exception.Message)")
        }

        $writer.WriteLine()
        $writer.WriteLine()
    }
} finally {
    $writer.Flush()
    $writer.Close()
    $writer.Dispose()
}

$outputFileInfo = Get-Item $outputFile
$outputSizeMB = [Math]::Round(($outputFileInfo.Length / 1MB), 2)

Write-Host "`nExport complete! Clean source archive generated:" -ForegroundColor Green
Write-Host "Location: $outputFile" -ForegroundColor Yellow
Write-Host "Files Included: $($allFiles.Count) ($outputSizeMB MB)" -ForegroundColor Green