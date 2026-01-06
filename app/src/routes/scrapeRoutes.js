import express from 'express';
import fs from 'fs';
import path from 'path';
import { executeFlow } from '../scraperFlow.js';
import { PROFILES_PATH, getAuthConfig, RESULTS_DIR, getSettings } from '../config.js';
import { decrypt } from '../encryption.js';
import { SCRAPERS } from 'israeli-bank-scrapers';
import { jsonToRows, jsonToCsv } from '../csv_utils.js';
import { addToSheet } from '../drive.js';

const router = express.Router();

function toStandardResponse(result) {
    if (!result) return { success: false, error: 'Empty result' };
    const { executionLog, csv, ...standard } = result;
    return standard;
}

router.post('/scrape', async (req, res) => {
    let options = req.body;
    const io = req.app.get('io');

    if (options.profileName && options.key && !options.credentials) {
        try {
            if (!fs.existsSync(PROFILES_PATH)) {
                return res.status(404).json({ error: 'No profiles found' });
            }
            const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
            if (!profiles[options.profileName]) {
                return res.status(404).json({ error: `Profile '${options.profileName}' not found` });
            }

            const decrypted = JSON.parse(decrypt(profiles[options.profileName], options.key));
            options = {
                ...decrypted,
                ...options,
                credentials: decrypted
            };
        } catch (e) {
            return res.status(401).json({ error: 'Failed to decrypt profile: ' + e.message });
        }
    }

    // Skip credential check if using test data
    if (!options.useTestData && (!options.companyId || !options.credentials)) {
        return res.status(400).json({ error: 'Missing companyId or credentials (or invalid profile/key)' });
    }

    if (!options.companyId) {
        return res.status(400).json({ error: 'Missing companyId' });
    }

    options.verbose = true;
    options.showBrowser = false;

    if (!options.startDate) {
        options.startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else {
        options.startDate = new Date(options.startDate);
    }

    try {
        const result = await executeFlow(options, io);

        if (options.format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.send(result.csv);
        } else {
            // Return standardized object { success, data, ... }
            res.json(toStandardResponse(result));
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/scrape-all', async (req, res) => {
    const { key, startDate, saveToSheets, filename, useTestData, format, verbose } = req.body;
    const io = req.app.get('io');

    if (!key) return res.status(400).json({ error: 'Encryption key required' });

    if (!fs.existsSync(PROFILES_PATH)) return res.json([]);

    const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
    const results = [];

    for (const [name, encrypted] of Object.entries(profiles)) {
        try {
            const decryptedCoords = JSON.parse(decrypt(encrypted, key));

            if (!decryptedCoords.companyId) {
                console.error(`[Bulk] Profile '${name}' missing companyId`);
                results.push({
                    profileName: name,
                    success: false,
                    error: 'Missing companyId in profile'
                });
                continue;
            }

            const options = {
                companyId: decryptedCoords.companyId,
                credentials: decryptedCoords,
                startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                verbose: true,
                showBrowser: false,
                saveToSheets: saveToSheets || false,
                useTestData: useTestData || false,
                profileName: name,
                filename: filename || '{profile}_{date}'
            };

            const result = await executeFlow(options, io);
            result.profileName = name;
            results.push(result);

        } catch (e) {
            console.error(`[Bulk] Failed profile '${name}': ${e.message}`);
            results.push({
                profileName: name,
                success: false,
                error: e.message
            });
        }
    }

    // Standardize results
    const standardResults = results.map(r => toStandardResponse(r));

    // Default: Flat array of standardized data unless format/verbose requested
    if (!verbose && format !== 'csv') {
        return res.json(standardResults);
    }

    if (format === 'csv') {
        try {
            let allData = [];
            results.forEach(r => {
                if (r.success && r.data) {
                    const tagged = r.data.map(row => ({ ...row, _profile: r.profileName }));
                    allData = allData.concat(tagged);
                }
            });
            const csv = allData.length > 0 ? jsonToCsv(allData) : "";
            res.setHeader('Content-Type', 'text/csv');
            res.send(csv);
        } catch (err) {
            res.status(500).json({ error: 'Failed to generate CSV: ' + err.message });
        }
    } else {
        // Verbose mode: Return original detailed results
        res.json(results);
    }
});

router.post('/upload-result', async (req, res) => {
    const { filename, type, data } = req.body;
    const settings = getSettings();
    const folderId = process.env.DRIVE_FOLDER_ID || settings.folderId;

    const authConfig = getAuthConfig();
    if (!folderId || !authConfig) {
        return res.status(400).json({ success: false, error: 'Drive not configured (Missing folderId or auth).' });
    }


    try {
        if (type === 'csv') {
            return res.status(400).json({ success: false, error: 'CSV upload is no longer supported.' });
        } else if (type === 'sheet') {


            const jsonData = data;
            const rows = jsonToRows(jsonData);

            const sheetName = filename || path.basename(filename, '.json');
            const sheetRes = await addToSheet(rows, folderId, authConfig, sheetName, true);
            res.json({
                success: true,
                sheetId: sheetRes.id,
                sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetRes.id}`
            });
        } else {
            res.status(400).json({ success: false, error: 'Invalid upload type' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/definitions', (req, res) => {
    res.json(SCRAPERS);
});

export default router;
