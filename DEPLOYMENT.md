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
