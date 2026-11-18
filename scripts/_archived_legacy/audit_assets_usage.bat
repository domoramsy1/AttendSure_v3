@echo off
setlocal DisableDelayedExpansion

title ATTENDSURE - Image & Logo Usage Auditor
echo ================================================================================
echo      ATTENDSURE - Auditing web\public and web\src\assets Image Usage
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

$publicDir = Join-Path $root 'web\public'
$assetsDir = Join-Path $root 'web\src\assets'
$outFile   = Join-Path $scriptPath 'asset_usage_report.txt'

if (Test-Path -LiteralPath $outFile) {
    Remove-Item -LiteralPath $outFile -Force
}

# Collect all target asset files from both folders
$targetAssets = New-Object 'System.Collections.Generic.List[PSObject]'

if (Test-Path -LiteralPath $publicDir) {
    Get-ChildItem -LiteralPath $publicDir -File | Sort-Object Name | ForEach-Object {
        $targetAssets.Add([PSCustomObject]@{
            Folder   = 'web\public'
            Name     = $_.Name
            FullPath = $_.FullName
            SizeKB   = [Math]::Round($_.Length / 1024, 2)
        })
    }
}

if (Test-Path -LiteralPath $assetsDir) {
    Get-ChildItem -LiteralPath $assetsDir -File | Sort-Object Name | ForEach-Object {
        $targetAssets.Add([PSCustomObject]@{
            Folder   = 'web\src\assets'
            Name     = $_.Name
            FullPath = $_.FullName
            SizeKB   = [Math]::Round($_.Length / 1024, 2)
        })
    }
}

# Collect all searchable code/config files across the project
$skipDirs = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    '.git', 'node_modules', '.expo', '.next', 'dist', 'build', 'coverage',
    'venv', '.venv', 'env', '__pycache__', 'media', 'staticfiles', '_backup_monoliths'
) | ForEach-Object { [void]$skipDirs.Add($_) }

$codeExts = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@(
    '.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.json', '.py', '.md'
) | ForEach-Object { [void]$codeExts.Add($_) }

$codeFiles = New-Object 'System.Collections.Generic.List[System.IO.FileInfo]'

function Collect-CodeFiles([string]$dir) {
    $dInfo = New-Object System.IO.DirectoryInfo($dir)
    foreach ($f in $dInfo.GetFiles()) {
        if ($codeExts.Contains($f.Extension)) {
            $codeFiles.Add($f)
        }
    }
    foreach ($sub in $dInfo.GetDirectories()) {
        if (-not $skipDirs.Contains($sub.Name)) {
            Collect-CodeFiles $sub.FullName
        }
    }
}

Write-Host "Scanning project source files in: $root" -ForegroundColor Cyan
Collect-CodeFiles $root
Write-Host "Loaded $($codeFiles.Count) code/config files to inspect." -ForegroundColor Green

