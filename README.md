# Dockerized Israeli Bank Scraper

This application allows you to scrape financial data from Israeli banks and credit cards, upload the results to Google Drive, and manage it all via a REST API, CLI, or a modern Web UI.

**Now support Home Assistant Add-on mode!**

## Features
- **Multi-language Support**: Full support for English and Hebrew (LTR/RTL).
- **Secure OAuth2 Integration**: Connect your Google account securely to save results directly to Sheets.
- **Dynamic Naming Patterns**: Customize your exports using patterns like `{profile}_{date}`.
- **Real-time Logs**: Watch the scraping process live via Socket.io.
- **Bulk Scraping**: Run multiple profiles at once.
- **Results Explorer**: View, download (CSV), or upload previous scrape results.

## Getting Started

### 1. Configuration
The application now prioritizes Environment Variables for configuration, making it easier to deploy in Docker and Home Assistant.
See [DEPLOYMENT.md](DEPLOYMENT.md) for full configuration details.

### 2. Standalone Deployment
#### Docker Compose
```bash
docker-compose up --build
```
Access UI at `http://localhost:3000`.

### 3. Home Assistant Add-on
1. Add this repository to your Home Assistant Add-on Store.
2. Install the "Israeli Bank Scraper" add-on.
3. Configure your OAuth credentials in the "Configuration" tab.
4. Start the add-on and open the Web UI.

## API Documentation
For detailed information on available endpoints, request payloads, and profile-based scraping, please refer to the:
👉 **[API Reference Guide (Swagger-style)](app/API.md)**

## Credits
Built with ❤️ and powered by the excellent [israeli-bank-scrapers](https://github.com/thefubot/israeli-bank-scrapers) library.
