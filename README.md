# Financial Overview (מבט כלכלי)

Self-hosted tool to pull transactions from Israeli banks and credit cards, explore and categorize them in a web UI, export to CSV/JSON or Google Sheets, and automate runs with optional Telegram notifications and AI-assisted workflows.

**Preferred setup:** use the in-app **setup wizard** (onboarding) to configure Telegram, Gemini, Google OAuth/Drive, and **app lock**—the same password derives the key that **encrypts saved bank profiles**.

## What you get

| Area | Highlights |
|------|------------|
| **Web UI** | Dashboard (monthly income/expenses, subscriptions, analytics, AI chat), Scrape with live progress, Results explorer (multi-file, filters, AI categorization), structured **Logs** (server/client/AI/scrape), **Configuration** (AI with **persona** alignment and **AI memory**—stored facts, insights, alerts; scheduler, scrape/fraud, Google, Telegram, maintenance). |
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

**Feedback form:** The Google Form link is set in [`client/src/config/feedbackGoogleForm.ts`](client/src/config/feedbackGoogleForm.ts). The in-app dialog opens that URL (no URL prefill); it shows installation and version for reference and can fetch optional **server/client log** excerpts for copy-paste with explicit consent.

At **image build** time you can bake identity strings into the static client (see `ARG` / `ENV` before `npm run build -w client` in the root [`Dockerfile`](Dockerfile)):

```bash
docker build \
  --build-arg VITE_APP_BUILD_VERSION="$(git rev-parse HEAD)" \
  --build-arg VITE_INSTALL_KIND=docker \
  -t financial-overview .
```

CI workflows set `VITE_APP_BUILD_VERSION` and `VITE_INSTALL_KIND` automatically where applicable.

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
3. **GitHub Releases:** publish a **release** (e.g. tag `v1.0.0`). The [Windows package workflow](.github/workflows/windows-package.yml) runs on **`release: published`**, builds the zip and installer, and **uploads `windows-package.zip` and `FinancialOverview-Windows-Setup.exe`** to that release. You can also run the workflow manually from the **Actions** tab (`workflow_dispatch`).

**End users**

