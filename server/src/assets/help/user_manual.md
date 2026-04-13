# Financial Overview — Complete User Manual

Welcome to **Financial Overview** (מבט כלכלי). This app is your personal financial command center: it gathers banking and credit card data, runs AI-assisted categorization, and helps you budget and forecast.

This manual describes how to use each major area of the application.

### System requirements (summary)

*   **Architecture:** Recent **64-bit** OS; the **web UI** uses a **local Node.js server** (bundled in the Windows installer, Docker image, and Home Assistant add-on—no separate Node install for those packages).
*   **Client:** A **modern browser** with **JavaScript** enabled, **or** on Windows the **Electron** desktop app (`FinancialOverview.exe`) with the same UI embedded.
*   **Network:** Internet for **bank scrapes**; optional **Gemini**, **Telegram**, and **Google** when you enable them.
*   **Disk:** Space for `DATA_DIR` (grows with transactions and scrape history).
*   **Windows bank automation:** **Google Chrome** or **Microsoft Edge** (Chromium) for the scraper; not bundled by default in the Windows package.
*   **Windows packages:** **`FinancialOverview-Windows-Setup-<version>.exe`** — single NSIS installer with **Electron**, tray, and close-to-tray (recommended; version in the filename matches the release). **`windows-package.zip`** — portable folder, run `launch-FinancialOverview.cmd`, **no Electron** / **no tray**; keep the console open.

---

## 0. Main interface (header & guided flows)
**Location:** all views

*   **Main tabs:** **Dashboard**, **Scrape**, **Logs**, **Configuration** — scroll horizontally on small screens.
*   **Server status:** If the API health check fails, a **server unreachable** indicator appears; ensure the Node server is running and the URL port matches **Configuration → Maintenance** (or `PORT` / `financial-overview.json`).
*   **Activity chips:** Optional **Scrape** / **AI** indicators while work is running.
*   **On Dashboard:** An **alerts** control lists items for the **selected month**.
*   **AI Financial Analyst (chat):** The floating **indigo** button (bottom-right) on **every** main tab opens transaction-scoped analyst chat when Gemini is configured (same control from Dashboard, Scrape, Logs, or Configuration).
*   **Language:** Toggle English / Hebrew (RTL for Hebrew).
*   **App Assistant:** Shown when Gemini is configured — contextual help chat.
*   **Help docs / Feedback:** Open the static guide (`GUIDE.html`) or the feedback dialog (optional log excerpts with consent).
*   **Rerun setup wizard / Getting Started tour:** After onboarding, you can restart the full onboarding flow or the short UI tour (each asks for confirmation).
*   **Guided flows:** (1) **Setup wizard (onboarding)** — Telegram, Gemini, Google, app lock; (2) **Getting Started tour** — short orientation; (3) **Persona wizard** — optional AI persona setup.
*   **Banners:** **Transaction review** (assign categories from a table); **Categorization error** (retry bulk AI categorization or open AI settings).
*   **Default view:** With no scrape results and no unified transactions, and no `view` in the URL, the app opens **Scrape** first.

---

## 1. Dashboard (Financial Command Center)
**Location:** `/?view=dashboard`

The Dashboard is your main home screen, providing analytics and summaries based on your transaction history.

### How to use the Dashboard:
*   **Change Displayed Month:** Use the arrows next to the month name at the top to navigate back to historical data or forward to current data.
*   **Export/Download Data:** Click the **Export** button to download all transactions or just the currently selected month's transactions in CSV or JSON. See **Export to other applications** (Section 2) for every supported destination and format detail.
*   **Set Credit Card Payment Date:** If your credit cards charge on a specific day (e.g., the 2nd or 10th), configure a custom payment date here so the app aligns your forecast accurately with your billing cycle.
*   **Track Income Progress:** A visual bar shows tracking for your received income versus the total expected monthly inflow, helping you see if you're on target.
*   **Track Expense Progress:** View funds you have already spent. The system generates a **Variable Forecast** predicting how much more you'll spend based on your daily burn rate and historical behavior, capping the forecast to prevent skewed data if you spend heavily early in the month.
*   **Manage Subscriptions:** Review a panel of active subscriptions detected automatically by the system. You can drill down into each to see transaction history or mark items incorrectly identified as subscriptions. Only active subscriptions with recent transactions are shown.
*   **View & Edit Transactions:** Browse all transactions for the selected month in a detailed list. You can click on transactions to manually override the AI's selected category.
*   **View Detailed Analytics:** Analyze the Category Pie chart for distribution mapping, Monthly Trends to compare against previous months, and Top Merchants to see where your money goes.
*   **Use the AI Financial Chat:** Open it from the floating **indigo** button (bottom-right) on any main tab. You can ask ad-hoc questions scoped to your transactions (e.g., "How much did I spend on groceries this month?").
*   **Top insights:** Combines **AI memory** insights and **Insight rules** (**Configuration → Insight rules**). Cards are labeled **AI** or **Rule**; dismissing removes items (rules use **insight_rule_fires**, separate from chat insights).
*   **Header alerts:** The Dashboard alerts menu lists insight/alert items for the selected month.

