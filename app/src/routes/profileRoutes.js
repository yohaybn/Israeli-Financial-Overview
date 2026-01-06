import express from 'express';
import fs from 'fs';
import { PROFILES_PATH } from '../config.js';
import { encrypt, decrypt } from '../encryption.js';

const router = express.Router();

router.get('/', (req, res) => {
    if (!fs.existsSync(PROFILES_PATH)) {
        return res.json([]);
    }
    try {
        const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
        res.json(Object.keys(profiles));
    } catch (e) {
        res.json([]);
    }
});

router.get('/:name', (req, res) => {
    const { name } = req.params;
    const { key } = req.query;
    if (!fs.existsSync(PROFILES_PATH) || !key) {
        return res.status(404).json({ error: 'Profile not found or key missing' });
    }
    try {
        const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
        if (!profiles[name]) return res.status(404).json({ error: 'Profile not found' });

        const decrypted = decrypt(profiles[name], key);
        const credentials = JSON.parse(decrypted);
        res.json(credentials);
    } catch (e) {
        res.status(500).json({ error: 'Failed to decrypt: ' + e.message });
    }
});

router.post('/', (req, res) => {
    const { name, credentials, key } = req.body;
    if (!name || !credentials || !key) {
        return res.status(400).json({ success: false, error: 'Missing defined fields' });
    }

    try {
        let profiles = {};
        if (fs.existsSync(PROFILES_PATH)) {
            profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
        }

        const encrypted = encrypt(JSON.stringify(credentials), key);
        profiles[name] = encrypted;

        fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2));
        res.json({ success: true, message: `Profile '${name}' saved.` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/:name', (req, res) => {
    const { name } = req.params;
    if (!fs.existsSync(PROFILES_PATH)) {
        return res.status(404).json({ success: false, error: 'No profiles found' });
    }

    try {
        const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
        if (profiles[name]) {
            delete profiles[name];
            fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2));
            res.json({ success: true, message: `Profile '${name}' deleted.` });
        } else {
            res.status(404).json({ success: false, error: 'Profile not found' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;
