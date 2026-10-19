# AttendSure V3 - Safe GitHub Deployment Script
# Location: D:\AttendSure_V3\push_to_github.ps1

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = "D:\AttendSure_V3" }
Set-Location $rootDir

# ---------------------------------------------------------------------------
# 1. CYBERSECURITY CHECK: PROTECT SENSITIVE FILES
# ---------------------------------------------------------------------------
$gitignorePath = Join-Path $rootDir ".gitignore"

# Ensure critical sensitive files are protected from being published online
$requiredIgnores = @(
    ".env",
    "*.env",
    "db.sqlite3",
    "node_modules/",
    "__pycache__/",
    "venv/",
    ".venv/",
    "dist/",
    "build/",
    ".expo/",
    "project_files.txt"
)

if (-not (Test-Path $gitignorePath)) {
    Write-Host "[SECURITY] .gitignore missing. Creating a secure default..." -ForegroundColor Yellow
    $requiredIgnores | Set-Content -Path $gitignorePath -Encoding UTF8
} else {
    $existing = Get-Content $gitignorePath
    $missing = $requiredIgnores | Where-Object { $existing -notcontains $_ }
    if ($missing) {
        Write-Host "[SECURITY] Adding missing protection rules to .gitignore..." -ForegroundColor Yellow
        $missing | Add-Content -Path $gitignorePath -Encoding UTF8
    }
}

# ---------------------------------------------------------------------------
# 2. GIT REPOSITORY VERIFICATION
# ---------------------------------------------------------------------------
$isRepo = git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Initializing new Git repository..." -ForegroundColor Cyan
    git init
    git branch -M main
}

# ---------------------------------------------------------------------------
# 3. GET COMMIT DETAILS
# ---------------------------------------------------------------------------
$branch = (git branch --show-current).Trim()
if (-not $branch) { $branch = "main" }

$defaultMessage = "AttendSure V3 Update - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
$commitMsg = Read-Host "Enter commit message (Press Enter for: '$defaultMessage')"
if ([string]::IsNullOrWhiteSpace($commitMsg)) {
    $commitMsg = $defaultMessage
}

# ---------------------------------------------------------------------------
# 4. STAGE, COMMIT, AND PUSH
# ---------------------------------------------------------------------------
Write-Host "`nStaging files (sensitive data excluded)..." -ForegroundColor Cyan
git add .

$status = git status --porcelain
if (-not $status) {
    Write-Host "No new changes to commit. Everything is up to date." -ForegroundColor Green
    exit 0
}

Write-Host "Creating commit..." -ForegroundColor Cyan
git commit -m "$commitMsg"

# Check if a remote origin exists
$remotes = git remote
if (-not $remotes) {
    Write-Host "`nNo GitHub remote found!" -ForegroundColor Yellow
    $repoUrl = Read-Host "https://github.com/domoramsy1/AttendSure_v3"
    if ([string]::IsNullOrWhiteSpace($repoUrl)) {
        Write-Host "Push cancelled: No remote repository provided." -ForegroundColor Red
        exit 1
    }
    git remote add origin $repoUrl
}

Write-Host "`nPushing code to GitHub branch '$branch'..." -ForegroundColor Cyan
git push -u origin $branch

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSuccessfully pushed your project to GitHub!" -ForegroundColor Green
} else {
    Write-Host "`nPush failed. Check your internet connection or GitHub access token / credentials." -ForegroundColor Red
}