Step-by-step (download, SmartScreen, shortcuts, browser, app lock, Telegram, Gemini): **[Installation guide on GitHub Pages](https://yohaybn.github.io/Israeli-Financial-Overview/install/)** (English / Hebrew).

1. Run **`FinancialOverview-Windows-Setup.exe`** and complete the wizard (default install folder: `%LocalAppData%\FinancialOverview`).
2. Start the app from the Start menu shortcut **`Financial Overview`**, or run `launch-FinancialOverview.cmd` in the install folder. A console window stays open while the server runs; close it to stop.
3. Open **`http://127.0.0.1:3000`** in your browser (default **port** is `3000`). Use the second shortcut **Open Financial Overview in browser** after the server has started, or wait a few seconds on first launch.
4. **Port and data folder:** edit **`financial-overview.json`** in the install folder (a default file is included; see [`financial-overview.json.example`](financial-overview.json.example)). Set **`port`** and optional **`dataDir`** (Windows paths can use `%APPDATA%`, etc.). **Environment variables** (`PORT`, `DATA_DIR`) override the file if set. See [DEPLOYMENT.md](DEPLOYMENT.md).
5. **Bank scraping** uses a Chromium-based browser. The Windows build skips downloading Puppeteer’s browser during packaging; install **Google Chrome** or **Microsoft Edge** on the PC (or run `npm install` in the repo without `PUPPETEER_SKIP_DOWNLOAD` before packaging if you need a bundled Chromium).

Full maintainer notes: [packaging/windows/README.md](packaging/windows/README.md).

## GitHub Pages (demo UI + installation guide)

The workflow in `.github/workflows/pages.yml` publishes:

- A **static demo** (`VITE_DEMO=true`, in-browser API mocks, sample data). It does **not** connect to banks or your server. Full functionality requires the server stack above.
- A bilingual **installation guide** (English / Hebrew) for the Windows installer: **`/install/`** on your GitHub Pages site (e.g. [https://yohaybn.github.io/Israeli-Financial-Overview/install/](https://yohaybn.github.io/Israeli-Financial-Overview/install/) after Pages is enabled). Guide screenshots live under [`client/public/install/screenshots/`](client/public/install/screenshots/) and are copied into the Pages build with the rest of `client/public/`.

## Dashboard behavior (recent logic)

For the **current calendar month**, positive **completed** transactions whose **posting date is after today** are treated as **expected inflow** (not yet received), together with pending income and detected recurring income. The same rules feed **Telegram digests** via shared code so server and UI stay consistent.

On **narrow viewports** (below Tailwind `sm`, 640px), main dashboard sections **start collapsed**; on wider screens they start expanded.

## Documentation in this repo

| Doc | Purpose |
|-----|---------|
| **[Installation guide (GitHub Pages)](https://yohaybn.github.io/Israeli-Financial-Overview/install/)** | Step-by-step Windows install, first run, Telegram, and Gemini API (EN/HE); source: [`client/public/install/index.html`](client/public/install/index.html). |
| **[client/public/GUIDE.html](client/public/GUIDE.html)** | Full user guide (EN/HE toggle) — same file the app opens from **Help**. Covers **AI memory** (stored facts vs. chat-merged facts), **AI persona** (structured profile and optional analyst prompt injection), and onboarding extraction. |
| **[docs/VIDEO_GUIDE.md](docs/VIDEO_GUIDE.md)** | Scene-by-scene video/storyboard guide; PNG/PDF assets under `docs/video-guide-screenshots/` and `docs/video-guide-pdfs/`. |
| **[docs/TELEGRAM_BOT_GUIDE.md](docs/TELEGRAM_BOT_GUIDE.md)** | Telegram bot setup, commands, and behavior (English). |
| **[client/public/guides/TELEGRAM_BOT_GUIDE.he.md](client/public/guides/TELEGRAM_BOT_GUIDE.he.md)** | Hebrew Telegram guide — embedded in **עברית** in [`client/public/GUIDE.html`](client/public/GUIDE.html); regenerate with `npm run guide:embed-telegram`. |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Environment variables and deployment (Docker, HA, **Windows**). |
| **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)** | Who can obtain bank credentials vs. transaction data; shared PC and remote attacker paths. |
| **[packaging/windows/README.md](packaging/windows/README.md)** | Building the Windows installer and `dist/windows-package`. |
| **[financial-overview.json.example](financial-overview.json.example)** | Optional install-local JSON (`port`, `dataDir`) read by the server (copy to `financial-overview.json`). |
| **[server/src/index.ts](server/src/index.ts)** | Mounts REST routes under `/api/*` (see `server/src/routes/`). Health: `GET /api/health`. |

## API

REST JSON under **`/api/*`** (Express). Route modules live in **`server/src/routes/`**; **`server/src/index.ts`** shows how they are mounted. **`GET /api/health`** returns `{ status, version }`.

## Security & encryption (at rest)

| What | How |
|------|-----|
| **Saved bank profile credentials** | **AES-256-GCM** on disk under `data/profiles/` (each profile’s `credentials` field). The key is derived from your **app lock password** with **scrypt** (salt stored in `data/security/app-lock.json`). The password itself is **not** stored—only a **scrypt hash** for verification. |
| **In memory** | While the app is **unlocked**, the derived AES key exists only in server memory; it is **not** written to disk. |
| **Not encrypted by the application** | **Gemini / OAuth / Telegram** secrets in `runtime-settings.json` and config JSON; **SQLite** (`app.db`) for transactions and AI memory; scrape **results** and other files under **`DATA_DIR`**. Treat the whole data directory as sensitive and use **OS permissions** and optional **full-disk encryption**. |
| **Backups** | Local/Drive snapshots copy the same on-disk representation (encrypted profile blobs stay encrypted; plaintext config stays plaintext). |

Default deployment uses **HTTP** to localhost; use a **reverse proxy with TLS** if you expose the UI beyond trusted networks.

### Threat model (credentials vs. local access)

- **Best practice:** **Unlock** only to **run a scrape** or **add/edit a saved profile**, then **lock again**—this keeps the derived encryption key in memory for the **shortest** time. See **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)** for when locking **does** and **does not** stop credential access.
- **Bank logins (saved profiles):** Meaningful protection requires **app lock** with a **strong password**. If you **never** enable app lock, the app may use a **fixed fallback key** published in source—**anyone who can read `data/profiles/` can recover credentials.** With app lock, an attacker needs your **password**, an **unlocked** session, or **offline cracking** of the lock file (e.g. after **stolen disk**), not just a folder copy alone.
- **Transaction history & scrape data:** Stored in **SQLite** (`app.db`) and **`data/results/`**—**not** app-encrypted. Anyone with read access to **`DATA_DIR`** can read **transactions** and **config secrets** (Gemini, Telegram, OAuth) even **without** the app lock password. **App lock does not hide the database from someone who can open files.**
- **Remote “hackers”** need a path to your machine (**malware**, **exposed port**, **stolen backup**, etc.)—they do not magically read localhost. Full detail: **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)**.

## Credits

Bank and card scraping uses the open-source **[israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers)** library (community-maintained). Scraping does **not** use AI; optional **Gemini** features (categorization, chat, etc.) do **not** receive your encrypted profile credentials or bank login secrets—only the transaction text and context you send for those features.
