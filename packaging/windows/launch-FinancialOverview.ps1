# Financial Overview - production launcher (bundled Node, no global Node required)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$env:NODE_ENV = "production"
# PORT and dataDir: financial-overview.json (server reads it). OS env overrides JSON.
# If there is no JSON file yet (older installs), set DATA_DIR so behavior matches previous releases.
$cfgPath = Join-Path $root "financial-overview.json"
if (-not $env:DATA_DIR -and -not (Test-Path $cfgPath)) {
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

$cfg = $null
if (Test-Path $cfgPath) {
    try { $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json } catch { }
}
$displayPort = $env:PORT
if (-not $displayPort -and $null -ne $cfg -and $null -ne $cfg.port) { $displayPort = [string]$cfg.port }
if (-not $displayPort) { $displayPort = "3000" }
Write-Host "Financial Overview - http://127.0.0.1:$displayPort" -ForegroundColor Cyan
$displayDataDir = $env:DATA_DIR
if (-not $displayDataDir -and $null -ne $cfg -and $null -ne $cfg.dataDir) { $displayDataDir = [string]$cfg.dataDir }
if (-not $displayDataDir) { $displayDataDir = "(default ./data or set in financial-overview.json)" }
Write-Host "DATA_DIR: $displayDataDir" -ForegroundColor DarkGray
Write-Host 'Close this window to stop the server.' -ForegroundColor DarkGray
Write-Host ""

& $node $server