---

## 2. Export to other applications

You can move data into spreadsheets, plain files, Google Sheets, and dedicated budget tools. Paths differ by whether you export the **unified transaction library** (everything merged in the database) or a **single scrape result file**, and whether export runs **manually** or **automatically after a scrape**.

### Unified library — CSV and JSON

The unified library includes transactions from scrapes **and** imports.

*   **Dashboard:** On **Dashboard** (`/?view=dashboard`), open **Export**. Download **all** transactions or only the **selected month**, as **CSV** or **JSON**. Server-generated CSV uses a **UTF-8 BOM** (Excel-friendly, including Hebrew) and includes columns such as `id`, `date`, `processedDate`, `description`, `memo`, `amount`, `originalAmount`, `originalCurrency`, `chargedAmount`, `chargedCurrency`, `status`, `category`, `provider`, `accountNumber`, `txnType`, and related flags — suitable for Excel, Google Sheets, Python/R scripts, or other PFM tools that accept CSV/JSON.
*   **HTTP API:** `GET /api/results/export?format=csv` or `format=json` on the same host and port as the UI. Optional query parameters: `month=YYYY-MM` (one calendar month only), `includeIgnored=0` or `false` to exclude ignored transactions (defaults include them). The response is sent as a file download (`Content-Disposition` attachment).
*   **Telegram:** With the bot running and your user allowed, use `/export csv` or `/export json` for the full unified library, or add a month: `/export csv 2026-03`. The bot sends a document in the chat (same data scope as the Dashboard export).

### Single scrape result — Results explorer

**Scrape → Results explorer:** When a **saved result file** is selected in the sidebar, **Export** produces CSV or JSON for **that run’s transactions only**. The CSV column set is a compact subset (e.g. date, description, amount, currency, category, status, memo) for quick review; it is **not** identical to the unified Dashboard CSV.

### Google Sheets

Connect under **Configuration → Google** (OAuth), choose a **source** result file and **target** spreadsheet, then sync. See **Google Sheets Sync** under the Configuration chapter. This is independent of the budget-app push below.

### Budget apps — push after each scrape

**Location:** `/?view=configuration&tab=budget-exports` (**Configuration → Budget exports**). The same panel is linked from **Configuration → Scrape** (post-scrape **Budget exports** teaser).

When enabled, the server runs **after each successful scrape** and sends **transactions from that run** to the destinations you configure. Only rows that are **completed**, **not ignored**, and **not internal transfers** are sent (pending, ignored, and internal-transfer rows are skipped).

**Shared setup**

1. Enable **Export after scrape** for each app you use, then **Save toggles & account maps**.
2. **Account map (JSON):** Keys are `provider:accountNumber` strings matching accounts in this app. Values are the **destination account identifiers** required by that product (see each subsection).
3. **Credentials / OAuth** are saved in the UI; secrets persist under `DATA_DIR/config/budget_export_secrets.json` and are **not** stored inside the general scrape JSON files.

**Firefly III**

*   In Firefly, create a **Personal Access Token**. In Budget exports → Firefly, set **base URL** (e.g. `https://firefly.example.com`) and token, then **Save credentials**.
*   Map each `provider:accountNumber` to a Firefly **asset account id**. Withdrawals use the asset as `source_id`; deposits use it as `destination_id`. Optionally set **expense account name** for withdrawals.

