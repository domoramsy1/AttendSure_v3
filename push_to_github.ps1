$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $rootDir) { $rootDir = (Get-Location).Path }
Set-Location $rootDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "AttendSure V3 - Safe GitHub Deployment" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Unstage sensitive files
$sensitivePatterns = @(".env", "*.env", "backend/.env", "mobile/.env", "web/.env", "db.sqlite3", "*.sqlite3", "all_source_codes.txt", "project_files.txt", "*.keystore", "*.jks")
foreach ($pat in $sensitivePatterns) {
    git rm --cached -r -q --ignore-unmatch $pat 2>$null | Out-Null
}

# 2. Stage files
git add .

# 3. Check for file changes
$status = (git status --porcelain 2>$null)
if (-not $status) {
    Write-Host "No file changes detected. Exiting." -ForegroundColor Yellow
    exit 0
}

# 4. Commit and push
$defaultTag = "v3.0.14"
$tagInput = Read-Host "Release Tag (Press Enter for '$defaultTag')"
$finalTag = if ($tagInput -and $tagInput.Trim()) { $tagInput.Trim() } else { $defaultTag }

$defaultMsg = "Release $finalTag - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
$inputMsg = Read-Host "Commit message (Press Enter for '$defaultMsg')"
$commitMsg = if ($inputMsg -and $inputMsg.Trim()) { $inputMsg.Trim() } else { $defaultMsg }

git commit -m "$commitMsg"
git tag -a "$finalTag" -m "$commitMsg"
git push origin main
git push origin "$finalTag"

Write-Host "Done! Pushed $finalTag to GitHub." -ForegroundColor Green