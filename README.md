# Financial Overview (מבט כלכלי)

Self-hosted tool to pull transactions from Israeli banks and credit cards, explore and categorize them in a web UI, export to CSV/JSON or Google Sheets, and automate runs with optional Telegram notifications and AI-assisted workflows.

**Preferred setup:** use the in-app **setup wizard** (onboarding) to configure Telegram, Gemini, Google OAuth/Drive, and **app lock**—the same password derives the key that **encrypts saved bank profiles**.

## What you get

| Area | Highlights |
|------|------------|
| **Web UI** | Dashboard (monthly income/expenses, subscriptions, analytics, AI chat), Scrape with live progress, Results explorer (multi-file, filters, AI categorization), structured **Logs** (server/client/AI/scrape), **Configuration** (AI, scheduler, Google, Telegram, environment, maintenance). |
| **Languages** | English and Hebrew with LTR/RTL. |
| **App lock & profiles** | **App lock** (min. 8 characters) protects the session and **encrypts stored profile credentials**. You can use most of the app (dashboard, logs, configuration, exploring results) **without** unlocking; **running scrapes** and **creating/editing saved bank profiles** require the app to be **unlocked** when app lock is enabled. **Forgot password:** encrypted profiles cannot be recovered—you must **delete those profiles** and **re-enter** bank credentials after resetting lock (see **[GUIDE.html](client/public/GUIDE.html)**). |
| **Integrations** | Google OAuth → Drive/Sheets; **Gemini** for categorization and analyst chat; **Telegram** bot — see **[docs/TELEGRAM_BOT_GUIDE.md](docs/TELEGRAM_BOT_GUIDE.md)** (commands, notifications, optional `/unlock` when the UI is locked). |
| **Deployment** | Docker / Compose, **Home Assistant** add-on, **Windows** installer (see below), local **Node** monorepo for development. |

## Repository layout

This repo is an **npm workspace** monorepo:

- **`shared/`** — Shared TypeScript (financial metrics, digest logic aligned with the dashboard).
- **`server/`** — API, scraping orchestration, persistence.
- **`client/`** — Vite + React UI (also buildable as a static **demo** with mocked APIs).

## Quick start (local development)

From the repository root:

```bash
npm run setup
npm run dev
```

This runs the API and the Vite dev client together (see root `package.json`). The UI is typically served on **`http://127.0.0.1:5173`** with the API proxied; for Docker/Home Assistant the app is often exposed on **port 3000** (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Docker

```bash
docker-compose up --build
```

Then open the Web UI at **`http://localhost:3000`** (or the port mapped in your compose file).

## Home Assistant add-on

1. Add this repository in **Settings → Add-ons → Add-on Store → Repositories**.
2. Install **Financial Overview** and configure OAuth/Drive (and other options) in the add-on **Configuration** tab.
3. Start the add-on and open the Web UI from the sidebar.

Details: [DEPLOYMENT.md](DEPLOYMENT.md).

## Windows desktop app (single installer)

For a **one-file** distribution on Windows, build an installer that bundles the production server, the built web UI, **npm dependencies** (after pruning dev tools), and a **portable Node.js** runtime—users do **not** install Node separately.

**Maintainers — create the package and installer**

1. On **Windows x64**, from the repo root: `npm run windows:package` (or run [`packaging/windows/package.ps1`](packaging/windows/package.ps1)). This produces `dist/windows-package/`.
2. Install [Inno Setup 6](https://jrsoftware.org/isinfo.php) and compile [`packaging/windows/FinancialOverview.iss`](packaging/windows/FinancialOverview.iss) to get **`dist/FinancialOverview-Windows-Setup.exe`**.

**End users**

1. Run **`FinancialOverview-Windows-Setup.exe`** and complete the wizard (default install folder: `%LocalAppData%\FinancialOverview`).
2. Start the app from the Start menu shortcut **`Financial Overview`**, or run `launch-FinancialOverview.cmd` in the install folder. A console window stays open while the server runs; close it to stop.
3. Open **`http://127.0.0.1:3000`** in your browser (default **port** is `3000`). Use the second shortcut **Open Financial Overview in browser** after the server has started, or wait a few seconds on first launch.
4. **Port and data folder:** edit **`financial-overview.json`** in the install folder (a default file is included; see [`financial-overview.json.example`](financial-overview.json.example)). Set **`port`** and optional **`dataDir`** (Windows paths can use `%APPDATA%`, etc.). **Environment variables** (`PORT`, `DATA_DIR`) override the file if set. See [DEPLOYMENT.md](DEPLOYMENT.md).
5. **Bank scraping** uses a Chromium-based browser. The Windows build skips downloading Puppeteer’s browser during packaging; install **Google Chrome** or **Microsoft Edge** on the PC (or run `npm install` in the repo without `PUPPETEER_SKIP_DOWNLOAD` before packaging if you need a bundled Chromium).

Full maintainer notes: [packaging/windows/README.md](packaging/windows/README.md).

## GitHub Pages (demo UI only)

The workflow in `.github/workflows/pages.yml` can publish a **static demo** (`VITE_DEMO=true`, in-browser API mocks, sample data). It does **not** connect to banks or your server. Full functionality requires the server stack above.

## Dashboard behavior (recent logic)

For the **current calendar month**, positive **completed** transactions whose **posting date is after today** are treated as **expected inflow** (not yet received), together with pending income and detected recurring income. The same rules feed **Telegram digests** via shared code so server and UI stay consistent.

On **narrow viewports** (below Tailwind `sm`, 640px), main dashboard sections **start collapsed**; on wider screens they start expanded.

## Documentation in this repo

| Doc | Purpose |
|-----|---------|
| **[client/public/GUIDE.html](client/public/GUIDE.html)** | Full user guide (EN/HE toggle) — same file the app opens from **Help**. |
| **[docs/VIDEO_GUIDE.md](docs/VIDEO_GUIDE.md)** | Scene-by-scene video/storyboard guide; PNG/PDF assets under `docs/video-guide-screenshots/` and `docs/video-guide-pdfs/`. |
| **[docs/TELEGRAM_BOT_GUIDE.md](docs/TELEGRAM_BOT_GUIDE.md)** | Telegram bot setup, commands, and behavior. |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Environment variables and deployment (Docker, HA, **Windows**). |
| **[packaging/windows/README.md](packaging/windows/README.md)** | Building the Windows installer and `dist/windows-package`. |
| **[financial-overview.json.example](financial-overview.json.example)** | Optional install-local JSON (`port`, `dataDir`) read by the server (copy to `financial-overview.json`). |
| **[app/API.md](app/API.md)** | API reference (Swagger-style). |

Re-capture guide screenshots/PDFs (requires dev server + Playwright):

```bash
npm run video-guide:capture
```

Optional: `node scripts/capture-video-guide-media.mjs --only <asset-id>` — see [docs/VIDEO_GUIDE.md](docs/VIDEO_GUIDE.md).

## API

👉 **[API Reference (Swagger-style)](app/API.md)**

## Credits

Bank and card scraping uses the open-source **[israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers)** library (community-maintained). Scraping does **not** use AI; optional **Gemini** features (categorization, chat, etc.) do **not** receive your encrypted profile credentials or bank login secrets—only the transaction text and context you send for those features.
