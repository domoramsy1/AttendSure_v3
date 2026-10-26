# ==============================================================================
# AttendSure V3 - Project Source Files & Folder Auditor
# Path: D:\AttendSure_V3\mobile\count_clean.ps1
# Sorted: Ascending by line count (fewest lines to most lines)
# Excludes: package-lock.json, node_modules, .expo, .git, build, dist, cache
# ==============================================================================

$target = "D:\AttendSure_V3\mobile"
$excludeRegex = '[\\/](node_modules|\.expo|\.git|\.cache|build|dist)[\\/]'
$excludeFiles = @('package-lock.json', 'yarn.lock', 'pnpm-lock.yaml')

Write-Host "Scanning and sorting project files (excluding package-lock.json)..." -ForegroundColor Cyan

# 1. Collect all valid non-library source files
$files = Get-ChildItem -Path $target -Recurse -File -Force | Where-Object {
    ($_.FullName -notmatch $excludeRegex) -and ($excludeFiles -notcontains $_.Name)
}

$fileList = [System.Collections.Generic.List[PSCustomObject]]::new()
$folderSizes = @{}
$folderCounts = @{}

$totalFiles = 0
$totalLines = 0
$totalBytes = [long]0

$binaryExtensions = @('.png','.jpg','.jpeg','.gif','.ico','.webp','.ttf','.woff','.woff2','.eot','.bin','.exe','.dll','.so','.dylib','.zip','.tar','.gz','.apk','.jar')

foreach ($file in $files) {
    $totalFiles++
    $len = $file.Length
    $totalBytes += $len
    $dir = $file.DirectoryName
    $ext = $file.Extension.ToLower()

    # Track directory metrics
    $folderSizes[$dir] = ($folderSizes[$dir] -as [long]) + $len
    $folderCounts[$dir] = ($folderCounts[$dir] -as [int]) + 1

    # Count lines for code and text files
    $lines = 0
    if ($binaryExtensions -notcontains $ext) {
        try {
            $reader = [System.IO.File]::OpenText($file.FullName)
            while ($null -ne $reader.ReadLine()) { $lines++ }
            $reader.Close()
        } catch {
            $lines = 0
        }
    }
    $totalLines += $lines

    $sizeFormatted = if ($len -ge 1MB) {
        "{0:N2} MB" -f ($len / 1MB)
    } elseif ($len -ge 1KB) {
        "{0:N2} KB" -f ($len / 1KB)
    } else {
        "$len B"
    }

    $relativePath = $file.FullName.Replace("$target\", "")

    $fileList.Add([PSCustomObject]@{
        "File Path"    = $relativePath
        "Lines"        = [int]$lines
        "Size (Bytes)" = $len
        "Size"         = $sizeFormatted
    })
}

# 2. Sort files strictly by line count (ascending)
$sortedFiles = $fileList | Sort-Object -Property Lines

# 3. Collect folder metrics
$folderList = [System.Collections.Generic.List[PSCustomObject]]::new()
foreach ($dir in ($folderSizes.Keys | Sort-Object)) {
    $bytes = $folderSizes[$dir]
    $formatted = if ($bytes -ge 1MB) {
        "{0:N2} MB" -f ($bytes / 1MB)
    } elseif ($bytes -ge 1KB) {
        "{0:N2} KB" -f ($bytes / 1KB)
    } else {
        "$bytes B"
    }

    $folderList.Add([PSCustomObject]@{
        "Folder Path"  = $dir.Replace("$target\", "")
        "Files"        = $folderCounts[$dir]
        "Size (Bytes)" = $bytes
        "Size"         = $formatted
    })
}

# 4. Display tables
Write-Host "`n--- PROJECT FILES (FEWEST TO MOST LINES, NO LOCK FILES) ---" -ForegroundColor Yellow
$sortedFiles | Format-Table -AutoSize

Write-Host "--- FOLDER SIZES ---" -ForegroundColor Yellow
$folderList | Format-Table -AutoSize

Write-Host "===================== CLEAN SUMMARY =====================" -ForegroundColor Green
Write-Host "Total Files:       $totalFiles" -ForegroundColor White
Write-Host "Total Folders:     $($folderSizes.Count)" -ForegroundColor White
Write-Host "Total Code Lines:  $totalLines" -ForegroundColor White
Write-Host "Total Source Size: $("{0:N2} MB" -f ($totalBytes / 1MB)) ($totalBytes bytes)" -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Green

# 5. Export clean CSV reports
$csvFiles = Join-Path $target "mobile_clean_files.csv"
$csvFolders = Join-Path $target "mobile_clean_folders.csv"
$sortedFiles | Export-Csv -Path $csvFiles -NoTypeInformation -Encoding UTF8
$folderList | Export-Csv -Path $csvFolders -NoTypeInformation -Encoding UTF8