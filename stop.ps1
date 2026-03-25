# Stop Script for Financial Overview

Write-Host "Stopping Financial Overview..." -ForegroundColor Cyan

# Kill process on port 3000 (Client/Server)
$Process3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($Process3000) {
    Write-Host "Killing process $($Process3000.OwningProcess) on port 3000..." -ForegroundColor Yellow
    Stop-Process -Id $Process3000.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Successfully killed process on port 3000." -ForegroundColor Green
}
else {
    Write-Host "No process found on port 3000." -ForegroundColor Yellow
}

# Kill process on port 5173 (Vite client dev server)
$Process5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($Process5173) {
    Write-Host "Killing process $($Process5173.OwningProcess) on port 5173..." -ForegroundColor Yellow
    Stop-Process -Id $Process5173.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Successfully killed process on port 5173." -ForegroundColor Green
}
else {
    Write-Host "No process found on port 5173." -ForegroundColor Yellow
}

# Kill any remaining Node processes (fallback)
$NodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($NodeProcesses) {
    Write-Host "Killing remaining Node.js processes..." -ForegroundColor Yellow
    $NodeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "Successfully killed Node.js processes." -ForegroundColor Green
}
else {
    Write-Host "No Node.js processes found." -ForegroundColor Yellow
}

Write-Host "Financial Overview stopped." -ForegroundColor Green