**Lunch Money**

*   Create a **developer / API token** in Lunch Money. Save it under Budget exports → Lunch Money.
*   Map each local account key to a Lunch Money **asset_id** (integer, stored as a string in the map).

**YNAB (You Need A Budget)**

*   Register a **YNAB OAuth application**. The **redirect URI** must match your server exactly (path `/api/budget-export/ynab/callback` — e.g. `http://127.0.0.1:3000/api/budget-export/ynab/callback` locally, or your HTTPS URL in production; same scheme/host/port as in the YNAB developer settings).
*   Enter OAuth client id, secret, and redirect in the YNAB card, **Save OAuth app settings**, then **Connect with YNAB** to complete authorization.
*   Set **Budget id** (UUID of the YNAB budget). Map each `provider:accountNumber` to the YNAB **account id** for that budget.

**Actual Budget**

*   Provide your **Actual server URL**, account **password**, and **budget sync id** from the Actual app. Save under Budget exports → Actual.
*   Map each local key to an **Actual account id**.

If a destination is disabled, lacks credentials, or has no account mapping for a transaction’s account, those rows are skipped and the scrape run log records the outcome.

---

## 3. Scrape Workspace
**Location:** `/?view=scrape`

The Scrape workspace is where you connect to your banks and pull new financial data.

### How to use the Scrape Workspace:
*   **Start a New Scrape:** Select your bank or credit card provider profiles, define the date ranges (e.g., last 30 days), and start a manual scrape. The automated browser will fetch your new data.
*   **Manage Profiles:** Create and save different profiles for each of your bank accounts or credit cards. The form will display saved profiles with their provider icons. Simply select a profile and click "Start Scrape" without needing to re-enter credentials every time.
*   **Import Data Manually:** If you prefer not to use the automated browser or your bank is unsupported, use **Import** in the Results Explorer to upload files exported from your bank or card issuer (see **Importing files** below).
*   **View Scrape Progress:** Watch the live console footprint of the headless browser during a scrape to see exactly what the scraper is doing.
*   **Explore Results:** Check the Results Explorer to see the data files and logs saved from your previous scraping sessions.

### Importing files

Use **Scrape → Results Explorer → Import** to bring in **Excel (XLS/XLSX)**, **PDF**, or **JSON** scrape/result files **without** running the browser scraper.

**Typical import flow**

1. Click **Import** and select one or more files.
2. Optionally choose **Import as** — pick an existing **provider + account** from your transaction history. This improves **format detection** and sets the **account number** on each imported row.
3. If the layout is not covered by a built-in parser, you can attach a **custom tabular import format** (JSON you created in the import format builder; see below).
4. Click **Preview import** to run the parser (deterministic or format-driven). Review every row in the preview table; edit cells if needed.
5. Click **Save to library** to merge the batch into your unified transactions.

The same **preview** step is used whether or not AI parsing is involved.

> **Warning — “Use AI for parsing”**  
> When **Use AI for parsing** is enabled, **Gemini** interprets the document. The model can misread columns, dates, amounts, currencies, or row boundaries. **Always double-check** the preview table, spot-check totals against your source file, and correct mistakes before saving. Prefer **deterministic** parsers or a **custom import format** when your bank exports a consistent spreadsheet layout.

**Deterministic parsers (tested / first-class)**

*   **Isracard** — **Excel** exports whose sheet matches the **פירוט עסקאות** style (Hebrew column headers such as תאריך רכישה, שם בית עסק, סכום חיוב), and **PDF** monthly card statements where text extraction exposes the standard line layout (voucher, amounts, merchant, date). Filename patterns like `1254_MM_YYYY.xlsx` / `.pdf` are used to infer the card’s last four digits when present. **Amount signs:** after reading signed numbers from the file, the built-in Isracard importer **multiplies every amount by −1**, the same as a **custom tabular import format** with **Flip amount signs** enabled (`negateParsedAmounts: true`), so mixed positive/negative cells are all inverted consistently.
*   **Mizrahi Tefahot** — **Excel** exports that match the bank’s Hebrew account-movement layout (e.g. מספר חשבון, תאריך, סוג תנועה, זכות / חובה).

