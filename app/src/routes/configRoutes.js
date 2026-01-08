import express from 'express';
import fs from 'fs';
import path from 'path';
// Update import to include AI helpers
import { getSettings, saveSettings, getAuthConfig, OAUTH_CREDENTIALS_PATH, getAiConfig, saveAiConfig } from '../config.js';
import { getAvailableModels } from '../services/aiQueryService.js';
import { testConnection } from '../drive.js';

const router = express.Router();
const SERVICE_ACCOUNT_PATH = path.resolve('./service-account.json');

router.get('/settings', (req, res) => {
    const settings = getSettings();
    settings.folderId = process.env.DRIVE_FOLDER_ID || '';

    // Mask AI API Key
    if (settings.ai && settings.ai.apiKey) {
        // If it starts with iv:, it's encrypted. Mask it.
        // Even if plain text, mask it.
        settings.ai.apiKey = '********';
    }

    res.json(settings);
});

router.post('/settings', (req, res) => {
    // Separate AI config from general settings
    const { ai, ...otherSettings } = req.body;

    if (ai) {
        saveAiConfig(ai);
    }

    const current = getSettings();
    const updated = { ...current, ...otherSettings };
    saveSettings(updated);

    // Re-fetch to return consistent state (masked)
    const finalSettings = getSettings();
    if (finalSettings.ai && finalSettings.ai.apiKey) finalSettings.ai.apiKey = '********';

    res.json({ success: true, settings: finalSettings });
});

router.get('/models', async (req, res) => {
    try {
        const models = await getAvailableModels();
        res.json(models);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/drive', (req, res) => {
    const { serviceAccountJson, folderId } = req.body;

    if (!serviceAccountJson && !folderId) {
        return res.status(400).json({ success: false, error: 'Missing serviceAccountJson or folderId' });
    }

    try {
        if (serviceAccountJson) {
            fs.writeFileSync(SERVICE_ACCOUNT_PATH, serviceAccountJson);
        }

        if (folderId) {
            let envContent = '';
            if (fs.existsSync('.env')) {
                envContent = fs.readFileSync('.env', 'utf8');
            }

            if (envContent.includes('DRIVE_FOLDER_ID=')) {
                envContent = envContent.replace(/DRIVE_FOLDER_ID=.*/, `DRIVE_FOLDER_ID=${folderId}`);
            } else {
                envContent += `\nDRIVE_FOLDER_ID=${folderId}`;
            }

            fs.writeFileSync('.env', envContent);
            process.env.DRIVE_FOLDER_ID = folderId;
        }

        res.json({ success: true, message: 'Drive configuration saved.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/oauth', (req, res) => {
    const { clientId, clientSecret, tokens, folderId } = req.body;
    try {
        const config = {
            client_id: clientId,
            client_secret: clientSecret,
            tokens: tokens
        };
        fs.writeFileSync(OAUTH_CREDENTIALS_PATH, JSON.stringify(config, null, 2));

        if (folderId) {
            let envContent = '';
            if (fs.existsSync('.env')) {
                envContent = fs.readFileSync('.env', 'utf8');
            }
            if (envContent.includes('DRIVE_FOLDER_ID=')) {
                envContent = envContent.replace(/DRIVE_FOLDER_ID=.*/, `DRIVE_FOLDER_ID=${folderId}`);
            } else {
                envContent += `\nDRIVE_FOLDER_ID=${folderId}`;
            }
            fs.writeFileSync('.env', envContent);
            process.env.DRIVE_FOLDER_ID = folderId;
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/test', async (req, res) => {
    const { serviceAccountJson, folderId } = req.body || {};

    if (!serviceAccountJson && !req.body) {
        return res.status(400).json({ success: false, error: 'Request body missing' });
    }

    let authConfig = null;
    let targetFolder = folderId;

    if (serviceAccountJson) {
        try {
            authConfig = JSON.parse(serviceAccountJson);
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Invalid JSON in serviceAccountJson' });
        }
    } else {
        authConfig = getAuthConfig();
        if (!targetFolder) {
            targetFolder = process.env.DRIVE_FOLDER_ID;
        }
    }

    if (!authConfig || !targetFolder) {
        return res.status(400).json({ success: false, error: 'Missing configuration (Service Account or Folder ID).' });
    }

    try {
        const result = await testConnection(authConfig, targetFolder);
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// End of file


export default router;
