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

## Port and environment (installed app)

The server reads **`financial-overview.json`** next to `server/` (see repo root [`financial-overview.json.example`](../../financial-overview.json.example)). The packaged folder includes a default **`financial-overview.json`** with **`port`** and **`dataDir`**.

| Key | Purpose |
|-----|---------|
| `port` | HTTP port (default `3000`) if **`PORT`** is not set in the environment |
| `dataDir` | Data directory if **`DATA_DIR`** is not set in the environment (`%APPDATA%\...` expansion works on Windows) |

**OS environment variables always win** over the JSON file.

**Change the port without editing JSON:** set **`PORT`** before starting (PowerShell: `$env:PORT = "4000"; .\launch-FinancialOverview.cmd`), a user env var, or a wrapper `.cmd` with `set PORT=4000`.

Then open **`http://127.0.0.1:<port>/`**. **`open-browser.cmd`** uses **`PORT`** from the environment or **`port`** from **`financial-overview.json`**, then defaults to `3000`.

If **`financial-overview.json`** is missing and **`PORT`** is unset, the server listens on **3000**. See [DEPLOYMENT.md](../../DEPLOYMENT.md).

## GitHub Releases

When you **publish a GitHub Release** (not draft), the workflow [`.github/workflows/windows-package.yml`](../../.github/workflows/windows-package.yml) uploads:

- **`windows-package.zip`** — portable folder (`dist/windows-package`)
- **`FinancialOverview-Windows-Setup.exe`** — Inno Setup installer

The workflow checks out the **release tag**, then builds. Create the release from an existing tag, or create tag + release together; publishing triggers the upload.
