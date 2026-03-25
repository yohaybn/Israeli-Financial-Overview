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
| `APP_SECRET` | Secret key for encrypting sensitive data | `bank-scraper-secret...` |

### Application Structure

The project is structured into two main components:
- `/app`: The standalone Node.js application.
- `/ha-addon`: Home Assistant Add-on configuration and startup scripts.

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
2. The images must be named `ghcr.io/your-username/bank-scraper-docker-addon-{arch}`.

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
