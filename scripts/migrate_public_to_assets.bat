@echo off
setlocal DisableDelayedExpansion

title ATTENDSURE - Move Public Images to Assets & Refactor Imports
echo ================================================================================
echo   ATTENDSURE - Moving web\public Images to web\src\assets (No Duplicates)
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

$webDir    = Join-Path $root 'web'
$publicDir = Join-Path $webDir 'public'
$assetsDir = Join-Path $webDir 'src\assets'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $assetsDir)) {
    New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
}

# 1. Move all image files from web\public to web\src\assets without duplicates
Write-Host "[1/4] Moving images from web\public to web\src\assets (deduplicating)..." -ForegroundColor Cyan
$imageExts = @('.png', '.svg', '.jpg', '.jpeg', '.webp', '.ico')

if (Test-Path -LiteralPath $publicDir) {
    $publicImages = Get-ChildItem -LiteralPath $publicDir -File | Where-Object {
        $imageExts -contains $_.Extension.ToLower()
    }

    foreach ($img in $publicImages) {
        $destFile = Join-Path $assetsDir $img.Name
        if (Test-Path -LiteralPath $destFile) {
            # Duplicate exists in assets: remove the redundant copy in public
            Remove-Item -LiteralPath $img.FullName -Force
            Write-Host "  - Removed duplicate in public : $($img.Name) (kept existing in src\assets)" -ForegroundColor Yellow
        } else {
            Move-Item -LiteralPath $img.FullName -Destination $destFile -Force
            Write-Host "  - Moved to src\assets         : $($img.Name)" -ForegroundColor Green
        }
    }
}

# 2. Update web\index.html favicon so it no longer depends on /splash.svg in public/
Write-Host ""
Write-Host "[2/4] Updating web\index.html favicon reference..." -ForegroundColor Cyan
$indexHtmlPath = Join-Path $webDir 'index.html'
if (Test-Path -LiteralPath $indexHtmlPath) {
    $htmlContent = [System.IO.File]::ReadAllText($indexHtmlPath, [System.Text.Encoding]::UTF8)
    $inlineSvgFavicon = 'data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' viewBox=''0 0 64 64''%3E%3Cpath d=''M32 8L12 52h10.5L32 30.5 41.5 52H52L32 8z'' fill=''%23004b87''/%3E%3Crect x=''14'' y=''42'' width=''36'' height=''10'' rx=''3'' fill=''%23004b87''/%3E%3C/svg%3E'
    if ($htmlContent -match 'href="/splash\.svg"') {
        $htmlContent = $htmlContent -replace 'href="/splash\.svg"', "href=`"$inlineSvgFavicon`""
        [System.IO.File]::WriteAllText($indexHtmlPath, $htmlContent, $utf8NoBom)
        Write-Host "  - Updated web\index.html favicon to self-contained inline SVG" -ForegroundColor Green
    }
}

# 3. Refactor branding & UI files to import the new centralized BrandAssets components
Write-Host ""
Write-Host "[3/4] Replacing hardcoded /splash.svg and /techblazer.svg references with BrandAssets components..." -ForegroundColor Cyan

# 3a. Update web\src\components\branding\AttendSureBadge.tsx
$badgeFile = Join-Path $webDir 'src\components\branding\AttendSureBadge.tsx'
if (Test-Path -LiteralPath $badgeFile) {
    $badgeCode = @'
import React from 'react';
import { AttendSureLogoAsset } from './BrandAssets';

interface AttendSureBadgeProps {
  size?: number;
  animate?: boolean;
}

export const AttendSureBadge: React.FC<AttendSureBadgeProps> = ({
  size = 96,
  animate = false,
}) => {
  const iconSize = Math.round(size * 0.58);

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: '#0284c7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 10px 25px -4px rgba(2, 132, 199, 0.38), 0 4px 10px -2px rgba(2, 132, 199, 0.2)',
        animation: animate ? 'attendsure-breathe 2.4s ease-in-out infinite' : 'none',
        flexShrink: 0,
      }}
    >
      <AttendSureLogoAsset
        size={iconSize}
        alt="AttendSure"
        style={{ filter: 'brightness(0) invert(1)' }}
      />
      <style>{`
        @keyframes attendsure-breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.04); opacity: 0.94; }
        }
      `}</style>
    </div>
  );
};

export default AttendSureBadge;
'@
    [System.IO.File]::WriteAllText($badgeFile, $badgeCode, $utf8NoBom)
    Write-Host "  - Updated AttendSureBadge.tsx -> uses <AttendSureLogoAsset />" -ForegroundColor Green
}

# 3b. Update web\src\components\branding\TechBlazerSignature.tsx
$tbFile = Join-Path $webDir 'src\components\branding\TechBlazerSignature.tsx'
if (Test-Path -LiteralPath $tbFile) {
    $tbCode = @'
import React from 'react';
import { TechBlazerLogoAsset } from './BrandAssets';

interface TechBlazerSignatureProps {
  size?: number;
  textColor?: string;
  className?: string;
}

export const TechBlazerSignature: React.FC<TechBlazerSignatureProps> = ({
  size = 20,
  textColor = '#0A1F3D',
  className = '',
}) => {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '0.74rem',
          color: '#8a8d91',
          letterSpacing: '0.04em',
          fontWeight: 500,
          textTransform: 'lowercase',
        }}
      >
        from
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TechBlazerLogoAsset size={size} alt="TECHBLAZER" />
        <span
          style={{
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: `${size * 0.95}px`,
            fontWeight: 800,
            color: textColor,
            letterSpacing: '0.10em',
          }}
        >
          TECHBLAZER
        </span>
      </div>
    </div>
  );
};

export default TechBlazerSignature;
'@
    [System.IO.File]::WriteAllText($tbFile, $tbCode, $utf8NoBom)
    Write-Host "  - Updated TechBlazerSignature.tsx -> uses <TechBlazerLogoAsset />" -ForegroundColor Green
}

# 3c. Update web\src\components\branding\SchoolTenantBadge.tsx
$tenantFile = Join-Path $webDir 'src\components\branding\SchoolTenantBadge.tsx'
if (Test-Path -LiteralPath $tenantFile) {
    $tenantCode = @'
import React from 'react';
import { useSchool } from '../../context/SchoolContext';
import { BRAND_ASSETS } from './BrandAssets';

export const SchoolTenantBadge: React.FC = () => {
  const { school } = useSchool();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 14px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '999px',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
      }}
    >
      <img
        src={school.school_logo || BRAND_ASSETS.attendsureLogo}
        alt="School Seal"
        width={26}
        height={26}
        onError={(e) => {
          (e.target as HTMLImageElement).src = BRAND_ASSETS.attendsureLogo;
        }}
        style={{ objectFit: 'contain', borderRadius: '50%' }}
      />
      <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0A1F3D' }}>
        {school.school_name || 'Macasandig National High School'}
      </span>
      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
        • {school.division ? `Division of ${school.division}` : 'DepEd Region X'}
      </span>
    </div>
  );
};

export default SchoolTenantBadge;
'@
    [System.IO.File]::WriteAllText($tenantFile, $tenantCode, $utf8NoBom)
    Write-Host "  - Updated SchoolTenantBadge.tsx -> uses BRAND_ASSETS.attendsureLogo" -ForegroundColor Green
}

# 3d. Update web\src\components\auth\AuthPage.tsx to replace <img src="/splash.svg" ... />
$authFile = Join-Path $webDir 'src\components\auth\AuthPage.tsx'
if (Test-Path -LiteralPath $authFile) {
    $authContent = [System.IO.File]::ReadAllText($authFile, [System.Text.Encoding]::UTF8)
    if ($authContent -match '/splash\.svg') {
        if ($authContent -notmatch 'AttendSureLogoAsset') {
            $authContent = $authContent -replace "(import \{ isSafeImageUrl, type ThemeMode \} from '../../theme/tokens';)", "`$1`r`nimport { AttendSureLogoAsset } from '../branding/BrandAssets';"
        }
        $authContent = $authContent -replace '<img\s+src="/splash\.svg"\s+alt="AttendSure"\s+style=\{\{\s*width:\s*22,\s*height:\s*22\s*\}\}\s*/>', '<AttendSureLogoAsset size={22} alt="AttendSure" />'
        [System.IO.File]::WriteAllText($authFile, $authContent, $utf8NoBom)
        Write-Host "  - Updated AuthPage.tsx -> uses <AttendSureLogoAsset size={22} />" -ForegroundColor Green
    }
}

