# ==============================================================================
# AttendSure V3 - Ultra-Fast Mobile Auditor (Zero Exclusions)
# Path: D:\AttendSure_V3\mobile\fast_count_mobile.ps1
# ==============================================================================

$target = "D:\AttendSure_V3\mobile"
$csvFiles = Join-Path $target "mobile_all_files_report.csv"
$csvFolders = Join-Path $target "mobile_all_folders_report.csv"

Write-Host "Scanning ALL files and folders (including node_modules)..." -ForegroundColor Cyan

$folderSizes = @{}
$folderCounts = @{}
$binaryExtensions = @('.png','.jpg','.jpeg','.gif','.ico','.webp','.ttf','.woff','.woff2','.eot','.bin','.exe','.dll','.so','.dylib','.zip','.tar','.gz','.apk','.jar','.lock')

# Fast stream writer directly to disk (prevents terminal freeze)
$fileWriter = [System.IO.StreamWriter]::new($csvFiles, $false, [System.Text.Encoding]::UTF8)
$fileWriter.WriteLine('"Folder Path","File Name","Lines","Size (Bytes)","Size Formatted"')

$totalFiles = 0
$totalLines = 0
$totalBytes = [long]0

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

# 1. Enumerate all files using fast .NET API
$files = [System.IO.Directory]::EnumerateFiles($target, "*", [System.IO.SearchOption]::AllDirectories)

foreach ($filePath in $files) {
    $totalFiles++
    $fileInfo = [System.IO.FileInfo]::new($filePath)
    $len = $fileInfo.Length
    $dir = $fileInfo.DirectoryName
    $ext = $fileInfo.Extension.ToLower()
    $name = $fileInfo.Name

    $totalBytes += $len

    # Track folder sizes in a single pass
    $folderSizes[$dir] = ($folderSizes[$dir] -as [long]) + $len
    $folderCounts[$dir] = ($folderCounts[$dir] -as [int]) + 1

    # Fast line count (skips binary lock/image files to avoid freezing)
    $lines = 0
    if ($binaryExtensions -notcontains $ext) {
        try {
            $reader = [System.IO.File]::OpenText($filePath)
            while ($null -ne $reader.ReadLine()) { $lines++ }
            $reader.Close()
        } catch {
            $lines = 0
        }
    }
    $totalLines += $lines

    # Format size string
    $sizeFormatted = if ($len -ge 1MB) {
        "{0:N2} MB" -f ($len / 1MB)
    } elseif ($len -ge 1KB) {
        "{0:N2} KB" -f ($len / 1KB)
    } else {
        "$len B"
    }

    # Write file row to CSV
    $fileWriter.WriteLine(('"{0}","{1}",{2},{3},"{4}"' -f $dir.Replace('"','""'), $name.Replace('"','""'), $lines, $len, $sizeFormatted))

    if ($totalFiles % 5000 -eq 0) {
        Write-Host "Processed $totalFiles files..." -ForegroundColor Yellow
    }
}

$fileWriter.Close()

# 2. Write Folder Summary to CSV
$folderWriter = [System.IO.StreamWriter]::new($csvFolders, $false, [System.Text.Encoding]::UTF8)
$folderWriter.WriteLine('"Folder Path","Total Files","Total Size (Bytes)","Size Formatted"')

foreach ($dir in $folderSizes.Keys) {
    $bytes = $folderSizes[$dir]
    $formatted = if ($bytes -ge 1MB) {
        "{0:N2} MB" -f ($bytes / 1MB)
    } elseif ($bytes -ge 1KB) {
        "{0:N2} KB" -f ($bytes / 1KB)
    } else {
        "$bytes B"
    }

    $folderWriter.WriteLine(('"{0}",{1},{2},"{3}"' -f $dir.Replace('"','""'), $folderCounts[$dir], $bytes, $formatted))
}

$folderWriter.Close()
$stopwatch.Stop()

# 3. Print Final Clean Totals
Write-Host "`n====================== SCAN COMPLETE ======================" -ForegroundColor Green
Write-Host "Total Files Scanned:   $totalFiles" -ForegroundColor White
Write-Host "Total Folders Scanned: $($folderSizes.Count)" -ForegroundColor White
Write-Host "Total Lines Counted:   $totalLines" -ForegroundColor White
Write-Host "Total Mobile Size:     $("{0:N2} MB" -f ($totalBytes / 1MB)) ($totalBytes bytes)" -ForegroundColor White
Write-Host "Time Elapsed:          $([math]::Round($stopwatch.Elapsed.TotalSeconds, 2)) seconds" -ForegroundColor White
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "1. Detailed file list saved to:   $csvFiles" -ForegroundColor Cyan
Write-Host "2. Detailed folder list saved to: $csvFolders" -ForegroundColor Cyan