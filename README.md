# מבט כלכלי · Financial Overview

---

## בעברית

### מה זה?

**מבט כלכלי** הוא כלי שרץ אצלך במחשב או בשרת הביתי (ולא בענן של חברה אחרת), ועוזר לך לאסוף את התנועות מהבנקים ובכרטיסי האשראי בישראל, לראות אותן במקום אחד, ולהבין איך נראים ההכנסות וההוצאות שלך לאורך זמן.

המטרה היא פשוטה: פחות להתעסק עם קבצים ואקסלים מפוזרים, ויותר תמונה ברורה של הכסף שלך — עם אפשרות לסווג, לייצא, ולקבל עדכונים כשאתה רוצה.

**קישורים:** [דמו — ממשק לדוגמה בדפדפן](https://yohaybn.github.io/Israeli-Financial-Overview/) (נתונים לדוגמה בלבד, בלי חיבור לבנק) · [מדריך התקנה — Windows](https://yohaybn.github.io/Israeli-Financial-Overview/install/)

### מה אפשר לעשות איתו (בקצרה)

- **למשוך נתונים מהבנק והאשראי** — הרצה מתוזמנת או ידנית, עם מעקב אחרי ההתקדמות במסך.
- **לוח בקרה** — סיכומים חודשיים, הכנסות והוצאות, מנויים חוזרים, ותצוגות שמסייעות לראות דפוסים.
- **לחקור ולסווג** — עבודה עם תוצאות מרובות, סינונים, וסיוע בקטגוריזציה (כולל אפשרות לעבוד עם בינה מלאכותית לניתוח ושיחה, לפי הגדרותיך).
- **ייצוא** — ל־CSV, JSON או לגיליונות Google, כדי שתוכל להמשיך לעבוד איפה שמתאים לך.
- **שפות** — ממשק בעברית ובאנגלית, כולל תמיכה בכיוון כתיבה (ימין־שמאל / שמאל־ימין).
- **התראות בטלגרם** — אופציונלי, כדי לקבל עדכונים או לבצע פעולות דרך הבוט (לפי ההגדרות שבחרת).
- **נעילת אפליקציה** — סיסמה שמגנה על הסשן ומסייעת להצפין את פרטי ההתחברות לבנקים שנשמרים אצלך במכשיר (ראו מדריך והערות אבטחה למטה).

כל זה מיועד ל**שימוש אישי וביתי** — אתה שולט איפה הנתונים נשמרים ואיך ניגשים אליהם.

---

## In English

### What is it?

**Financial Overview** is a **self-hosted** tool: it runs on **your** computer or home server, not on someone else’s cloud. It helps you **pull transactions** from Israeli banks and credit cards, see them in **one place**, and understand your **income and spending** over time.

The idea is straightforward: less juggling spreadsheets and scattered exports, and a clearer picture of your money — with optional **categorization**, **export**, and **notifications** when you want them.

**Links:** [Live demo](https://yohaybn.github.io/Israeli-Financial-Overview/) (sample data in the browser — **not** connected to your bank) · [Installation guide — Windows](https://yohaybn.github.io/Israeli-Financial-Overview/install/)

### Main features (at a glance)

- **Fetch bank & card data** — run on a schedule or on demand, with live progress in the UI.
- **Dashboard** — monthly summaries, income and expenses, recurring charges, and views that help spot patterns.
- **Explore & categorize** — work across multiple result sets, filter, and optional **AI-assisted** workflows (categorization and chat), according to your settings.
- **Export** — to **CSV**, **JSON**, or **Google Sheets** so you can keep working where you prefer.
- **Languages** — **English** and **Hebrew** with proper LTR/RTL layout.
- **Telegram** (optional) — updates and bot commands, depending on how you configure it.
- **App lock** — a password that protects your session and helps **encrypt saved bank profile credentials** on disk (see the user guide and security notes below).

This is aimed at **personal / home** use: **you** choose where data lives and how it is accessed.

---

<a id="windows-install"></a>

## התקנה ב־Windows (בלי מומחי מחשבים)

אם אתם משתמשים ב־**Windows**, הדרך הפשוטה ביותר היא להוריד את **קובץ ההתקנה** (סיומת `.exe`) מדף ה־**Releases** בפרויקט ב־GitHub, ולהפעיל אותו כמו כל תוכנה רגילה.

- **אין צורך להתקין Node.js או Docker** — ההתקנה מכילה את כל מה שהאפליקציה צריכה כדי לרוץ במחשב שלכם.
- אחרי ההתקנה תמצאו את **מבט כלכלי** בתפריט התחל; בפתיחה נפתח חלון של האפליקציה עם המסכים — בדרך כלל **לא צריך לפתוח דפדפן בנפרד**.
- ליד השעון (מגש המערכת) מופיעה **אייקון קטן**. אם **סוגרים את החלון** והאפליקציה נשארת ברקע — זה נורמלי: כך פעולות מתוזמנות (למשל משיכת נתונים) והתראות בטלגרם יכולות להמשיך לעבוד. כדי **לסגור לגמרי**, השתמשו באפשרות יציאה מהתפריט של האייקון (למשל "יציאה" / עצירת השרת).
- אם Windows מציג אזהרה בזמן ההתקנה (למשל SmartScreen) — זה קורה לעיתים בתוכנות שלא חתומות בידי חברות גדולות; עקבו אחרי ההוראות במדריך או בדף ההתקנה הרשמי.
- למשיכת נתונים מהבנק נדרש **דפדפן כרום או אדג'** מותקן במחשב (Chrome או Edge) — בלי זה החיבור לבנק עלול לא לעבוד.

**מדריך מפורט עם צילומי מסך (עברית / אנגלית):**  
[מדריך התקנה — GitHub Pages](https://yohaybn.github.io/Israeli-Financial-Overview/install/)

---

## Installing on Windows (no tech background needed)

On **Windows**, the straightforward path is to download the **installer** (a file ending in `.exe`) from the project’s **Releases** page on GitHub, then run it like any normal desktop program.

- **You do not need to install Node.js or Docker** — the installer bundles what the app needs to run on your PC.
- After setup, open **Financial Overview** from the Start menu. The app opens in its **own window** — you usually **do not need a separate browser tab**.
- Look for a **small icon** near the clock (the system tray). If **closing the window** leaves the app running in the background, that is intentional: **scheduled tasks** (for example automatic bank updates) and **Telegram** notifications can keep working. To **fully quit**, use the tray menu (for example **Quit** / stop server).
- If Windows shows a **security warning** during install (for example SmartScreen), that can happen with apps not signed like big commercial vendors; follow the steps in the official install guide if you trust this software.
- **Google Chrome** or **Microsoft Edge** must be installed on the PC for bank login flows — the app relies on a Chromium-based browser that is typically provided by Chrome or Edge on Windows.

**Step-by-step guide with screenshots (English / Hebrew):**  
[Installation guide — GitHub Pages](https://yohaybn.github.io/Israeli-Financial-Overview/install/)

---

## Technical overview & setup

**Preferred setup:** use the in-app **setup wizard** (onboarding) to configure Telegram, Gemini, Google OAuth/Drive, and **app lock** — the same password derives the key that **encrypts saved bank profiles**.

### What you get (detail)

| Area | Highlights |
|------|------------|
| **Web UI** | Dashboard (monthly income/expenses, subscriptions, analytics), Scrape with live progress, Results explorer (multi-file, filters, AI categorization), structured **Logs** (server/client/AI/scrape), **Configuration** (AI with **persona** alignment and **AI memory** — stored facts, insights, alerts; scheduler, scrape/fraud, Google, Telegram, maintenance). **AI analyst chat** opens from the floating indigo button on **any** main tab when Gemini is configured. |
| **Languages** | English and Hebrew with LTR/RTL. |
| **App lock & profiles** | **App lock** (min. 8 characters) protects the session and **encrypts stored profile credentials**. You can use most of the app (dashboard, logs, configuration, exploring results) **without** unlocking; **running scrapes** and **creating/editing saved bank profiles** require the app to be **unlocked** when app lock is enabled. **Forgot password:** encrypted profiles cannot be recovered — you must **delete those profiles** and **re-enter** bank credentials after resetting lock (see **[GUIDE.html](client/public/GUIDE.html)**). |
| **Integrations** | Google OAuth → Drive/Sheets; **Gemini** for categorization and analyst chat; **Telegram** bot — see **[docs/TELEGRAM_BOT_GUIDE.md](docs/TELEGRAM_BOT_GUIDE.md)** (commands, notifications, optional `/unlock` when the UI is locked). |
| **Deployment** | Docker / Compose, **Home Assistant** add-on, **Windows** installer (see below), local **Node** monorepo for development. |

### Repository layout

This repo is an **npm workspace** monorepo:

- **`shared/`** — Shared TypeScript (financial metrics, digest logic aligned with the dashboard).
- **`server/`** — API, scraping orchestration, persistence.
- **`client/`** — Vite + React UI (also buildable as a static **demo** with mocked APIs).

### Quick start (local development)

From the repository root:

```bash
npm run setup
npm run dev
```

This runs the API and the Vite dev client together (see root `package.json`). The UI is typically served on **`http://127.0.0.1:5173`** with the API proxied; for Docker/Home Assistant the app is often exposed on **port 3000** (see [DEPLOYMENT.md](DEPLOYMENT.md)).

### Docker

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

### Home Assistant add-on

1. Add this repository in **Settings → Add-ons → Add-on Store → Repositories**.
2. Install **Financial Overview** and configure OAuth/Drive (and other options) in the add-on **Configuration** tab.
3. Start the add-on and open the Web UI from the sidebar.

Details: [DEPLOYMENT.md](DEPLOYMENT.md).

### Windows installer (maintainers — build from source)

End-user steps are in the **[Windows install section](#windows-install)** above; this block is for **packaging** the `.exe`.

The Windows build produces a **single installer** that bundles the production server, the built web UI, pruned **npm** dependencies, and a **portable Node.js** — end users do **not** install Node separately.

1. On **Windows x64**, from the repo root: `npm run windows:package` (or [`packaging/windows/package.ps1`](packaging/windows/package.ps1)) → `dist/windows-package/`.
2. Build the Electron shell: `npm run electron:dist`, or **`npm run windows:electron`** for both steps → **`dist/electron-win/FinancialOverview-Windows-Setup-<version>.exe`** (NSIS; installs **`FinancialOverview.exe`** + server under `resources/`). Optional legacy [Inno Setup](https://jrsoftware.org/isinfo.php): [`packaging/windows/FinancialOverview.iss`](packaging/windows/FinancialOverview.iss) (not used in CI).
3. **GitHub Releases:** on **`release: published`**, [windows-package workflow](.github/workflows/windows-package.yml) uploads **`windows-package.zip`** and **`FinancialOverview-Windows-Setup-<version>.exe`** (or run manually via **Actions** → `workflow_dispatch`).

**Advanced (optional):** default app URL is **`http://127.0.0.1:3000`**. To change **port** or **data folder**, edit **`financial-overview.json`** in the install directory (see [`financial-overview.json.example`](financial-overview.json.example)); `PORT` / `DATA_DIR` env vars override the file. See [DEPLOYMENT.md](DEPLOYMENT.md). Packaging skips bundling Puppeteer’s Chromium — **Chrome** or **Edge** on the machine is expected (or customize the build — [packaging/windows/README.md](packaging/windows/README.md)).

### GitHub Pages (demo UI + installation guide)

The workflow in `.github/workflows/pages.yml` publishes:

- A **static demo** (`VITE_DEMO=true`, in-browser API mocks, sample data). It does **not** connect to banks or your server. Full functionality requires the server stack above.
- A bilingual **installation guide** (English / Hebrew) for the Windows installer: **`/install/`** on your GitHub Pages site (e.g. [https://yohaybn.github.io/Israeli-Financial-Overview/install/](https://yohaybn.github.io/Israeli-Financial-Overview/install/) after Pages is enabled). It covers the **Electron desktop app**, **system tray**, **close-to-tray / background** (scheduler & Telegram), and the legacy console workflow. Screenshots live under [`client/public/install/screenshots/`](client/public/install/screenshots/) and are copied into the Pages build with the rest of `client/public/`.

### Dashboard behavior (recent logic)

For the **current calendar month**, positive **completed** transactions whose **posting date is after today** are treated as **expected inflow** (not yet received), together with pending income and detected recurring income. The same rules feed **Telegram digests** via shared code so server and UI stay consistent.

On **narrow viewports** (below Tailwind `sm`, 640px), main dashboard sections **start collapsed**; on wider screens they start expanded.

### Documentation in this repo

| Doc | Purpose |
|-----|---------|
| **[Installation guide (GitHub Pages)](https://yohaybn.github.io/Israeli-Financial-Overview/install/)** | Windows install, **desktop app + tray**, background operation, first run, Telegram, Gemini (EN/HE); source: [`client/public/install/index.html`](client/public/install/index.html). |
| **[client/public/GUIDE.html](client/public/GUIDE.html)** | Full user guide (EN/HE toggle) — same file the app opens from **Help**. Covers **AI memory**, **AI persona**, onboarding extraction, **manual import** (Results explorer), **custom tabular import formats** (`?view=importProfile`), **export to other applications** (CSV/JSON, API, Telegram, Google Sheets, Firefly III, Lunch Money, YNAB, Actual Budget), and a **warning to verify AI-parsed imports** before saving. |
| **[server/src/assets/help/user_manual.md](server/src/assets/help/user_manual.md)** | Source text for the documentation-grounded **Help Assistant**; includes import / import-profile / AI-import caution and **export to other applications** in Markdown. |
| **[docs/VIDEO_GUIDE.md](docs/VIDEO_GUIDE.md)** | Scene-by-scene video/storyboard guide; PNG/PDF assets under `docs/video-guide-screenshots/` and `docs/video-guide-pdfs/`. |
| **[docs/TELEGRAM_BOT_GUIDE.md](docs/TELEGRAM_BOT_GUIDE.md)** | Telegram bot setup, commands, and behavior (English). |
| **[client/public/guides/TELEGRAM_BOT_GUIDE.he.md](client/public/guides/TELEGRAM_BOT_GUIDE.he.md)** | Hebrew Telegram guide — embedded in **עברית** in [`client/public/GUIDE.html`](client/public/GUIDE.html); regenerate with `npm run guide:embed-telegram`. |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Environment variables and deployment (Docker, HA, **Windows**). |
| **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)** | Who can obtain bank credentials vs. transaction data; shared PC and remote attacker paths. |
| **[packaging/windows/README.md](packaging/windows/README.md)** | Building the Windows installer and `dist/windows-package`. |
| **[financial-overview.json.example](financial-overview.json.example)** | Optional install-local JSON (`port`, `dataDir`) read by the server (copy to `financial-overview.json`). |
| **[server/src/index.ts](server/src/index.ts)** | Mounts REST routes under `/api/*` (see `server/src/routes/`). Health: `GET /api/health`. |

### API

REST JSON under **`/api/*`** (Express). Route modules live in **`server/src/routes/`**; **`server/src/index.ts`** shows how they are mounted. **`GET /api/health`** returns `{ status, version }`.

### Security & encryption (at rest)

| What | How |
|------|-----|
| **Saved bank profile credentials** | **AES-256-GCM** on disk under `data/profiles/` (each profile’s `credentials` field). The key is derived from your **app lock password** with **scrypt** (salt stored in `data/security/app-lock.json`). The password itself is **not** stored — only a **scrypt hash** for verification. |
| **In memory** | While the app is **unlocked**, the derived AES key exists only in server memory; it is **not** written to disk. |
| **Not encrypted by the application** | **Gemini / OAuth / Telegram** secrets in `runtime-settings.json` and config JSON; **SQLite** (`app.db`) for transactions and AI memory; scrape **results** and other files under **`DATA_DIR`**. Treat the whole data directory as sensitive and use **OS permissions** and optional **full-disk encryption**. |
| **Backups** | Local/Drive snapshots copy the same on-disk representation (encrypted profile blobs stay encrypted; plaintext config stays plaintext). |

Default deployment uses **HTTP** to localhost; use a **reverse proxy with TLS** if you expose the UI beyond trusted networks.

#### Threat model (credentials vs. local access)

- **Best practice:** **Unlock** only to **run a scrape** or **add/edit a saved profile**, then **lock again** — this keeps the derived encryption key in memory for the **shortest** time. See **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)** for when locking **does** and **does not** stop credential access.
- **Bank logins (saved profiles):** Meaningful protection requires **app lock** with a **strong password**. If you **never** enable app lock, the app may use a **fixed fallback key** published in source — **anyone who can read `data/profiles/` can recover credentials.** With app lock, an attacker needs your **password**, an **unlocked** session, or **offline cracking** of the lock file (e.g. after **stolen disk**), not just a folder copy alone.
- **Transaction history & scrape data:** Stored in **SQLite** (`app.db`) and **`data/results/`** — **not** app-encrypted. Anyone with read access to **`DATA_DIR`** can read **transactions** and **config secrets** (Gemini, Telegram, OAuth) even **without** the app lock password. **App lock does not hide the database from someone who can open files.**
- **Remote “hackers”** need a path to your machine (**malware**, **exposed port**, **stolen backup**, etc.) — they do not magically read localhost. Full detail: **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)**.

---

## Credits

Bank and credit-card **scraping** is powered by the open-source **[israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers)** project — a community-maintained library that connects to Israeli financial institutions. This app builds on top of that work; **thank you to the maintainers and contributors** of **israeli-bank-scrapers**.

Scraping does **not** use AI. Optional **Gemini** features (categorization, chat, etc.) do **not** receive your encrypted profile credentials or bank login secrets — only the transaction text and context you choose to send for those features.
