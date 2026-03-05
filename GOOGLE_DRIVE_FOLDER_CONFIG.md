# Google Drive Folder Configuration

## Overview

You can now configure a default Google Drive folder where all new spreadsheets created by the Bank Scraper will be automatically organized. This is useful for keeping your financial data organized in one place.

## Configuration Methods

### Method 1: Environment Variable (.env)

Add the following to your `.env` file:

```env
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
```

To get your folder ID:
1. Open [Google Drive](https://drive.google.com)
2. Create or navigate to your folder
3. Look at the URL: `https://drive.google.com/drive/folders/[FOLDER_ID_HERE]`
4. Copy the `FOLDER_ID_HERE` part

### Method 2: Web UI Configuration (Folder Browser)

1. Open the application in your browser
2. Click the Google Sheets settings (gear icon)
3. Navigate to the "Default Google Drive Folder" section
4. **Browse your Google Drive structure:**
   - Start with all root folders
   - Click on any folder to see its contents
   - Use breadcrumb navigation (Drive / Folder1 / Folder2) to navigate back
   - Each folder shows subfolders and files
5. **Select a folder:**
   - Click the "Select" button on the folder you want to use
   - The folder will be saved as your default organization folder
6. The configuration persists and will be used for all new spreadsheets

## How It Works

When you create a new spreadsheet:
1. The spreadsheet is created in your Google Drive
2. If a folder is configured (via `.env` or UI), the sheet is automatically moved to that folder
3. Subsequent syncs will upload data to existing sheets in that folder

## API Endpoints

### Get Folder Configuration
```
GET /api/sheets/folder-config
```

Response:
```json
{
  "success": true,
  "data": {
    "folderId": "your_folder_id",
    "folderName": "Bank Scraper Results"
  }
}
```

### Set Folder Configuration
```
POST /api/sheets/folder-config
Content-Type: application/json

{
  "folderId": "your_folder_id",
  "folderName": "Custom Folder Name"
}
```

### Clear Folder Configuration
```
DELETE /api/sheets/folder-config
```

### List Available Folders
```
GET /api/sheets/drive-folders
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "folder_id_1",
      "name": "Bank Scraper Results",
      "parents": ["drive_root_folder_id"]
    },
    ...
  ]
}
```

### List Folder Contents
```
GET /api/sheets/drive-folder-contents/:folderId
```

Response:
```json
{
  "success": true,
  "data": {
    "folders": [
      {
        "id": "subfolder_id_1",
        "name": "Q1 Reports"
      }
    ],
    "files": [
      {
        "id": "file_id_1",
        "name": "Transactions 2026-02",
        "mimeType": "application/vnd.google-apps.spreadsheet",
        "modifiedTime": "2026-02-10T15:30:00.000Z"
      }
    ],
    "allItems": [...]
  }
}
```

## Folder Browser Features

The web UI includes an interactive folder browser that allows you to:

- **Browse Hierarchy:** Navigate through your Google Drive folder structure
- **Breadcrumb Navigation:** View your current location with clickable breadcrumbs (Drive / Folder1 / Subfolder)
- **Go Back:** Click any breadcrumb to jump back to parent folders instantly
- **Quick Selection:** Click "Select" on any folder to set it as your default
- **Visual Indicators:** Selected folder is highlighted and confirmed at the bottom
- **Content Preview:** See all subfolders and files within each directory

### Step-by-Step Browser Usage

1. Open Google Sheets Settings in the app
2. Scroll to "Default Google Drive Folder" section  
3. You'll see a list of your root folders
4. Click on a folder name to browse into it
5. Use breadcrumbs at top to navigate back (e.g., Drive / MyFolder / Subfolder)
6. When you find your target folder, click the blue "Select" button
7. The folder will be immediately saved and highlighted

## Configuration Priority

The application uses this priority order for folder configuration:

1. **UI Configuration** (stored in `data/config/google_folder.json`)
   - Takes precedence when set
   - Set via the Google Settings UI with folder browser
   
2. **Environment Variable** (GOOGLE_DRIVE_FOLDER_ID)
   - Used as fallback if no UI configuration exists
   - Set in `.env` file

3. **No Configuration**
   - Spreadsheets are created in the root of your Google Drive

## Example Usage

### Docker Deployment

In your `.env` (or `docker-compose.yml` environment section):

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_secret_here
GOOGLE_DRIVE_FOLDER_ID=1a2b3c4d5e6f7g8h9i0j
```

### Storage Location

Folder configuration is stored at:
```
server/data/config/google_folder.json
```

This file contains:
```json
{
  "folderId": "1a2b3c4d5e6f7g8h9i0j",
  "folderName": "Bank Scraper Results"
}
```

## Features

✅ Auto-organize spreadsheets into configured folder
✅ Environment variable support for containerized deployments
✅ UI-based configuration for easy management
✅ Ability to switch folders without restarting
✅ Clear configuration when needed
✅ Fallback to system default if folder is deleted

## Troubleshooting

### "No folders found in Google Drive"
- Create a folder in Google Drive first
- Make sure you've authorized the application

### Folder not appearing in dropdown
- Refresh the page
- Check that both Google Drive and Google Sheets APIs are enabled
- Verify OAuth token is still valid

### Spreadsheet created but not in folder
- Check that the folder ID is correct
- Verify the folder hasn't been deleted
- Clear configuration and reconfigure via UI