Other spreadsheets and PDFs fall back to **generic** line/table heuristics; quality varies by bank. If a file does not match a dedicated format, use a **custom import format** or, as a last resort, **Use AI for parsing** (requires a configured Gemini API key) — and follow the warning above.

### Creating a custom import format (tabular)

For **Excel** layouts that are not Isracard/Mizrahi, build a **versioned JSON import format** that maps columns to transaction fields.

**How to open the builder**

*   From **Results Explorer → Import**, follow the UI link to **create or edit** an import format, **or**
*   Open the app at **`/?view=importProfile`** (Import format page).

**What you configure**

*   Upload a **sample workbook**, choose the **sheet**, and set the **header row** (1-based in the UI; the JSON stores a 0-based index).
*   Map **date**, **description**, **original amount**, **charged amount**, **charged currency**, and optionally **original currency** to the correct columns. The UI shows a **mapped data preview** of raw cell text for those columns.
*   **Optional column mappings** can fill `Transaction` fields such as memo, voucher number, external id, category, etc.
*   **Advanced:** Date format (e.g. `DD.MM.YY`), rows to skip after the header, optional **footer stop** markers (stop importing when the first column matches), **provider id**, sheet name filter, **amount polarity filter** (keep only income-like or expense-like rows after sign handling), and **Flip amount signs** — when enabled, each parsed amount is multiplied by **−1** (invert sign); when disabled, signs follow the spreadsheet exactly (including mixed positive/negative rows).
*   **Run test** runs the same parsing code as the server on your sample file and shows a short **transaction preview** plus any diagnostic logs.

**Saving and using the format**

*   **Save import format** produces JSON (`format: tabular-import-profile`). Keep this file for reuse.
*   In **Import**, attach that JSON when uploading spreadsheets so rows are parsed with your mapping.

**Note:** The import format builder reads workbooks with **formatted** cell values so amounts match what you see in Excel; this avoids common sign mismatches between on-screen numbers and raw cell storage.

### Transaction fields: `externalId` vs `voucherNumber` vs `sourceRef` (for support answers)

Use this when users ask what to map from a bank/card export or how these three differ on each **transaction** row:

| Field | Purpose | Id / hashing |
|--------|---------|----------------|
| **`externalId`** | A **stable institution reference** (אסמכתא, bank reference, etc.) that should mean “the same real-world transaction” when re-importing. | When present, the app can derive the internal **`id`** from `provider` + `accountNumber` + `externalId` (external key), instead of hashing only date/amount/description. |
| **`voucherNumber`** | **Human-visible voucher metadata** — e.g. Isracard **שובר** text from an **export**. Keeps the reference on the row for display and matching notes. | **Not** the primary driver for transaction **`id`** in the same way as `externalId`. Prefer this for שובר when the docs say scraper vs export identifiers may differ. |
| **`sourceRef`** | **Technical provenance** — e.g. `tabular-import` after spreadsheet import, or `import:ai-document` after AI parsing. Tells **where the row came from** in the pipeline. | **Never** used in transaction id hashing. Users normally **do not** map a spreadsheet column to this; the backend sets it. |

**Hebrew shortcuts for the assistant:** **externalId** — מזהה יציב מהמוסד לזיהוי אותה עסקה בייבוא חוזר; **voucherNumber** — מספר שובר / טקסט שובר לתצוגה ומטא-דאטה; **sourceRef** — מקור טכני של הרשומה (ייבוא/סריקה), לא לשימוש כמזהה עסקה על ידי המשתמש בפורמט ייבוא.

---

## 4. Configuration Panel
**Location:** `/?view=configuration`

This is the control center of the app. It holds all automations, rules, AI prompts, and integrations.

**Tabs** include **AI** (and memory), **Categories**, **Insight rules**, **Scheduler**, **Scrape** (fraud & alerts), **Google** (OAuth, Sheets, Drive), **Budget exports**, **Telegram**, and **Maintenance**. Deep links: `?view=configuration&tab=<id>` (e.g. `tab=insight-rules`, `tab=sheets`, `tab=budget-exports`).

### 4.1 AI Settings
**Location:** `/?view=configuration&tab=ai`

