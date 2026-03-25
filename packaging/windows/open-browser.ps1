# Open the app URL (PORT: env, then financial-overview.json, then 3000)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = $env:PORT
if (-not $port) {
    $cfgPath = Join-Path $root "financial-overview.json"
    if (Test-Path $cfgPath) {
        try {
            $j = Get-Content $cfgPath -Raw | ConvertFrom-Json
            if ($null -ne $j.port) { $port = [string]$j.port }
        } catch { }
    }
}
if (-not $port) { $port = "3000" }
Start-Process "http://127.0.0.1:$port/"
