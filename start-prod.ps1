# ============================================================
# CBT Examination System - PRODUCTION Startup Script
# ============================================================
# Builds the frontends and serves them as static production
# bundles (no Vite dev server, no Google Fonts, works on LAN
# and fully offline).
#
# Usage: Right-click -> "Run with PowerShell"
#   OR:  .\start-prod.ps1
# ============================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CBT Examination System - PRODUCTION   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Node.js path
$env:PATH = "C:\Program Files\nodejs;$env:PATH"

# Project root
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Detect LAN IP
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch "^127\." -and $_.IPAddress -notmatch "^169\." } |
    Sort-Object -Property { $_.IPAddress -match "^10\." } -Descending |
    Select-Object -First 1).IPAddress
if (-not $lanIp) { $lanIp = "localhost" }

# ------------------------------------------------------------
# STEP 1: Clean up existing processes on our ports
# ------------------------------------------------------------
Write-Host "[1/6] Cleaning up existing processes..." -ForegroundColor Yellow
@(3000, 5173, 5174) | ForEach-Object {
    $port = $_
    $procIds = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -ne 0 }
    foreach ($procId in $procIds) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "  Freed port $port (PID: $procId)" -ForegroundColor Gray
    }
}
Start-Sleep -Seconds 2

# ------------------------------------------------------------
# STEP 2: Build Exam Portal
# ------------------------------------------------------------
Write-Host "[2/6] Building Exam Portal..." -ForegroundColor Yellow
Push-Location "$projectRoot\exam-portal"
if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
npx vite build 2>&1 | Out-Null
Pop-Location
Write-Host "  Exam Portal built." -ForegroundColor Gray

# ------------------------------------------------------------
# STEP 3: Build Admin Panel
# ------------------------------------------------------------
Write-Host "[3/6] Building Admin Panel..." -ForegroundColor Yellow
Push-Location "$projectRoot\admin-panel"
if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
npx vite build 2>&1 | Out-Null
Pop-Location
Write-Host "  Admin Panel built." -ForegroundColor Gray

# ------------------------------------------------------------
# STEP 4: Start Backend API
# ------------------------------------------------------------
Write-Host "[4/6] Starting Backend API (port 3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\back-end'; `$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; Write-Host 'Backend running on port 3000' -ForegroundColor Green; npx tsx src/index.ts" -WindowStyle Normal
Start-Sleep -Seconds 5

# ------------------------------------------------------------
# STEP 5: Serve Exam Portal (production static + API proxy)
# ------------------------------------------------------------
Write-Host "[5/6] Serving Exam Portal (port 5174)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\exam-portal'; `$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; Write-Host 'Exam Portal running on port 5174' -ForegroundColor Green; node serve.cjs" -WindowStyle Normal
Start-Sleep -Seconds 2

# ------------------------------------------------------------
# STEP 6: Serve Admin Panel (production static + API proxy)
# ------------------------------------------------------------
Write-Host "[6/6] Serving Admin Panel (port 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\admin-panel'; `$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; Write-Host 'Admin Panel running on port 5173' -ForegroundColor Green; node serve.cjs" -WindowStyle Normal
Start-Sleep -Seconds 2

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ALL SERVICES RUNNING (PRODUCTION)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  EXAM PORTAL (candidates):" -ForegroundColor White
Write-Host "    Local:   http://localhost:5174/examportal" -ForegroundColor White
Write-Host "    LAN:     http://${lanIp}:5174/examportal" -ForegroundColor Green
Write-Host ""
Write-Host "  ADMIN PANEL:" -ForegroundColor White
Write-Host "    Local:   http://localhost:5173" -ForegroundColor White
Write-Host "    LAN:     http://${lanIp}:5173" -ForegroundColor Green
Write-Host ""
Write-Host "  BACKEND API:  http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LOGIN CREDENTIALS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Candidate:  ADM-001 / 01012000" -ForegroundColor White
Write-Host "  Admin:      admin@cbe.local / Admin@123" -ForegroundColor White
Write-Host ""
Write-Host "  Give candidates this URL:" -ForegroundColor Yellow
Write-Host "    http://${lanIp}:5174/examportal" -ForegroundColor Yellow
Write-Host ""
Write-Host "  PREREQUISITES (must be running):" -ForegroundColor Cyan
Write-Host "    PostgreSQL:  localhost:5432" -ForegroundColor White
Write-Host "    Redis:       localhost:6379" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to close this window (services keep running)..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
