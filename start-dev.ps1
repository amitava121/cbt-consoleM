# ============================================================
# CBT Examination System - Development Server Startup Script
# ============================================================
# Usage: Right-click this file -> "Run with PowerShell"
#   OR: Open PowerShell, navigate to project root, run: .\start-dev.ps1
# ============================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CBT Examination System - Dev Server  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Set Node.js path
$env:PATH = "C:\Program Files\nodejs;$env:PATH"

# Project root
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Kill any existing processes on our ports
Write-Host "[1/5] Cleaning up existing processes..." -ForegroundColor Yellow
@(3000, 5173, 5174) | ForEach-Object {
    $port = $_
    $procIds = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -ne 0 }
    foreach ($procId in $procIds) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "  Killed process on port $port (PID: $procId)" -ForegroundColor Gray
    }
}
Start-Sleep -Seconds 2

# Start Backend
Write-Host "[2/5] Starting Backend API (port 3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\back-end'; `$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; Write-Host 'Backend starting...' -ForegroundColor Green; npx tsx src/index.ts" -WindowStyle Normal
Start-Sleep -Seconds 4

# Start Exam Portal (Candidate Browser Client)
Write-Host "[3/5] Starting Exam Portal (port 5174)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\exam-portal'; `$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; Write-Host 'Exam Portal starting...' -ForegroundColor Green; npx vite --port 5174 --host" -WindowStyle Normal
Start-Sleep -Seconds 2

# Start Admin Panel
Write-Host "[4/5] Starting Admin Panel (port 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\admin-panel'; `$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; Write-Host 'Admin Panel starting...' -ForegroundColor Green; npx vite --port 5173 --host" -WindowStyle Normal
Start-Sleep -Seconds 2

# Summary
Write-Host ""
Write-Host "[5/5] All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SERVICES RUNNING:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend API:    http://localhost:3000" -ForegroundColor White
Write-Host "  Exam Portal:    http://localhost:5174" -ForegroundColor White
Write-Host "  Admin Panel:    http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LOGIN CREDENTIALS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Candidate:  ADM-001 / 01012000" -ForegroundColor White
Write-Host "  Admin:      admin@cbe.local / Admin@123" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PREREQUISITES (must be running):" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  PostgreSQL:  localhost:5432" -ForegroundColor White
Write-Host "  Redis:       localhost:6379" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit this window..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
