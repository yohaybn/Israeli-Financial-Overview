import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { runScraper } from './scraper.js';
import { loadEncryptedCredentials } from './encryption.js';
import { jsonToCsv, jsonToRows } from './csv_utils.js';
import { addToSheet } from './drive.js';
import { getAuthConfig, RESULTS_DIR, getAiConfig, getSettings } from './config.js';
import { categorize } from './services/categorizer.js';

export async function executeFlow(options, io) {
    const executionLog = [];
    const log = (msg) => {
        console.log(msg);
        executionLog.push(msg);
        const socketMsg = options.profileName ? `PROFILE:${options.profileName}::${msg}` : msg;
        if (io) {
            if (options.socketId) {
                io.to(options.socketId).emit('log', socketMsg);
            } else {
                io.emit('log', socketMsg);
            }
        }
    };
    const logError = (msg) => {
        console.error(msg);
        const errorMsg = 'ERROR: ' + msg;
        executionLog.push(errorMsg);
        const socketMsg = options.profileName ? `PROFILE:${options.profileName}::${errorMsg}` : errorMsg;
        if (io) {
            if (options.socketId) {
                io.to(options.socketId).emit('log', socketMsg);
            } else {
                io.emit('log', socketMsg);
            }
        }
    };

    log(`Starting scrape flow for: ${options.companyId}`);

    // Handle encrypted credentials
    if (options.encryptedCredsFile && options.key) {
        try {
            log('Decrypting credentials...');
            const decryptedCoords = loadEncryptedCredentials(options.encryptedCredsFile, options.key);
            options.credentials = decryptedCoords;
        } catch (e) {
            return { success: false, error: 'Failed to decrypt credentials: ' + e.message, executionLog };
        }
    }


    // Conditional Flow: Real Scraper vs Test Data
    let jsonData;

    if (!options.useTestData) {
        log(`Running real scraper for ${options.companyId}...`);
        try {
            const scrapeResult = await runScraper(options, log);

            if (!scrapeResult.success) {
                // If scraper failed, we stop here (unless partial success is handled in runScraper, but usually it returns success:false)
                return {
                    success: false,
                    error: scrapeResult.errorType || scrapeResult.errorMessage || 'Scraping failed',
                    executionLog,
                    errorType: scrapeResult.errorType
                };
            }
            log('Scraping completed successfully.');
            // runScraper usually returns { success: true, accounts: [] }
            // We map 'accounts' to our 'jsonData' structure
            jsonData = scrapeResult.accounts;

        } catch (e) {
            logError(`Scraper exception: ${e.message}`);
            return { success: false, error: e.message, executionLog };
        }

    } else {
        // Test Data Mode
        log(`Test Mode: Loading test data for ${options.companyId}`);

        try {
            // Robust path resolution for testData
            let testDataDir;
            // Check if __dirname is defined
            if (typeof __dirname !== 'undefined') {
                testDataDir = path.join(__dirname, 'testData');
            } else {
                // Fallback to searching in src/testData relative to CWD
                testDataDir = path.join(process.cwd(), 'src', 'testData');
            }

            const testDataFile = `test_data_${options.companyId.toLowerCase()}.json`;
            const testDataPath = path.join(testDataDir, testDataFile);

            if (!fs.existsSync(testDataPath)) {
                return {
                    success: false,
                    error: `No test data found for ${options.companyId}. Expected file: ${testDataFile}`,
                    executionLog
                };
            }

            log(`Found test data file: ${testDataFile}`);

            // Load test data directly into memory (no temp files)
            jsonData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
            log(`Loaded test data successfully`);

        } catch (e) {
            logError("Failed to load test data: " + e.message);
            return { success: false, error: e.message, executionLog };
        }
    }

    // Smart Categorization (Auto-run)
    const aiConfig = getAiConfig();
    if (aiConfig && aiConfig.autoRun) {
        log('Running Smart Categorization...');
        try {
            jsonData = await categorize(jsonData);
        } catch (err) {
            logError('Categorization failed: ' + err.message);
        }
    }

    // --- EXCLUSION FILTERS ---
    const settings = getSettings();
    if (settings.exclusionRules && Array.isArray(settings.exclusionRules) && settings.exclusionRules.length > 0) {
        log(`Applying ${settings.exclusionRules.length} exclusion rules...`);
        let excludedCount = 0;

        // Helper to check rule
        const matchRule = (txn, rule) => {
            let val = txn[rule.field];
            const ruleVal = rule.value;

            // Handle numbers
            if (rule.field === 'chargedAmount' || rule.field === 'originalAmount') {
                val = parseFloat(val);
                const numRule = parseFloat(ruleVal);
                if (rule.operator === 'gt') return val > numRule;
                if (rule.operator === 'lt') return val < numRule;
                if (rule.operator === 'equals') return val === numRule;
            }

            // Strings
            val = (val || '').toString().toLowerCase();
            const strRule = (ruleVal || '').toString().toLowerCase();

            if (rule.operator === 'contains') return val.includes(strRule);
            if (rule.operator === 'equals') return val === strRule;
            if (rule.operator === 'startsWith') return val.startsWith(strRule);

            return false;
        };

        // Filter nested or flat
        if (Array.isArray(jsonData)) {
            jsonData.forEach(account => {
                if (account.txns && Array.isArray(account.txns)) {
                    const initialLen = account.txns.length;
                    account.txns = account.txns.filter(t => {
                        // If ANY rule matches, EXCLUDE (return false)
                        for (const rule of settings.exclusionRules) {
                            if (matchRule(t, rule)) return false;
                        }
                        return true;
                    });
                    excludedCount += (initialLen - account.txns.length);
                }
            });
        }

        if (excludedCount > 0) {
            log(`Excluded ${excludedCount} transactions based on rules.`);
        }
    }
    // -------------------------

    // Generate CSV in memory (no file saving)
    const csvData = jsonToCsv(jsonData);
    log('CSV data generated in memory.');

    // Filename generation for Sheet Upload (if enabled) OR for frontend reference
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    let baseFilename = options.filename || '{bank}_{profile}_{date}';
    if (options.useTestData) baseFilename += '_test';

    const finalFilename = baseFilename
        .replace(/{date}/g, dateStr)
        .replace(/{bank}/g, options.companyId)
        .replace(/{profile}/g, options.profileName || 'noprofile')
        .replace(/{timestamp}/g, now.toISOString().replace(/[:.]/g, '-'))
        .replace(/__+/g, '_').replace(/_$/, '');

    // Google Sheets upload (if configured)
    let sheetId = null;
    let sheetStatus = null;
    let uploadError = null;

    const authConfig = getAuthConfig();
    // settings already declared above
    const folderId = process.env.DRIVE_FOLDER_ID || settings.folderId;

    log(`Sheet Config Check: FolderID=${folderId ? 'Found' : 'Missing'}, Auth=${authConfig ? 'Found' : 'Missing'}, Save=${options.saveToSheets}`);

    if (folderId && authConfig && options.saveToSheets) {
        log('Saving to Google Sheets...');
        try {
            const rows = jsonToRows(jsonData);
            const sheetRes = await addToSheet(rows, folderId, authConfig, finalFilename, true);
            sheetId = sheetRes.id;
            sheetStatus = sheetRes.type;
            const countSuffix = sheetRes.appendedCount !== undefined ? ` (${sheetRes.appendedCount} new rows)` : '';
            log(`Saved to Sheets (${sheetStatus})${countSuffix}. Name: ${finalFilename}, ID: ${sheetId}`);
        } catch (e) {
            logError("Sheet operation failed: " + e);
            uploadError = e.message || JSON.stringify(e);
        }
    }

    const response = {
        success: true,
        data: jsonData,
        sheetId: sheetId,
        sheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}` : null,
        sheetStatus: sheetStatus,
        csv: csvData,
        uploadError: uploadError,
        executionLog,
        profileName: options.profileName,
        companyId: options.companyId
    };

    if (io) {
        if (options.socketId) {
            io.to(options.socketId).emit('result', response);
        } else {
            io.emit('result', response);
        }
    }

    return response;
}
