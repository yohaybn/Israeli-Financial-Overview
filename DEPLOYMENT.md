# Deployment Guide

## Configuration

The application is configured using Environment Variables. These take precedence over any JSON configuration files (`settings.json`, `oauth-credentials.json`).

### Essential Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server listening port | `3000` |
| `OAUTH_CLIENT_ID` | Google OAuth Client ID | - |
| `OAUTH_CLIENT_SECRET` | Google OAuth Client Secret | - |
| `OAUTH_REDIRECT_URI` | OAuth Redirect URI | `http://localhost:3000/oauth2callback` |
| `DRIVE_FOLDER_ID` | Google Drive folder ID for uploads | - |
| `APP_SECRET` | Reserved for Home Assistant add-on wiring; **not used by the current server for encryption** | - |

### Application Structure

The project is structured into two main components:
- `/app`: The standalone Node.js application.
- `/ha-addon`: Home Assistant Add-on configuration and startup scripts.

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

The Windows package is a normal **Node production tree** plus a **bundled `node.exe`** (see `packaging/windows/package.ps1`). The server listens on **`PORT`** (default **3000**) and stores SQLite and runtime settings under **`DATA_DIR`**.

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

1. Create a `docker-compose.yml` (or use the one provided, ensuring it points to `app/Dockerfile`):

```yaml
version: '3'
services:
  bank-scraper:
    build: 
      context: ./app
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - OAUTH_CLIENT_ID=your_id
      - OAUTH_CLIENT_SECRET=your_secret
      - DRIVE_FOLDER_ID=your_folder_id
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
In the Add-on "Configuration" tab, fill in your Google OAuth details and Drive Folder ID.
- `oauth_client_id`
- `oauth_client_secret`
- `drive_folder_id`

Start the add-on and open the Web UI from the sidebar.
