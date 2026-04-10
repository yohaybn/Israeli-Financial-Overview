Financial Overview - macOS package
==================================

Start (browser + terminal): run ./launch-FinancialOverview.sh in Terminal (double-click may not work until you allow the script in Security settings).

Desktop app: build the Electron .dmg from the repository (npm run macos:electron) for tray, background server, and a normal .app experience.

Edit financial-overview.json next to this folder to set port and data folder. If you omit dataDir, the app uses ~/Library/Application Support/FinancialOverview/data by default.

Open in browser: http://127.0.0.1:<port>/  (./open-browser.sh uses PORT from the environment or defaults to 3000)

Scraping needs Google Chrome or another Chromium-based browser on this Mac.

This build targets the CPU architecture of the machine that created it (Apple Silicon or Intel). For advanced settings see DEPLOYMENT.md in the repository.
