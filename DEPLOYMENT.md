# Deployment Guide

## Configuration

The application is configured using Environment Variables. These take precedence over any JSON configuration files (`settings.json`, `oauth-credentials.json`).

### Essential Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server listening port | `3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | - |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | `http://localhost:3000/api/auth/google/callback` |
| `DRIVE_FOLDER_ID` | Google Drive folder ID for uploads | - |
| `GEMINI_API_KEY` | Google AI (Gemini) API key for categorization, chat, and related features | - |

### Application Structure

The project includes:
- **`Dockerfile.app`**: Multi-stage image for the standalone app (GHCR / docker-style deploy).
- **`Dockerfile`**, **`config.yaml`**, **`run.sh`**, **`build.yaml`** at the **repository root**: Home Assistant Supervisor builds the add-on from the **full repo** as context (install the entire clone under `/addons/<name>/`).

## Security & encryption (at rest)

**Encrypted by the app**

- **Bank profile credentials** — JSON files under `<DATA_DIR>/profiles/`. Only the **`credentials`** payload is encrypted (**AES-256-GCM**: IV, authentication tag, and ciphertext stored as hex, colon-separated). Encryption uses a **32-byte key** derived from the **app lock password** via **scrypt** (parameters and salts live in `<DATA_DIR>/security/app-lock.json`). The plaintext password is **never** written to disk.
- **Unlock session** — The derived key exists **in memory** while the app is unlocked; restarting the server clears it until you unlock again.

**Not encrypted at the application layer**

- **API keys** (e.g. Gemini), **OAuth** client id/secret, **Telegram bot token**, scheduler and other JSON under `<DATA_DIR>/config/` (including `runtime-settings.json`).
- **SQLite** database (`app.db`) — transactions, categories cache, fraud findings, AI memory tables, etc.
- **Scrape results** and related folders under `<DATA_DIR>/`.

Protect **`DATA_DIR`** with filesystem permissions and, if needed, **volume/disk encryption**. For remote access, terminate **TLS** at a reverse proxy; the Node server typically listens on **plain HTTP** on `PORT`.

### Threat model (credentials vs. local access)

See **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)** for the full narrative. Short summary:

- **Saved bank credentials:** Without **app lock**, the server may encrypt profiles with a **fixed fallback key** from source—**not** secret. With **app lock**, ciphertext needs your **password** or an **unlocked** / **compromised** runtime.
- **Transactions, results, API keys:** **SQLite**, scrape folders, and JSON config under `<DATA_DIR>` are **plaintext at the app layer**. Anyone who can read that directory sees **financial history** and **secrets** regardless of app lock. Use **OS permissions**, **full-disk encryption**, and **TLS** when exposing the service beyond localhost.
- **Hardening credentials:** Prefer **unlock → scrape or edit profiles → lock again** so the derived key stays in memory only briefly. When **locked**, the server does not expose decrypted credentials via the API, but **disk copies** of `profiles/` are still ciphertext subject to offline guessing—see **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)**.

## Windows desktop (installer / portable folder)

The Windows **installer** (`FinancialOverview-Windows-Setup-<version>.exe` from electron-builder NSIS, built after `npm run windows:electron`) installs:

- **`FinancialOverview.exe`** — Electron desktop shell that starts the same **Node server** as the legacy launcher, loads the UI at `http://127.0.0.1:<port>/`, and shows a **system tray icon**. **Close to tray** (first-run dialog and **Configuration → Maintenance**) keeps the server running when you close the window so **scheduler** and **Telegram** keep working; use **Quit (stop server)** from the tray to exit fully. **Restart server** in Maintenance restarts the child process from the shell.
- **Browser or console workflows** — **`resources\open-browser.cmd`** and **`resources\launch-FinancialOverview.cmd`** are included; a legacy Inno-based build also added Start menu entries for them.

The **`windows-package.zip`** artifact is still a **portable Node tree** + **`launch-FinancialOverview.cmd`** (no Electron): you must **leave the console window open**; there is no tray.

**End-user install guide (GitHub Pages):** after Pages deploy, open **`https://<user>.github.io/<repo>/install/`** (e.g. with repository name `Israeli-Financial-Overview`: `/Israeli-Financial-Overview/install/`). Source: [`client/public/install/index.html`](client/public/install/index.html).

Maintainer build steps: [`packaging/windows/README.md`](packaging/windows/README.md) (`windows:package`, `electron:dist`; optional Inno).

### `financial-overview.json` (install folder)

Next to `server/` and `launch-FinancialOverview.cmd`, you can add **`financial-overview.json`** (see **`financial-overview.json.example`** in the repo). The server reads it at startup **before** resolving `DATA_DIR`. **OS environment variables still win** if set.

| Field | Maps to | Description |
|-------|---------|-------------|
| `port` | `PORT` | HTTP port (number). Used only if `PORT` is not already set in the environment. |
| `dataDir` | `DATA_DIR` | Absolute path or Windows path with `%VAR%` (e.g. `%APPDATA%\FinancialOverview\data`). Used only if `DATA_DIR` is not already set. |

### Environment variables

| Variable | Description | Typical default |
|----------|-------------|-----------------|
| `PORT` | HTTP port | `3000` |
| `DATA_DIR` | Database, `config/runtime-settings.json`, uploads | From `financial-overview.json` `dataDir`, or `./data` if unset |
| `NODE_ENV` | Set to `production` by the launcher | `production` |

Set variables in **System → Environment variables** or in a wrapper script before starting `launch-FinancialOverview.cmd`. The in-app **Configuration** and setup wizard still apply for OAuth, Telegram, Gemini, app lock, etc.

## Standalone Docker Deployment

To build and run the application using Docker Compose:

1. Use the root `docker-compose.yml` (or create your own with a `build` / `image` and a `./data:/data` volume). **Do not** put API keys or OAuth secrets in Compose `environment:`; configure them in the app (Configuration) or via `DATA_DIR/config/runtime-settings.json` after first run.

```yaml
services:
  app:
    image: ghcr.io/yohaybn/israeli-financial-overview-app:master
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
```

2. Run:
```bash
docker-compose up -d --build
```

## Home Assistant Add-on

To deploy as a Home Assistant Add-on:

### Prerequisites
1. You must publish the Docker images to GHCR (GitHub Container Registry).
2. The images must be named `ghcr.io/your-username/your-repo-name-addon-{arch}` (GitHub publishes lowercase, e.g. `ghcr.io/yohaybn/israeli-financial-overview-addon-{arch}`).

### Installation
1. Go to Home Assistant > Settings > Add-ons > Add-on Store.
2. Click the 3 dots (...) > Repositories.
3. Add the URL of this GitHub repository.
4. Refresh/reload the store.
5. Find "Financial Overview" and install it.

### Configuration
In the Add-on "Configuration" tab, fill in your Google OAuth details and Drive folder ID (optional: redirect URI and Gemini API key).

- `google_client_id`
- `google_client_secret`
- `drive_folder_id`
- `google_redirect_uri` (optional)
- `gemini_api_key` (optional; for AI features)

Start the add-on and open the Web UI from the sidebar.
