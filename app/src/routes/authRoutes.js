import express from 'express';
import fs from 'fs';
import { generateAuthUrl, getToken } from '../drive.js';
import { getAuthConfig, OAUTH_CREDENTIALS_PATH } from '../config.js';

const router = express.Router();

router.post('/url', (req, res) => {
    const { clientId, clientSecret, redirectUri } = req.body;
    try {
        const url = generateAuthUrl(clientId, clientSecret, redirectUri);
        res.json({ url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/token', async (req, res) => {
    const { code, clientId, clientSecret, redirectUri } = req.body;
    try {
        const tokens = await getToken(code, clientId, clientSecret, redirectUri);
        res.json({ tokens });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/status', (req, res) => {
    const config = getAuthConfig();
    const folderId = process.env.DRIVE_FOLDER_ID || '';
    if (config && config.tokens) {
        res.json({ authenticated: true, folderId });
    } else {
        res.json({ authenticated: false, folderId });
    }
});

router.post('/disconnect', (req, res) => {
    try {
        if (fs.existsSync(OAUTH_CREDENTIALS_PATH)) {
            fs.unlinkSync(OAUTH_CREDENTIALS_PATH);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
