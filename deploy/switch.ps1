# AttendSure - Windows 10 Zero-Downtime Deployment Switcher
# File: D:\AttendSure_V3\deploy\switch.ps1

$ErrorActionPreference = "Stop"

# Navigate to project root (one folder up from deploy)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$ScriptDir\.."

$NginxConf = "$ScriptDir\nginx.conf"

if (-not (Test-Path $NginxConf)) {
    Write-Host "Error: nginx.conf not found at $NginxConf" -ForegroundColor Red
    Exit 1
}

# 1. Determine currently active upstream port
$ConfContent = Get-Content $NginxConf -Raw
if ($ConfContent -match "127\.0\.0\.1:8001") {
    $CurrentPort = "8001"
    $TargetColor = "green"
    $TargetPort = "8002"
} else {
    $CurrentPort = "8002"
    $TargetColor = "blue"
    $TargetPort = "8001"
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Active Port   : $CurrentPort" -ForegroundColor Yellow
Write-Host "Deploying Target: web_$TargetColor on port $TargetPort" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan

# 2. Build and boot the idle container in Docker Desktop
Write-Host "Building and launching container web_$TargetColor..." -ForegroundColor Gray
docker compose build "web_$TargetColor"
docker compose up -d "web_$TargetColor"

# 3. Health check verification before switching
Write-Host "Verifying container health on http://127.0.0.1:$TargetPort..." -ForegroundColor Gray
Start-Sleep -Seconds 4

try {
    $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$TargetPort/api/settings/school/" -UseBasicParsing -TimeoutSec 5
    if ($Response.StatusCode -ne 200) {
        throw "Target returned HTTP status $($Response.StatusCode)"
    }
    Write-Host "Health check passed (HTTP 200 OK)." -ForegroundColor Green
} catch {
    Write-Host "Health check failed: $_. Aborting traffic swap." -ForegroundColor Red
    Exit 1
}

# 4. Swap upstream configuration
$UpdatedContent = $ConfContent -replace "127\.0\.0\.1:$CurrentPort", "127\.0\.0\.1:$TargetPort"
Set-Content -Path $NginxConf -Value $UpdatedContent

# 5. Reload Nginx container without downtime
docker compose exec nginx nginx -s reload

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Traffic successfully routed to $TargetColor (Port $TargetPort)!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan