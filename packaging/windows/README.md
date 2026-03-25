# Windows packaging (maintainers)

1. **On Windows x64**, from the repository root, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File packaging/windows/package.ps1
   ```

   The script sets `PUPPETEER_SKIP_DOWNLOAD=true` so the Puppeteer browser is **not** downloaded during `npm install` (scraping uses **Chrome** or **Edge** on the target PC). It runs `npm install`, builds `shared`, `client`, and `server`, runs `npm prune --omit=dev` (warns and continues if prune fails due to file locks), copies the production tree into `dist/windows-package`, and downloads a portable **Node.js** build into `dist/windows-package/runtime/node`.

   For reproducible CI builds, use `npm ci` in a clean checkout instead of `npm install` (see `.github/workflows/windows-package.yml`).

2. **Optional:** skip re-downloading Node when iterating:

   ```powershell
   powershell -ExecutionPolicy Bypass -File packaging/windows/package.ps1 -SkipNodeDownload
   ```

3. **Installer:** Install [Inno Setup 6](https://jrsoftware.org/isinfo.php), then compile:

   ```text
   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\windows\FinancialOverview.iss
   ```

   Output: `dist/FinancialOverview-Windows-Setup.exe`

4. **Test:** Run `dist\windows-package\launch-FinancialOverview.cmd` and open `http://127.0.0.1:3000`.

Native modules (`better-sqlite3`) must be built for Windows — run the packaging script on Windows (or use a Windows CI runner).