# Helper: Explains in plain English WHY a code file calls or imports an image
function Explain-Usage([string]$relFilePath, [string]$lineText, [string]$assetName) {
    $lowerPath = $relFilePath.ToLower()
    $lowerLine = $lineText.ToLower()

    if ($lowerPath -like '*index.html*') {
        return "Browser Tab Icon (Favicon) & HTML Metadata: Sets the initial icon shown in the browser tab before React finishes loading."
    }
    if ($lowerPath -like '*main.tsx*') {
        return "Dynamic Browser Tab Favicon Generator: Converts this SVG logo into a crisp circular PNG icon for browser tabs."
    }
    if ($lowerPath -like '*splashscreen.tsx*') {
        return "Startup Splash Screen Emblem: Displays the main AttendSure logo during the 7-second app startup screen."
    }
    if ($lowerPath -like '*authpage.tsx*') {
        return "Sign-In Page Brand Header: Shows the AttendSure logo next to the Welcome Back greeting on the login card."
    }
    if ($lowerPath -like '*attendsurebadge.tsx*') {
        return "AttendSure Circular Brand Badge: Renders the glowing circular AttendSure emblem component."
    }
    if ($lowerPath -like '*schooltenantbadge.tsx*') {
        return "Fallback School Seal: Used automatically if the school has not uploaded its own custom logo in Settings."
    }
    if ($lowerPath -like '*techblazersignature.tsx*') {
        return "Developer Signature Footer: Displays the TECHBLAZER creator brand mark at the bottom of screens."
    }
    if ($lowerPath -like '*app.json*' -or $lowerPath -like '*package.json*') {
        return "Mobile App Icon & Splash Manifest: Configures the home-screen app icon, adaptive Android icon, or native splash screen."
    }
    if ($lowerLine -match 'import\s+.*from') {
        return "Bundled ES Module Import: Imported directly into JavaScript/TypeScript so Vite bundles and optimizes it into the app."
    }
    if ($lowerLine -match 'require\(') {
        return "Metro Asset Require: Loaded as a static image asset by React Native / Expo."
    }
    if ($lowerLine -match 'onerror') {
        return "Fallback Safety Image: Loaded automatically if the primary image fails to load."
    }
    if ($lowerLine -match 'src\s*=') {
        return "Direct UI Image Display: Rendered directly inside an <img> tag on the screen."
    }
    return "Referenced in configuration or source code."
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$writer = New-Object System.IO.StreamWriter($outFile, $false, $utf8NoBom)

try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $writer.WriteLine("================================================================================")
    $writer.WriteLine("ATTENDSURE - DETAILED IMAGE & LOGO USAGE AUDIT REPORT")
    $writer.WriteLine("Generated   : $timestamp")
    $writer.WriteLine("Project Root: $root")
    $writer.WriteLine("Folders     : web\public  &  web\src\assets")
    $writer.WriteLine("================================================================================")
    $writer.WriteLine("")

    $unusedList = New-Object 'System.Collections.Generic.List[string]'
    $heavyList  = New-Object 'System.Collections.Generic.List[string]'

    foreach ($asset in $targetAssets) {
        $escapedName = [Regex]::Escape($asset.Name)
        $matchesFound = New-Object 'System.Collections.Generic.List[PSObject]'

        foreach ($cf in $codeFiles) {
            # Avoid matching inside the audit report itself
            if ($cf.FullName -eq $outFile) { continue }

            $lines = [System.IO.File]::ReadAllLines($cf.FullName, [System.Text.Encoding]::UTF8)
            $matchedLines = New-Object 'System.Collections.Generic.List[PSObject]'

            for ($i = 0; $i -lt $lines.Length; $i++) {
                if ($lines[$i] -match $escapedName) {
                    $matchedLines.Add([PSCustomObject]@{
                        LineNum  = $i + 1
                        CodeLine = $lines[$i].Trim()
                    })
                }
            }

            if ($matchedLines.Count -gt 0) {
                $relPath = $cf.FullName.Substring($root.Length).TrimStart('\', '/')
                $matchesFound.Add([PSCustomObject]@{
                    RelPath      = $relPath
                    FullPath     = $cf.FullName
                    MatchedLines = $matchedLines
                })
            }
        }

        $fileCount = $matchesFound.Count
        if ($fileCount -eq 0) {
            $unusedList.Add("$($asset.Folder)\$($asset.Name) ($($asset.SizeKB) KB)")
        }
        if ($asset.SizeKB -gt 200) {
            $heavyList.Add("$($asset.Folder)\$($asset.Name) ($($asset.SizeKB) KB)")
        }

        $writer.WriteLine("================================================================================")
        $writer.WriteLine("IMAGE FILE  : $($asset.Name)")
        $writer.WriteLine("Location    : $($asset.Folder)\$($asset.Name)")
        $writer.WriteLine("File Size   : $($asset.SizeKB) KB")
        $writer.WriteLine("Used In     : $fileCount file(s)")
        $writer.WriteLine("--------------------------------------------------------------------------------")

        if ($fileCount -eq 0) {
            $writer.WriteLine("STATUS      : UNUSED IN WEB CODEBASE")
            $writer.WriteLine("EXPLANATION : No code file in web/ imports or references this file.")
            if ($asset.Name -match '^(adaptive-icon|icon|splash)\.png$') {
                $writer.WriteLine("NOTE        : This filename is a standard Expo/Mobile icon asset (likely copied from mobile/assets/). It is not needed inside web\public unless referenced.")
            }
        } else {
            $idx = 1
            foreach ($m in $matchesFound) {
                $firstCode = $m.MatchedLines[0].CodeLine
                $purpose = Explain-Usage $m.RelPath $firstCode $asset.Name

                $writer.WriteLine("  [$idx] File Path : $($m.RelPath)")
                $writer.WriteLine("      Why Used  : $purpose")
                foreach ($ml in $m.MatchedLines) {
                    $snippet = if ($ml.CodeLine.Length -gt 110) { $ml.CodeLine.Substring(0, 107) + "..." } else { $ml.CodeLine }
                    $writer.WriteLine("      Line $($ml.LineNum.ToString().PadLeft(3, '0'))  : $snippet")
                }
                $writer.WriteLine("")
                $idx++
            }
        }
        $writer.WriteLine("")
    }

    # Summary & Cleanup Recommendations
    $writer.WriteLine("================================================================================")
    $writer.WriteLine("SUMMARY & OPTIMIZATION RECOMMENDATIONS")
    $writer.WriteLine("================================================================================")
    $writer.WriteLine("Total Assets Checked : $($targetAssets.Count)")
    $writer.WriteLine("Unused Assets Count  : $($unusedList.Count)")
    foreach ($u in $unusedList) {
        $writer.WriteLine("  - UNUSED : $u")
    }
    $writer.WriteLine("")
    $writer.WriteLine("Large Files (> 200 KB) That Slow Down Page Loading:")
    foreach ($h in $heavyList) {
        $writer.WriteLine("  - HEAVY  : $h")
    }
    $writer.WriteLine("================================================================================")
} finally {
    $writer.Close()
}

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Green
Write-Host "Audit complete! Detailed report saved to:" -ForegroundColor Green
Write-Host $outFile -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Green