*   **Model Selection:** Choose whether the AI should use a local, faster model for basic auto-categorization or a slower, deeper "Analyst" model for chat and insights.
*   **Language Selection:** Set the primary language for AI interaction (e.g., English or Hebrew).
*   **Categories Management:** Add, delete, or rename the custom budget categories you want the AI to use.
*   **Bulk Recategorization:** A powerful tool with a single button to force the AI to re-evaluate all past transactions and apply your newest custom categories retroactively.
*   **AI persona (user alignment):** A structured profile—household, housing, technical comfort, cards and charge days, income schedules, goals, savings targets, and how you want analyst answers styled (communication style, reporting depth). You can fill it manually or use onboarding / “extract from narrative” so Gemini proposes fields from free text. Use **Include persona in analyst prompts** to send this profile with **unified** analyst chat (the indigo FAB on any main tab), or turn it off to keep transaction-only prompts while still saving your persona for later.

### 4.2 AI Memory Settings
**Location:** `/?view=configuration&tab=ai` (open the **AI memory** section inside **Configuration → AI**; legacy link `tab=memory` opens the same tab)

The AI keeps a **server-side memory** the unified analyst loads on each chat turn.

*   **Stored AI facts (memory facts):** Persistent lines in the database—long-lived context the model should assume is true until you edit them (budget rules, dates, preferences). You manage them in the Facts list. The analyst’s structured replies can **append** new fact lines when they are not duplicates of existing ones. These are **not** the same as the short **summary bullets** Gemini may show after **persona extraction** from a narrative; those bullets are a readout of what was inferred and are **not** automatically copied into stored memory facts unless you add them yourself.
*   **Retention Days:** Set how many days the app should keep Insights and Alerts before pruning them (facts are edited or cleared explicitly).
*   **Insights:** Analytical takeaways from past analyst replies (with scores). Delete an insight if you want that topic reconsidered from scratch.
*   **Alerts:** Time-sensitive or high-priority items with scores; dismissing an alert blocks the same text from being stored again.

### 4.2.1 Insight rules (bilingual rules engine)
**Location:** `/?view=configuration&tab=insight-rules` (dedicated **Insight rules** tab under **Configuration**).

Insight rules are **deterministic**: the server evaluates conditions against your stored transactions (no LLM call when a rule fires). Each rule has **two message strings**—English and Hebrew—so the dashboard and APIs can show the right language. You can use placeholders in the text: `{{sum}}`, `{{count}}`, and `{{category}}` (filled when the rule matches).

*   **Visual builder (default):** **Add rule** opens an **If / Then** editor: choose **scope** (current month, all time, or last N days), add one or more **IF** conditions (expense total vs a threshold, transaction count, or “there exists a transaction where…”), combine them with **All (AND)** or **Any (OR)**, then set **Then** (insight or alert, score 1–100, English and Hebrew messages). An optional **strategy** note is stored as `description` in the definition. A **Rule summary** panel reflects the same logic in plain language. The UI follows your language direction (including RTL for Hebrew).
*   **Advanced JSON:** Expand **Advanced: JSON (v1)** to view or edit the raw **definition** object. If your rule uses structures the visual form cannot represent (for example nested `not` or complex trees), the app switches to JSON-only editing for that rule until you simplify it. Saving uses the form when you have not edited the JSON; if you change the JSON, that text is what gets saved (after validation).
*   **What a rule contains:** A JSON **definition** (version 1) with:
    *   **scope:** `current_month`, `all`, or `last_n_days` (with `lastNDays` when using the last option).
    *   **condition:** A tree of logical operators (`and`, `or`, `not`), plus building blocks such as totals over expenses (`sumExpensesGte` / `sumExpensesLte`), transaction counts (`txnCountGte`), or “at least one transaction matches” (`existsTxn` with per-transaction checks like category, memo/description contains text, account, amount thresholds, etc.).
    *   **output:** `kind` (`insight` or `alert`), **score** (1–100 for ranking next to AI insights), and **message** `{ "en": "...", "he": "..." }`.
