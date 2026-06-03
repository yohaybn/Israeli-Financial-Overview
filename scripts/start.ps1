# Startup Script for Financial Overview

Write-Host "Starting Financial Overview..." -ForegroundColor Cyan

# Check for node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Build shared if needed
if (-not (Test-Path "shared/dist")) {
    Write-Host "Building shared library..." -ForegroundColor Yellow
    npm run build -w shared
}

Write-Host "Cleaning Vite cache..." -ForegroundColor Yellow
if (Test-Path "client/node_modules/.vite") {
    Remove-Item -Path "client/node_modules/.vite" -Recurse -Force
}

Write-Host "Launching Client and Server..." -ForegroundColor Green
npm run dev
