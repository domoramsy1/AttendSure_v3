$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $rootDir) { $rootDir = (Get-Location).Path }
Set-Location $rootDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "AttendSure V3 - Safe GitHub Deployment" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Enforce strict security rules in .gitignore
$gitIgnorePath = Join-Path $rootDir ".gitignore"
$requiredIgnores = @(
    ".env", ".env.*", "*.env", "**/.env", "backend/.env", "mobile/.env", "web/.env",
    "db.sqlite3", "*.sqlite3", "*.db", "all_source_codes.txt", "project_files.txt",
    "*.keystore", "*.jks", "*.pem", "*.key", "*.p12", "*.pfx",
    "google-services.json", "GoogleService-Info.plist",
    "node_modules/", "__pycache__/", "*.pyc", "venv/", "env/", ".venv/",
    "dist/", "build/", ".expo/", ".vscode/", "*.log"
)

$existingRules = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
if (Test-Path $gitIgnorePath) {
    Get-Content $gitIgnorePath | ForEach-Object {
        $trimmed = $_.Trim()
        if ($trimmed) { [void]$existingRules.Add($trimmed) }
    }
}

$missingRules = @($requiredIgnores | Where-Object { -not $existingRules.Contains($_) })

if (-not (Test-Path $gitIgnorePath)) {
    $requiredIgnores | Out-File -FilePath $gitIgnorePath -Encoding utf8
    Write-Host "Created .gitignore with security rules." -ForegroundColor Green
} elseif ($missingRules.Count -gt 0) {
    Add-Content -Path $gitIgnorePath -Value ("`n" + ($missingRules -join "`n")) -Encoding utf8
    Write-Host "Added $($missingRules.Count) security rules to .gitignore." -ForegroundColor Green
}

# 2. Check Git repository status
git rev-parse --is-inside-work-tree 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    git init | Out-Null
    git branch -M main | Out-Null
}

$userName = (git config user.name 2>$null)
$userEmail = (git config user.email 2>$null)
if (-not $userName) { git config user.name "Ramsy Domo" }
if (-not $userEmail) { git config user.email "ramsy.domo@attendsure.local" }

# 3. Unstage sensitive files from git tracking
$sensitivePatterns = @(".env", "*.env", "backend/.env", "mobile/.env", "web/.env", "db.sqlite3", "*.sqlite3", "all_source_codes.txt", "project_files.txt", "*.keystore", "*.jks")
foreach ($pat in $sensitivePatterns) {
    git rm --cached -r -q --ignore-unmatch $pat 2>$null | Out-Null
}

# 4. Stage project files
Write-Host "`nStaging project files..." -ForegroundColor Cyan
git add .

$stagedFiles = (git diff --name-only --cached 2>$null) -split "`r?`n"
$leaks = @($stagedFiles | Where-Object {
    $_ -match '(\.env\vert{}\.sqlite3\vert{}all_source_codes\.txt\vert{}\.keystore\vert{}\.jks\vert{}\.key\vert{}\.pem)$'
})

if ($leaks.Count -gt 0) {
    Write-Host "`n[SECURITY ALERT] Sensitive files blocked from upload:" -ForegroundColor Red
    foreach ($leak in $leaks) {
        Write-Host " - $leak" -ForegroundColor Yellow
        git reset HEAD $leak 2>$null | Out-Null
    }
    Write-Host "Sensitive files unstaged safely." -ForegroundColor Green
}

# 5. Remote repository check
$defaultRepoUrl = "https://github.com/domoramsy1/AttendSure_v3.git"
$remotes = (git remote 2>$null) -split "`r?`n"

if (-not $remotes -or -not ($remotes -contains "origin")) {
    $inputUrl = Read-Host "`nEnter GitHub Repo URL (Press Enter for '$defaultRepoUrl')"
    $repoUrl = if ($inputUrl -and$inputUrl.Trim()) { $inputUrl.Trim() } else {$defaultRepoUrl }
    git remote add origin $repoUrl
    Write-Host "Connected remote: $repoUrl" -ForegroundColor Green
} else {
    $originUrl = (git remote get-url origin 2>$null)
    Write-Host "Remote repository: $originUrl" -ForegroundColor Gray
}

# 6. AUTOMATIC TAG INCREMENT (+0.0.1 calculation)
Write-Host "`nFetching latest tags from GitHub..." -ForegroundColor Cyan
git fetch --tags -q origin 2>$null

$rawTags = (git tag -l 2>$null) -split "`r?`n"
$parsedTags = @()

foreach ($t in $rawTags) {
    $clean = $t.Trim().TrimStart('v', 'V')
    if ($clean -match '^(\d+)\.(\d+)\.(\d+)$') {
        $parsedTags += [PSCustomObject]@{
            Major = [int]$matches[1]
            Minor = [int]$matches[2]
            Patch = [int]$matches[3]
            Raw   = $t.Trim()
        }
    }
}

if ($parsedTags.Count -gt 0) {
    $sorted = $parsedTags | Sort-Object Major, Minor, Patch
    $latest = $sorted[-1]
    $nextPatch = $latest.Patch + 1
    $suggestedTag = "v$($latest.Major).$($latest.Minor).$nextPatch"
    Write-Host "Latest Tag Found : $($latest.Raw)" -ForegroundColor Yellow
    Write-Host "Next Auto Tag    : $suggestedTag" -ForegroundColor Green
} else {
    $suggestedTag = "v3.0.15"
    Write-Host "No valid tags found. Starting at: $suggestedTag" -ForegroundColor Green
}

$tagInput = Read-Host "`nRelease Tag (Press Enter to use '$suggestedTag')"
$finalTag = if ($tagInput -and$tagInput.Trim()) { $tagInput.Trim() } else {$suggestedTag }

# 7. Check if there are uncommitted changes
$status = (git status --porcelain 2>$null)
$branch = (git branch --show-current 2>$null)
if (-not $branch -or -not $branch.Trim()) {$branch = "main"
    git branch -M main | Out-Null
} else {
    $branch =$branch.Trim()
}

if ($status) {$nowStr = (Get-Date -Format "yyyy-MM-dd HH:mm")
    $defaultMsg = "Release $finalTag -$nowStr"
    $inputMsg = Read-Host "Commit message (Press Enter for '$defaultMsg')"
    $commitMsg = if ($inputMsg -and$inputMsg.Trim()) { $inputMsg.Trim() } else {$defaultMsg }

    Write-Host "`nCommitting changes..." -ForegroundColor Cyan
    git commit -m "$commitMsg"

    Write-Host "Pushing code to branch '$branch' on GitHub..." -ForegroundColor Cyan
    git push -u origin $branch
} else {
    Write-Host "`nWorking tree clean (files already committed)." -ForegroundColor Gray
}

# 8. Create and push the release tag
Write-Host "Creating release tag '$finalTag'..." -ForegroundColor Cyan
git tag -a "$finalTag" -m "Release $finalTag"

Write-Host "Pushing tag '$finalTag' to GitHub..." -ForegroundColor Cyan
git push origin "$finalTag"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSuccess! Release tag '$finalTag' pushed to GitHub." -ForegroundColor Green
    Write-Host "Release URL: https://github.com/domoramsy1/AttendSure_v3/releases/tag/$finalTag" -ForegroundColor Cyan
} else {
    Write-Host "`nPush failed. Check your internet connection or GitHub personal access token." -ForegroundColor Red
}