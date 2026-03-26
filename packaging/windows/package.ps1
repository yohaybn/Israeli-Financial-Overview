# Build a Windows deployable folder under dist/windows-package (mirrors Docker production layout + bundled Node).
# Run from repo root:  powershell -ExecutionPolicy Bypass -File packaging/windows/package.ps1
# Requires: Windows x64, Node 20+ for the build (users of the package do not need Node installed).

param(
    [string]$NodeVersion = "20.18.3",
    [switch]$SkipNodeDownload
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Stage = Join-Path $RepoRoot "dist\windows-package"
$PackagingWindows = $PSScriptRoot

function Assert-RobocopyOk {
    param([int]$code)
    if ($code -ge 8) { throw "robocopy failed with exit code $code" }
}

Write-Host "Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host "Stage: $Stage" -ForegroundColor Cyan

Push-Location $RepoRoot
try {
    # Avoid Puppeteer browser download during packaging (large; scraper falls back to Chrome/Edge on the machine).
    if (-not $env:PUPPETEER_SKIP_DOWNLOAD) {
        $env:PUPPETEER_SKIP_DOWNLOAD = "true"
    }

    if ($env:CI -eq "true") {
        Write-Host "`n[1/5] npm ci (CI mode) ..." -ForegroundColor Yellow
        npm ci
    } else {
        Write-Host "`n[1/5] npm install ..." -ForegroundColor Yellow
        npm install
    }

    Write-Host "`n[2/5] Build workspaces ..." -ForegroundColor Yellow
    npm run build -w shared
    if ($LASTEXITCODE -ne 0) { throw "shared build failed" }
    npm run build -w client
    if ($LASTEXITCODE -ne 0) { throw "client build failed" }
    npm run build -w server
    if ($LASTEXITCODE -ne 0) { throw "server build failed" }

    Write-Host "`n[3/5] Prune devDependencies ..." -ForegroundColor Yellow
    npm prune --omit=dev
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "npm prune failed (often EBUSY/EPERM on Windows if editors lock files). Continuing; the package may be larger until prune succeeds."
    }
}
finally {
    Pop-Location
}

if (Test-Path $Stage) {
    Remove-Item $Stage -Recurse -Force
}
New-Item -ItemType Directory -Path $Stage -Force | Out-Null

Write-Host "`n[4/5] Copy app tree ..." -ForegroundColor Yellow

$copyPairs = @(
    @("package.json", "package.json"),
    @("package-lock.json", "package-lock.json")
)
foreach ($pair in $copyPairs) {
    Copy-Item (Join-Path $RepoRoot $pair[0]) (Join-Path $Stage $pair[1]) -Force
}

$robocopyRoots = @(
    @("node_modules", "node_modules"),
    @("shared", "shared"),
    @("server", "server"),
    @("client", "client")
)
foreach ($r in $robocopyRoots) {
    $src = Join-Path $RepoRoot $r[0]
    $dst = Join-Path $Stage $r[1]
    & robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /nc /ns /np /XD ".vite" "coverage" | Out-Null
    Assert-RobocopyOk $LASTEXITCODE
}

# Remove sources from staged packages (keep dist + package.json + node_modules)
foreach ($rel in @("client\src", "client\public", "server\src", "shared\src")) {
    $p = Join-Path $Stage $rel
    if (Test-Path $p) {
        Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Copy-Item (Join-Path $PackagingWindows "launch-FinancialOverview.ps1") (Join-Path $Stage "launch-FinancialOverview.ps1") -Force
Copy-Item (Join-Path $PackagingWindows "launch-FinancialOverview.cmd") (Join-Path $Stage "launch-FinancialOverview.cmd") -Force
Copy-Item (Join-Path $PackagingWindows "open-browser.cmd") (Join-Path $Stage "open-browser.cmd") -Force
Copy-Item (Join-Path $PackagingWindows "open-browser.ps1") (Join-Path $Stage "open-browser.ps1") -Force

$iconSrc = Join-Path $RepoRoot "client\public\favicon.ico"
$iconDst = Join-Path $Stage "app.ico"
if (Test-Path $iconSrc) {
    Copy-Item $iconSrc $iconDst -Force
    Write-Host "Copied app icon -> app.ico" -ForegroundColor DarkGray
} else {
    Write-Warning ('Missing ' + $iconSrc + ' - run: npm run icons:generate -w client. Shortcuts/installer will use default icons.')
}

$foExample = Join-Path $RepoRoot "financial-overview.json.example"
$foDst = Join-Path $Stage "financial-overview.json"
if (Test-Path $foExample) {
    Copy-Item $foExample $foDst -Force
}

$readmeTxt = @(
    'Financial Overview - Windows package'
    '====================================='
    ''
    'Start: double-click launch-FinancialOverview.cmd (or use the Start menu shortcut from the installer).'
    ''
    'Edit financial-overview.json next to this folder to set port and data folder (defaults are set for a typical install).'
    'You can copy financial-overview.json.example and rename if needed.'
    ''
    'Open in browser: http://127.0.0.1:<port>/  (open-browser.cmd uses the same port from env or JSON)'
    ''
    'Scraping needs Google Chrome or Microsoft Edge (Chromium) on this PC.'
    ''
    'For advanced settings see DEPLOYMENT.md in the repository.'
) -join [Environment]::NewLine
Set-Content -Path (Join-Path $Stage "README_WINDOWS.txt") -Value $readmeTxt -Encoding UTF8

$runtimeDir = Join-Path $Stage "runtime\node"
if (-not $SkipNodeDownload) {
    Write-Host "`n[5/5] Download Node.js v$NodeVersion win-x64 ..." -ForegroundColor Yellow
    $zipName = "node-v$NodeVersion-win-x64.zip"
    $url = "https://nodejs.org/dist/v$NodeVersion/$zipName"
    $zipPath = Join-Path $Stage "runtime\$zipName"
    New-Item -ItemType Directory -Path (Join-Path $Stage "runtime") -Force | Out-Null
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    $extractRoot = Join-Path $Stage "runtime\_extract"
    if (Test-Path $extractRoot) { Remove-Item $extractRoot -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force
    Remove-Item $zipPath -Force
    $inner = Get-ChildItem $extractRoot -Directory | Where-Object { $_.Name -like "node-v*-win-x64" } | Select-Object -First 1
    if (-not $inner) { throw "Could not find node extract folder under runtime\_extract" }
    Move-Item $inner.FullName $runtimeDir
    Remove-Item $extractRoot -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "`n[5/5] Skipping Node download (SkipNodeDownload)." -ForegroundColor Yellow
    if (-not (Test-Path (Join-Path $runtimeDir "node.exe"))) {
        Write-Warning "runtime\node\node.exe not present. Extract Node win-x64 zip to runtime\node"
    }
}

Write-Host "`nDone. Package ready at:" -ForegroundColor Green
Write-Host ('  ' + $Stage) -ForegroundColor Green
Write-Host "`nNext: compile the installer with Inno Setup:" -ForegroundColor Cyan
Write-Host '  ISCC.exe packaging\windows\FinancialOverview.iss' -ForegroundColor White