*   **Creating and editing:** Use **Add rule** for the visual builder, or **Suggest with AI** (requires a configured Gemini API key) to describe the rule in plain language; the app inserts a draft you can refine in the form or JSON before saving. AI-suggested drafts are saved with **source** “AI” and can start disabled until you enable them.
*   **Test:** **Test rule** (while editing a saved rule) runs the rule against the current full transaction set and shows the rendered bilingual messages (or “no match”).
*   **Re-evaluate rules:** **Re-evaluate rules** recomputes which rules match and updates **rule fires** (deduplicated per rule and time bucket). The dashboard’s top-insights request also triggers this refresh.
*   **Export / import:** **Export JSON** downloads a file with `format` `financial-overview-insight-rules` and `version` 1. **Import** accepts that document; choose **merge** (upsert by rule id) or clear-and-replace by turning merge off.
*   **How this differs from AI memory insights:** Rule matches are stored in **`insight_rule_fires`**, not in the AI chat insight list. Retention settings for AI memory **prune** chat insights/alerts; they do not delete your **rule definitions**—only individual rule-fire rows when you dismiss them from the dashboard or when rules no longer match.

### 4.3 Scheduler Settings
**Location:** `/?view=configuration&tab=scheduler`

Automate your scrapes so you don't have to launch them manually.
*   **Enable/Disable Automation:** Toggle the entire scheduler system on or off.
*   **Schedule Configuration (Cron):** Define the exact times and frequencies for automatic scrapes using a standard Cron expression (e.g., every day at 2 AM).
*   **Profile Selection:** Check boxes for which saved bank profiles should be included in the automated run.
*   **Backup Destination:** Decide if the automated scheduler should save a backup of your database locally or straight to Google Drive after scraping.

### 4.4 Scraper Settings
**Location:** `/?view=configuration&tab=scrape`

Adjust the low-level behavior of the scraping engine and what happens immediately after a scrape finishes.
*   **Global Options:**
    *   **Show Browser:** Toggle on to make the automated browser visible during scrapes (useful for debugging 2FA or captchas).
    *   **Verbose Logging:** Keep detailed footprints of the scraper's actions.
    *   **Combine Installments:** Automatically sum up parts of installment payments into one clean record.
    *   **Timeout:** The maximum time (in milliseconds) the scraper will wait for a bank page to load before giving up.
    *   **Future Months:** Look ahead and scrape future credit card charges.
    *   **Smart Start Date:** Automatically calculate how far back to scrape based on your last successful run to prevent overlaps and save time.
    *   **Opt-In Features:** Check specific bank-related hacks (e.g., treating certain Mizrahi or Isracard transactions differently based on missing identifiers).
*   **Post-Scrape Actions:**
    *   **Run Categorization:** Automatically pass new data to the AI to categorize immediately.
    *   **Fraud Detection:** Toggle whether fraud detection should run locally, via AI, or both. Choose its scope (Current run vs. All historical data), and specify if it should notify you.
    *   **Custom AI Query:** Instruct the app to ask the AI extra analysis questions specifically on the new batch of data.
    *   **Telegram Notification Aggregate:** Send a single bundled message to Telegram instead of many small ones.
    *   **Spending Digest:** Send a comprehensive spending digest to your notifications channels.
    *   **Transaction Review Reminders:** Automatically notify you if there are uncategorized transactions or transfer movements that need your manual review.
    *   **Notification Channels:** Select where post-scrape updates are sent (e.g., Telegram).

### 4.5 Fraud Settings
**Location:** `/?view=configuration&tab=scrape` (Fraud & Alerts section below Scrape options)

Detailed settings for the local Fraud Detection engine.
*   **Fraud Mode:** Choose between 'Local' rules, 'AI' rules, or 'Both'.
*   **Local Rules Toggles:** Turn on specific mathematical detectors, such as: Outlier Amount (huge uncharacteristic expenses), New Merchant, Non-Hebrew new merchant, Rapid Repeats (same charge multiple times in an hour), and block Foreign Currency anomalies.
*   **Thresholds Configuration:** Deeply tune the rules. Set the exact minimum foreign currency amount required to trigger an alert, adjusting Z-score limits for outliers, or score severity minimums for Low, Medium, and High alerts. Choose whether to notify only on Medium+ alerts.
*   **Test Transaction:** A built-in sandbox feature. Enter a dummy transaction amount and fake history to see mathematically how the system scores it before deploying changes.
*   **Recent Findings:** A chronological list of recent fraud flags for your review.

