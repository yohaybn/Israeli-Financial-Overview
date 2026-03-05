import { Router } from 'express';
import { SheetsService } from '../services/sheetsService';
import { StorageService } from '../services/storageService';
import { google } from 'googleapis';
import { GoogleAuthService } from '../services/googleAuthService';

const router = Router();
const sheetsService = new SheetsService();
const storageService = new StorageService();
const googleAuthService = new GoogleAuthService();

// List spreadsheets (optionally filtered by folder)
router.get('/list', async (req, res) => {
    try {
        const { folderId } = req.query;
        const files = await sheetsService.listSpreadsheets(folderId as string);
        res.json({ success: true, data: files });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create a new spreadsheet
router.post('/create', async (req, res) => {
    try {
        const { name } = req.body;
        const result = await sheetsService.createSpreadsheet(name);
        res.json({ success: true, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sync transactions from a JSON file to a spreadsheet
router.post('/sync', async (req, res) => {
    try {
        const { filename, spreadsheetId } = req.body;
        if (!filename || !spreadsheetId) {
            return res.status(400).json({ success: false, error: 'filename and spreadsheetId are required' });
        }

        const result = await storageService.getScrapeResult(filename);
        if (!result || !result.transactions) {
            return res.status(404).json({ success: false, error: 'Scrape result not found or contains no transactions' });
        }

        try {
            await sheetsService.appendTransactions(spreadsheetId, result.transactions);

            // Update sync status in metadata
            result.lastSync = {
                timestamp: new Date().toISOString(),
                spreadsheetId,
                status: 'success'
            };
            await storageService.updateScrapeResult(filename, result);

            res.json({ success: true });
        } catch (error: any) {
            // Update sync status with error
            result.lastSync = {
                timestamp: new Date().toISOString(),
                spreadsheetId,
                status: 'failed',
                error: error.message
            };
            await storageService.updateScrapeResult(filename, result);
            throw error;
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get current folder configuration
router.get('/folder-config', async (req, res) => {
    try {
        const config = await sheetsService.getFolderConfig();
        res.json({ success: true, data: config });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set folder configuration
router.post('/folder-config', async (req, res) => {
    try {
        const { folderId, folderName } = req.body;
        if (!folderId) {
            return res.status(400).json({ success: false, error: 'folderId is required' });
        }
        await sheetsService.setFolderConfig({ folderId, folderName });
        res.json({ success: true, data: { folderId, folderName } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear folder configuration
router.delete('/folder-config', async (req, res) => {
    try {
        await sheetsService.clearFolderConfig();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// List folders in Google Drive (for folder selection)
router.get('/drive-folders', async (req, res) => {
    try {
        const auth = await googleAuthService.getClient();
        if (!auth) {
            return res.status(401).json({ success: false, error: 'Not authenticated with Google' });
        }

        const drive = google.drive({ version: 'v3', auth });
        const response = await drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
            fields: 'files(id, name, parents)',
            pageSize: 100,
            orderBy: 'modifiedTime desc'
        });

        res.json({ success: true, data: response.data.files });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get files and folders in a specific Google Drive folder
router.get('/drive-folder-contents/:folderId', async (req, res) => {
    try {
        const { folderId } = req.params;
        const auth = await googleAuthService.getClient();
        if (!auth) {
            return res.status(401).json({ success: false, error: 'Not authenticated with Google' });
        }

        const drive = google.drive({ version: 'v3', auth });
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType, modifiedTime)',
            pageSize: 100,
            orderBy: 'name'
        });

        // Separate folders and files
        const items = response.data.files || [];
        const folders = items.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
        const files = items.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

        res.json({ 
            success: true, 
            data: {
                folders,
                files,
                allItems: items
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export const sheetsRoutes = router;
