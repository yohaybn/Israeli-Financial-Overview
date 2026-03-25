# Restart Script for Financial Overview

Write-Host "Restarting Financial Overview..." -ForegroundColor Cyan
Write-Host ""

# Stop the application
& ".\stop.ps1"

Write-Host ""
Write-Host "Waiting 2 seconds before restart..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host ""
# Start the application
& ".\start.ps1"