### 4.6 Google Sheets Sync
**Location:** `/?view=configuration&tab=sheets`

Export categorized data seamlessly to the cloud.
*   **Connect/Disconnect Google Account:** OAuth login to tie the app directly to your Google identity.
*   **Source Selection:** Select exactly which scraped batch file you want to sync.
*   **Target Spreadsheet:** Choose an existing Google Sheet in your Drive from a dropdown, or click the plus button to create a brand new spreadsheet formatted perfectly for the app.
*   **Manual Sync Button:** Force a sync push to send your records instantly.

### 4.7 Telegram Settings
**Location:** `/?view=configuration&tab=telegram`

Link a Telegram chatbot to your app to receive daily digests or control it remotely.
*   **Bot Status Panel:** See if the bot daemon is currently running. Start or stop the bot with action buttons.
*   **Bot Language:** Select whether the Telegram bot chats with you in English or Hebrew.
*   **Bot Token Input:** Secure field to input the API token provided by Telegram's `@BotFather`. Use the 'Test Connection' button to ensure the token is valid.
*   **Users Management:** The bot is strictly private. Add your specific Telegram User ID to the "Allowed Users" whitelist here to grant access. Toggle checkboxes per user to allow chat interactions and/or receive automated notification broadcasts.
*   **Download User Manifest:** Export the whitelist setup for backup purposes.

### 4.8 Runtime settings (`runtime-settings.json`)
Values persist under your data folder (`data/config/runtime-settings.json`). The UI is split by topic:
*   **Configuration → AI:** Gemini API key.
*   **Configuration → Google:** OAuth Client ID, Client Secret, redirect URI, optional default Drive folder ID (`DRIVE_FOLDER_ID`).
*   **Configuration → Maintenance:** Server **port** and **data directory** (`PORT`, `DATA_DIR`).
*   **Save & restart:** Many changes require a backend restart to take effect.

### 4.9 System Maintenance
**Location:** `/?view=configuration&tab=maintenance`

**Port** and **data directory** (`PORT`, `DATA_DIR`) are edited here (same persistence as `runtime-settings.json`; environment variables override when set).

*   **Backup scopes:** When creating a backup, you can limit which **scopes** (data areas) are included. When restoring from **local**, **Drive**, or an **uploaded** snapshot file, you can align **restore scope** with what the snapshot contains; review the **summary** before confirming.
*   **Create Local or Drive Backup:** Snapshot to your chosen scopes (full snapshot if you select everything).
*   **Restore Local/Drive/Upload:** Pick a backup, review scope summary, then restore.
*   **Download Local Backup:** Download a portable backup file.
*   **Upload Backup File:** Parse and restore from a snapshot file on disk.
*   **Reload Database:** Reload datasets from disk without a full reset.
*   **Reset All Data:** Erases AI memory, transactions, categories, and config as implemented by the reset action.
*   **Windows desktop app (Electron only):** On **Configuration → Maintenance**, a **Windows desktop app** card appears only when the UI runs inside the desktop shell (`FinancialOverview.exe`). It is **not shown** for browser-only sessions or the portable `launch-FinancialOverview.cmd` flow. The card offers **Close to tray**: keep the **Node server** running when you close the main window so **scheduled scrapes** and **Telegram** continue; use **Quit (stop server)** from the tray to exit fully. The same setting exists in the first-run dialog and tray menu.
*   **GitHub release check:** If the client was built with a GitHub repository id, the app can compare the current build to the **latest GitHub release** and link to the release page.
*   **Clear browser site data:** Clears site storage for this origin (client cache/session storage) if you need a clean client state.

### 4.10 Google Cloud OAuth — Drive & Sheets (optional)

Connecting Google is **optional**. It enables **Google Sheets sync**, **Google Drive backups**, and related exports. Scraping, the dashboard, and Gemini AI features work without it. The setup is **somewhat involved**—you can skip it and add credentials later under Configuration.

**How to obtain OAuth credentials (summary):**