# 3e. Update web\src\components\splash\SplashScreen.tsx to use AttendSureLogoAsset
$splashFile = Join-Path $webDir 'src\components\splash\SplashScreen.tsx'
if (Test-Path -LiteralPath $splashFile) {
    $splashContent = [System.IO.File]::ReadAllText($splashFile, [System.Text.Encoding]::UTF8)
    if ($splashContent -match 'attendsure-logo\.svg' -or $splashContent -match '/splash\.svg') {
        $splashContent = $splashContent -replace "import appLogoSrc from '\.\./\.\./assets/attendsure-logo\.svg';", "import { BRAND_ASSETS } from '../branding/BrandAssets';"
        $splashContent = $splashContent -replace 'src=\{appLogoSrc\}', 'src={BRAND_ASSETS.attendsureLogo}'
        [System.IO.File]::WriteAllText($splashFile, $splashContent, $utf8NoBom)
        Write-Host "  - Updated SplashScreen.tsx -> uses BRAND_ASSETS.attendsureLogo" -ForegroundColor Green
    }
}

# 3f. Update web\src\main.tsx to use BRAND_ASSETS.attendsureLogo
$mainFile = Join-Path $webDir 'src\main.tsx'
if (Test-Path -LiteralPath $mainFile) {
    $mainContent = [System.IO.File]::ReadAllText($mainFile, [System.Text.Encoding]::UTF8)
    if ($mainContent -match '\./assets/attendsure-logo\.svg') {
        $mainContent = $mainContent -replace "import appLogoSrc from '\./assets/attendsure-logo\.svg';", "import { BRAND_ASSETS } from './components/branding/BrandAssets';"
        $mainContent = $mainContent -replace 'img\.src = appLogoSrc;', 'img.src = BRAND_ASSETS.attendsureLogo;'
        [System.IO.File]::WriteAllText($mainFile, $mainContent, $utf8NoBom)
        Write-Host "  - Updated main.tsx -> uses BRAND_ASSETS.attendsureLogo" -ForegroundColor Green
    }
}

# 4. Run TypeScript & Vite build check to confirm zero errors
Write-Host ""
Write-Host "[4/4] Verifying TypeScript & Production Build (npm run build)..." -ForegroundColor Cyan
Push-Location $webDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Build reported errors. Review the output above."
    }
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Green
    Write-Host "SUCCESS! All images moved to web\src\assets (0 duplicates), components created," -ForegroundColor Green
    Write-Host "references updated, and npm run build passed with 0 errors!" -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Green
} finally {
    Pop-Location
}