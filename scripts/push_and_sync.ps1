# AttendSure V3 - Git Push, Auto-Tag Increment, & Local Mirror Script
param(
    [string]$CommitMessage = "Auto-sync update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$SourceDir = "D:\AttendSure_V3"
$TargetDir = "D:\ATTENDSURE SYSTEM"

Set-Location $SourceDir

Write-Host "--- Step 1: Pushing changes to GitHub ---" -ForegroundColor Cyan
git add .
git commit -m "$CommitMessage"
git push origin main

Write-Host "--- Step 2: Auto-incrementing Git Tag version ---" -ForegroundColor Cyan
git fetch --tags

# Get the latest semantic tag (e.g., v3.0.26)
$LatestTag = git describe --tags --abbrev=0 2>$null

if (-not $LatestTag) {
    $NewTag = "v3.0.1"
    Write-Host "No existing tags found. Creating initial tag: $NewTag" -ForegroundColor Yellow
} else {
    Write-Host "Latest tag found: $LatestTag" -ForegroundColor Green
    # Parse tag format vX.Y.Z and increment the patch version (+1)
    if ($LatestTag -match '^v(\d+)\.(\d+)\.(\d+)$') {
        $Major = [int]$Matches[1]
        $Minor = [int]$Matches[2]
        $Patch = [int]$Matches[3] + 1
        $NewTag = "v$Major.$Minor.$Patch"
    } else {
        $NewTag = "v3.0.27" # Fallback if tag structure differs
    }
}

Write-Host "Creating and pushing new version tag: $NewTag" -ForegroundColor Green
git tag $NewTag
git push origin main --tags

Write-Host "--- Step 3: Mirroring project to D:\ATTENDSURE SYSTEM ---" -ForegroundColor Cyan
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

robocopy $SourceDir $TargetDir /E /XD "$SourceDir\backend\venv" "$SourceDir\.git" /MT:8 /NFL /NDL

Write-Host "Sync, version bump ($NewTag), and GitHub push completed successfully!" -ForegroundColor Green