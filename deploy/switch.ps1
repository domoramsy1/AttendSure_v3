# AttendSure - Windows Zero-Downtime Deployment Switcher
# File: D:\AttendSure_V3\deploy\switch.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$ScriptDir\.."

$NginxConf = Join-Path $ScriptDir "nginx.conf"

if (-not (Test-Path $NginxConf)) {
    Write-Host "Error: nginx.conf not found at $NginxConf" -ForegroundColor Red
    Exit 1
}

$ConfContent = Get-Content $NginxConf -Raw
if ($ConfContent.Contains("web_blue:8001") -or $ConfContent.Contains("127.0.0.1:8001")) {
    $CurrentUpstream = if ($ConfContent.Contains("web_blue:8001")) { "web_blue:8001" } else { "127.0.0.1:8001" }
    $TargetUpstream  = if ($ConfContent.Contains("web_blue:8001")) { "web_green:8002" } else { "127.0.0.1:8002" }
    $CurrentPort     = "8001"
    $TargetColor     = "green"
    $TargetPort      = "8002"
} else {
    $CurrentUpstream = if ($ConfContent.Contains("web_green:8002")) { "web_green:8002" } else { "127.0.0.1:8002" }
    $TargetUpstream  = if ($ConfContent.Contains("web_green:8002")) { "web_blue:8001" } else { "127.0.0.1:8001" }
    $CurrentPort     = "8002"
    $TargetColor     = "blue"
    $TargetPort      = "8001"
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Active Port     : $CurrentPort ($CurrentUpstream)" -ForegroundColor Yellow
Write-Host "Deploying Target: web_$TargetColor on port $TargetPort" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan

docker compose build "web_$TargetColor"
docker compose up -d "web_$TargetColor"

Write-Host "Running migrations and static collection..." -ForegroundColor Gray
docker compose exec -T "web_$TargetColor" python manage.py migrate --noinput
docker compose exec -T "web_$TargetColor" python manage.py collectstatic --noinput

Write-Host "Checking health on http://127.0.0.1:$TargetPort/api/v1/health/db/..." -ForegroundColor Gray
$Healthy = $false

for ($Attempt = 1; $Attempt -le 12; $Attempt++) {
    Start-Sleep -Seconds 2
    try {
        $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$TargetPort/api/v1/health/db/" -UseBasicParsing -TimeoutSec 5
        if ($Response.StatusCode -eq 200) {
            $Healthy = $true
            break
        }
    } catch {
        Write-Host "Attempt $Attempt/12 waiting for web_$TargetColor..." -ForegroundColor DarkGray
    }
}

if (-not $Healthy) {
    Write-Host "Health check failed. Stopping web_$TargetColor and keeping traffic on $CurrentPort." -ForegroundColor Red
    docker compose stop "web_$TargetColor"
    Exit 1
}

# Literal string .Replace() avoids PowerShell regex backslash corruption
$UpdatedContent = $ConfContent.Replace($CurrentUpstream, $TargetUpstream)
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($NginxConf, $UpdatedContent, $Utf8NoBom)

docker compose up -d nginx
docker compose exec -T nginx nginx -s reload

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Traffic switched to web_$TargetColor (Port $TargetPort) with zero downtime!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
