param(
    [string]$CommitMessage = "Sync update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ErrorActionPreference = "Continue"
$SourceDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VersionBaseDir = "D:\ATTENDSURE SYSTEM\VERSION"

Set-Location $SourceDir

Write-Host "--- Step 1: Committing and pushing changes to GitHub (main) ---" -ForegroundColor Cyan
$CurrentBranch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
if ($CurrentBranch -ne "main") { git checkout main }

git add -A
if (git status --porcelain) {
    git commit -m "$CommitMessage"
} else {
    Write-Host "Working tree clean. Proceeding to version tag..." -ForegroundColor Yellow
}
git push origin main

Write-Host "--- Step 2: Incrementing semantic version tag ---" -ForegroundColor Cyan
git fetch --tags --force 2>$null
$LatestTag = (git tag -l "v*" --sort=-v:refname | Select-Object -First 1)
if ($LatestTag -and $LatestTag.Trim() -match '^v(\d+)\.(\d+)\.(\d+)$') {
    $NewTag = "v$($Matches[1]).$($Matches[2]).$([int]$Matches[3] + 1)"
} else {
    $NewTag = "v3.1.0"
}

while ((git tag -l "$NewTag") -eq $NewTag) {
    if ($NewTag -match '^v(\d+)\.(\d+)\.(\d+)$') {
        $NewTag = "v$($Matches[1]).$($Matches[2]).$([int]$Matches[3] + 1)"
    }
}

git tag -a $NewTag -m "Release $NewTag - $CommitMessage"
git push origin main --tags

Write-Host "--- Step 3: Saving clean source snapshot to $VersionBaseDir\$NewTag ---" -ForegroundColor Cyan
$TargetVersionDir = Join-Path $VersionBaseDir $NewTag
New-Item -ItemType Directory -Path $TargetVersionDir -Force | Out-Null

robocopy "$SourceDir" "$TargetVersionDir" /E /COPY:DAT /DCOPY:T /R:2 /W:1 /MT:16 `
    /XD "node_modules" "venv" ".venv" "__pycache__" ".expo" "dist" "_legacy_backup" "_archived_legacy" `
    /NP /NFL /NDL | Out-Null

Write-Host "SUCCESS: Pushed $NewTag and backed up source to $TargetVersionDir" -ForegroundColor Green