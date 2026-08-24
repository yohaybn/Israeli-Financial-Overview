# Stop Script for Financial Overview

Write-Host "Stopping Financial Overview..." -ForegroundColor Cyan

# Ports from single source of truth: scripts/ports.mjs (env -> data/config/runtime-settings.json -> defaults)
$portsRaw = node "$PSScriptRoot\ports.mjs"
$ServerPort, $ClientPort = ($portsRaw -split '\s+') | ForEach-Object { [int]$_ }
Write-Host "Using ports: server=$ServerPort client=$ClientPort" -ForegroundColor DarkGray

function Stop-Port([int]$Port, [string]$Label) {
    $Conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    $Proc = ($Conn | Where-Object { $_.State -eq 'Listen' } | Select-Object -First 1) ?? ($Conn | Where-Object { $_.OwningProcess -gt 0 } | Select-Object -First 1)
    if ($Proc -and $Proc.OwningProcess -gt 0) {
        Write-Host "Killing process $($Proc.OwningProcess) on port $Port ($Label)..." -ForegroundColor Yellow
        Stop-Process -Id $Proc.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "Successfully killed process on port $Port." -ForegroundColor Green
    }
    else {
        Write-Host "No process found on port $Port." -ForegroundColor Yellow
    }
}

Stop-Port $ServerPort "server"
Stop-Port $ClientPort "client (Vite dev server)"

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
