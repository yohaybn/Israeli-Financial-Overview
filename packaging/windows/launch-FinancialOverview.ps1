# Financial Overview — production launcher (bundled Node, no global Node required)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$env:NODE_ENV = "production"
if (-not $env:PORT) { $env:PORT = "3000" }
if (-not $env:DATA_DIR) {
    $env:DATA_DIR = Join-Path $env:APPDATA "FinancialOverview\data"
}

$nodeDir = Join-Path $root "runtime\node"
if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
    Write-Host "Missing bundled Node.js under runtime\node. Re-run the Windows packaging script." -ForegroundColor Red
    exit 1
}

$node = Join-Path $nodeDir "node.exe"
$server = Join-Path $root "server\dist\index.js"
if (-not (Test-Path $server)) {
    Write-Host "Server build not found: $server" -ForegroundColor Red
    exit 1
}

Write-Host "Financial Overview — http://127.0.0.1:$($env:PORT)" -ForegroundColor Cyan
Write-Host "DATA_DIR: $($env:DATA_DIR)" -ForegroundColor DarkGray
Write-Host "Close this window to stop the server." -ForegroundColor DarkGray
Write-Host ""

& $node $server
