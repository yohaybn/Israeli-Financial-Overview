# 🚀 Israeli Bank Scraper API Reference

Detailed documentation of all active endpoints in the scraper service.

## 🏦 Scraping Endpoints

### `POST /scrape`
Execute a **single** scraper run for a specific bank or card. This endpoint supports both real credentials and test mode.

**Request Body (By Credentials):**
```json
{
  "companyId": "poalim",
  "credentials": { "username": "user", "password": "pass" },
  "startDate": "2024-01-01",
  "useTestData": false
}
```

**Request Body (By Profile):**
```json
{
  "profileName": "MyProfile",
  "key": "master-decryption-key",
  "startDate": "2024-01-01"
}
```

**Parameters:**
- `companyId`: *(Required if no profile)* The bank/card identifier (e.g., `poalim`, `leumi`, `isracard`).
- `credentials`: *(Required if no profile)* Object containing account credentials.
- `profileName`: *(Required if using profile)* Name of a saved profile to use keys/creds from.
- `key`: *(Required if using profile)* The master key to decrypt the saved profile.
- `startDate`: *(Optional)* Start date for scraping (ISO format). Defaults to 30 days ago.
- `useTestData`: *(Optional)* `true` to load mock data instead of connecting to the bank.
- `saveToSheets`: *(Optional)* `true` to save results to Google Sheets.
- `format`: *(Optional)* `json` (default) or `csv`.

---

### `POST /scrape-all`
Execute a **bulk** scrape for ALL saved profiles. Useful for nightly cron jobs.

**Request Body:**
```json
{
  "key": "master-decryption-key",
  "startDate": "2024-01-01",
  "saveToSheets": true
}
```

**Parameters:**
- `key`: *(Required)* The master key to decrypt all profiles.
- `startDate`: *(Optional)* Start date for scraping (ISO format).
- `saveToSheets`: *(Optional)* `true` to save results to Google Sheets.
- `useTestData`: *(Optional)* `true` to use test data for all profiles.
- `format`: *(Optional)* `json` (default) or `csv`.

---

## 📂 Results & Integrations

### `POST /upload-result`
Upload JSON data directly to Google Sheets.

**Request Body:**
```json
{
  "filename": "My_Sheet_Name",
  "type": "sheet",
  "data": [ { "date": "2024-01-01", "amount": -100, "description": "ATM" } ]
}
```

**Parameters:**
- `data`: *(Required)* JSON array of transaction objects to upload.
- `filename`: *(Required)* Name for the created Google Sheet.
- `type`: *(Required)* Must be `sheet`.

---

## ⚙️ Configuration & Metadata

### `GET /definitions`
Returns the list of all supported scrapers and their required fields.

**Response:**
```json
[
  { "id": "poalim", "name": "Bank Hapoalim", "loginFields": ["userCode", "password"] },
  ...
]
```

### `GET /profiles`
Returns a list of all saved profile names (without credentials).

---

## ⚠️ Notes
- **Test Mode**: When `useTestData` is true, no real connection is made. Data is loaded from local mock files.
- **Security**: Logs automatically mask sensitive fields like passwords and keys.
