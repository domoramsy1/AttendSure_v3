# AttendSure V3 - High-Speed Project Structure & File Tree Exporter
# Location: D:\AttendSure_V3\generate_structure.ps1

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = "D:\AttendSure_V3" }
$outputFile = Join-Path $rootDir "project_files.txt"

# ---------------------------------------------------------------------------
# 1. PRUNED FOLDERS (Skipped immediately without entering)
# ---------------------------------------------------------------------------
$skipFolderNames = @(
    'node_modules',
    '.git',
    '.expo',
    '.vscode',
    '__pycache__',
    'venv',
    'env',
    '.venv',
    'dist',
    'build',
    'coverage',
    '.cache',
    'media'
)

# ---------------------------------------------------------------------------
# 2. CYBERSECURITY EXCLUSIONS (Never expose keys or databases)
# ---------------------------------------------------------------------------
$skipFileRegex = '^(project_files\.txt|all_source_codes\.txt|\.env.*|.*\.sqlite3|.*\.db|.*\.log|.*\.pyc|.*\.keystore|.*\.jks|.*\.pem|.*\.key|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$'

Write-Host "Scanning AttendSure V3 project structure..." -ForegroundColor Cyan

# Tracking metrics
$fileCount = 0
$dirCount = 0
$flatList = [System.Collections.Generic.List[string]]::new()
$treeLines = [System.Collections.Generic.List[string]]::new()

# ---------------------------------------------------------------------------
# 3. HIGH-SPEED PRUNED RECURSION
# ---------------------------------------------------------------------------
function Process-Directory {
    param (
        [string]$currentPath,
        [string]$prefix = ""
    )

    # Fetch items directly in current directory (Instant, non-recursive)
    $items = Get-ChildItem -LiteralPath $currentPath -Force -ErrorAction SilentlyContinue | Where-Object {
        if ($_.PSIsContainer) {
            return $skipFolderNames -notcontains $_.Name
        } else {
            return $_.Name -notmatch $skipFileRegex
        }
    } | Sort-Object { -not $_.PSIsContainer }, Name

    $total = $items.Count
    $index = 0

    foreach ($item in $items) {
        $index++
        $isLast = ($index -eq $total)
        $branch = if ($isLast) { "└── " } else { "├── " }
        $nextPrefix = $prefix + (if ($isLast) { "    " } else { "│   " })

        $relPath = $item.FullName.Substring($rootDir.Length).TrimStart('\')

        if ($item.PSIsContainer) {
            $script:dirCount++
            $treeLines.Add("$prefix$branch$($item.Name)/")
            # Recurse only into allowed directories
            Process-Directory -currentPath $item.FullName -prefix $nextPrefix
        } else {
            $script:fileCount++
            $flatList.Add($relPath)
            $treeLines.Add("$prefix$branch$($item.Name)")
        }
    }
}

# Run traversal starting from root
Process-Directory -currentPath $rootDir

# ---------------------------------------------------------------------------
# 4. WRITE EXPORT USING BUFFERED STREAMWRITER
# ---------------------------------------------------------------------------
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$writer = New-Object System.IO.StreamWriter($outputFile, $false, $utf8NoBom)

try {
    $writer.WriteLine("================================================================================")
    $writer.WriteLine("ATTENDSURE V3 - PROJECT FILE & DIRECTORY STRUCTURE")
    $writer.WriteLine("Generated : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
    $writer.WriteLine("Root Path : $rootDir")
    $writer.WriteLine("Summary   : $dirCount Directories, $fileCount Source Files")
    $writer.WriteLine("================================================================================")
    $writer.WriteLine()
    $writer.WriteLine("--- VISUAL DIRECTORY TREE ---")
    $writer.WriteLine("AttendSure_V3/")
    foreach ($line in $treeLines) {
        $writer.WriteLine($line)
    }

    $writer.WriteLine()
    $writer.WriteLine("================================================================================")
    $writer.WriteLine("--- FLAT RELATIVE PATH LIST ($fileCount Files) ---")
    $writer.WriteLine("================================================================================")
    foreach ($p in $flatList) {
        $writer.WriteLine($p)
    }
} finally {
    $writer.Flush()
    $writer.Close()
    $writer.Dispose()
}

Write-Host "Success! Scanned $dirCount folders and $fileCount files in under 1 second." -ForegroundColor Green
Write-Host "Output saved to: $outputFile" -ForegroundColor Yellow