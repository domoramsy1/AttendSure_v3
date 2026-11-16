# AttendSure V3 - GitHub Push, Auto-Tag Increment & Full Version Backup Script
# File: D:\AttendSure_V3\scripts\push_and_sync.ps1

param(
    [string]$CommitMessage = "Auto-sync update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ErrorActionPreference = "Continue"
$SourceDir = "D:\AttendSure_V3"
$VersionBaseDir = "D:\ATTENDSURE SYSTEM\VERSION"

if (-not (Test-Path $SourceDir)) {
    Write-Host "Error: Source folder $SourceDir does not exist." -ForegroundColor Red
    exit 1
}

Set-Location $SourceDir

Write-Host "--- Step 1: Saving and pushing project changes to GitHub ---" -ForegroundColor Cyan
git add -A

$PendingChanges = git status --porcelain
if ($PendingChanges) {
    git commit -m "$CommitMessage"
} else {
    Write-Host "No new file changes to commit. Proceeding with branch push and version tagging..." -ForegroundColor Yellow
}

git push origin main

Write-Host "--- Step 2: Incrementing GitHub version tag ---" -ForegroundColor Cyan
git fetch --tags --force 2>$null

# Get the highest semantic version tag (e.g., v3.0.26)
$LatestTag = (git tag -l "v*" --sort=-v:refname | Select-Object -First 1)
if (-not $LatestTag) {
    $LatestTag = git describe --tags --abbrev=0 2>$null
}

if (-not $LatestTag) {
    $NewTag = "v3.0.1"
    Write-Host "No existing tags found. Starting at: $NewTag" -ForegroundColor Yellow
} else {
    $LatestTag = $LatestTag.Trim()
    Write-Host "Latest tag found: $LatestTag" -ForegroundColor Green

    if ($LatestTag -match '^v(\d+)\.(\d+)\.(\d+)$') {
        $Major = [int]$Matches[1]
        $Minor = [int]$Matches[2]
        $Patch = [int]$Matches[3] + 1
        $NewTag = "v$Major.$Minor.$Patch"
    } else {
        $NewTag = "v3.0.27"
    }
}

# Ensure we do not collide with an already existing tag
while ((git tag -l "$NewTag") -eq $NewTag) {
    if ($NewTag -match '^v(\d+)\.(\d+)\.(\d+)$') {
        $Major = [int]$Matches[1]
        $Minor = [int]$Matches[2]
        $Patch = [int]$Matches[3] + 1
        $NewTag = "v$Major.$Minor.$Patch"
    }
}

Write-Host "Creating and pushing new version tag: $NewTag" -ForegroundColor Green
git tag -a $NewTag -m "Release $NewTag - $CommitMessage"
git push origin main
git push origin $NewTag

Write-Host "--- Step 3: Backing up full project to $VersionBaseDir\$NewTag ---" -ForegroundColor Cyan
$TargetVersionDir = Join-Path $VersionBaseDir $NewTag

if (-not (Test-Path $TargetVersionDir)) {
    New-Item -ItemType Directory -Path $TargetVersionDir -Force | Out-Null
}

# Copy 100% of files and folders without ignoring anything
robocopy "$SourceDir" "$TargetVersionDir" /E /COPY:DAT /DCOPY:T /R:2 /W:1 /MT:16 /NP /NFL /NDL

if ($LASTEXITCODE -lt 8) {
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "1. GitHub Branch : main (Updated)" -ForegroundColor Green
    Write-Host "2. GitHub Tag    : $NewTag" -ForegroundColor Green
    Write-Host "3. Full Backup   : $TargetVersionDir" -ForegroundColor Green
    Write-Host "==================================================================" -ForegroundColor Green
} else {
    Write-Host "Warning: Robocopy finished with exit code $LASTEXITCODE. Check open files." -ForegroundColor Yellow
}