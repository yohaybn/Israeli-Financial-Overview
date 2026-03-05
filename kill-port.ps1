param (
    [int]$Port = 3000
)

$Process = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($Process) {
    Write-Host "Found process $($Process.OwningProcess) using port $Port. Terminating..." -ForegroundColor Cyan
    Stop-Process -Id $Process.OwningProcess -Force
    Write-Host "Successfully killed process on port $Port." -ForegroundColor Green
} else {
    Write-Host "No process found using port $Port." -ForegroundColor Yellow
}
