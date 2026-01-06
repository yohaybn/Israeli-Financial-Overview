import express from 'express';
import fs from 'fs';
import path from 'path';
import { categorize, updateCategory, checkDescriptionExists } from '../services/categorizer.js';
import { RESULTS_DIR, getAuthConfig } from '../config.js';
import { updateSheetCategory } from '../drive.js';

const router = express.Router();

router.post('/update-map', async (req, res) => {
    const { description, category, updateSheets, folderId } = req.body;
    try {
        // Validation: Check if description exists in cache
        if (!checkDescriptionExists(description)) {
            return res.status(400).json({ success: false, error: 'Description not found in cache. Cannot update unknown description.' });
        }

        console.log(`[Categorize] Updating map: "${description}" -> "${category}" (Sheets: ${updateSheets})`);

        // 1. Update Cache
        updateCategory(description, category);

        let sheetUpdateCount = 0;

        // 2. Update Sheets if requested
        if (updateSheets) {
            const authConfig = getAuthConfig();
            if (authConfig && folderId) {
                sheetUpdateCount = await updateSheetCategory(description, category, folderId, authConfig);
            } else {
                console.warn('[Categorize] Skipping sheet update: Auth or FolderID missing');
            }
        }

        res.json({ success: true, sheetUpdateCount });
    } catch (e) {
        console.error('[Categorize] Update failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { transactions, filename } = req.body;
        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ success: false, error: 'Invalid transactions array' });
        }

        const rowCount = transactions.length > 0 && transactions[0].txns
            ? transactions.reduce((acc, curr) => acc + (curr.txns ? curr.txns.length : 0), 0)
            : transactions.length;
        console.log(`[Categorize Route] Processing ${rowCount} transactions...`);

        const updated = await categorize(transactions);

        // Persist to disk if filename provided
        if (filename) {
            const filePath = path.join(RESULTS_DIR, filename);
            if (fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
            }
        }

        res.json({ success: true, data: updated });
    } catch (e) {
        console.error('[Categorize Route] Error:', e);
        res.status(500).json({ success: false, error: e.message || 'Categorization failed' });
    }
});

export default router;