1. **Google Cloud Console** — Create a new project (project menu → New Project).
2. **Enable APIs** — *APIs & Services* → *Library*: enable **Google Drive API** and **Google Sheets API**.
3. **OAuth consent screen** — *APIs & Services* → *OAuth consent screen*. Choose **External** (typical for personal use), fill app name and contact emails; you can use defaults for Scopes and Test users on first setup.
4. **OAuth client** — *Credentials* → Create **OAuth client ID** → type **Web application**. Under **Authorized redirect URIs**, add the exact callback URL your server uses. Default pattern: `http://127.0.0.1:<PORT>/api/auth/google/callback` where `<PORT>` matches your server (often `3000`). If you browse the app as `http://localhost:...`, register that host too—Google requires an exact match. Copy **Client ID** and **Client Secret** into **Configuration → Google** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and set `GOOGLE_REDIRECT_URI` to the same URI you registered.
5. **Unverified app warning** — For a personal project, Google may show *Google hasn't verified this app*. Use **Advanced** → **Go to … (unsafe)** to proceed.

**Drive folder ID:** Optional `DRIVE_FOLDER_ID` is the id from a folder URL (`/folders/<id>`). You can also choose a folder in the app after signing in.

The in-app **Help** (`GUIDE.html`) includes a full *Google Drive & Sheets* walkthrough.

---

## 5. System Logs
**Location:** `/?view=logs`

The Logs Viewer helps you debug issues, verify automation success, and see what the AI is thinking behind the scenes.

*   **Server Logs (`/?view=logs&logType=server`):** Review internal backend logs and API errors. Look here if settings fail to save.
*   **Client Logs (`/?view=logs&logType=client`):** Review front-end user interface activity. Useful if a button click fails on screen.
*   **AI Logs (`/?view=logs&logType=ai`):** See transparently what prompts were generated and sent to Gemini, and read precisely how it responded to categorization requests.
*   **Scrape Logs (`/?view=logs&logType=scrape`):** A full historical console log left by the headless browsers attempting bank logins. Look here if your bank refuses to connect.
*   **Log Filtering:** Use the settings gear to filter by severity ranges (e.g., only show Errors), choose how many lines to fetch on screen, or clear outdated logs from your database instantly.

---

## 6. Security & encryption (at rest)

- **Saved bank profiles:** Under `data/profiles/`, the **`credentials`** field for each profile is encrypted with **AES-256-GCM**. The encryption key is derived from your **app lock password** using **scrypt** (see `data/security/app-lock.json` for salts and verification hash—the password itself is not stored).
- **While locked:** Encrypted profile secrets are not decrypted for the UI until you unlock.
- **Not encrypted by the app:** Gemini and OAuth secrets in `runtime-settings.json`, Telegram and other JSON config, the **SQLite** database (`app.db` with transactions and AI memory), and scrape **results** files. Protect the entire **`DATA_DIR`** with operating-system access controls and optional full-disk encryption.
- **Backups:** Snapshots include the same on-disk layout (encrypted profile blobs remain ciphertext; other files as stored).

### Threat model (who can see what)

- **Best practice:** **Unlock** only when you need to **scrape** or **edit saved profiles**, then **lock again**—shortest time with the key in memory. When **locked**, the app does not return decrypted bank passwords via the API; copying `data/profiles/` still yields ciphertext (offline guessing possible).
- **Without app lock:** Profile files may use a **fixed fallback key** from source—anyone who can read `data/profiles/` may recover credentials. **With app lock:** an attacker needs your **password**, an **unlocked** session, or offline cracking of stolen ciphertext.
- **Remote access:** Prefer **TLS** (reverse proxy) when the UI is reachable beyond `127.0.0.1`; avoid exposing the service unnecessarily.
- **Transactions and API keys:** **`app.db`**, **`data/results/`**, and config JSON are **not** hidden by app lock from someone with **filesystem access** to your data folder—only **disk/OS** protections help.

---

## 7. Quick troubleshooting

*   **“Server unreachable” / blank data:** Confirm the server process is running; open `GET /api/health` on the same host and port as the UI. After changing `PORT` or `DATA_DIR`, restart the server.
*   **Scrape or bank errors:** See **Logs → Scrape** and increase **timeout** in **Configuration → Scrape** if pages are slow.
*   **Google OAuth / Sheets:** Re-authorize under **Configuration → Google** if the session expired.
