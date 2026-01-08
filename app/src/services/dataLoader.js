/**
 * Data Loader Service
 * 
 * Unified data loading from multiple sources:
 * - Google Sheets
 * - Local JSON files
 * - Memory (passed directly)
 */

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { getAuthConfig, RESULTS_DIR } from '../config.js';
import { getAuth } from '../drive.js';


/**
 * Normalize object keys to lowercase
 */
function normalizeKeys(obj) {
    if (Array.isArray(obj)) {
        return obj.map(item => normalizeKeys(item));
    }
    if (obj !== null && typeof obj === 'object') {
        const newObj = {};
        for (const [key, value] of Object.entries(obj)) {
            // Special handling for keys that might need specific mapping if needed
            // For now just lowercase first letter or whole key?
            // User example: "Account Number" -> "account number"? No, code uses "amount", "category".
            // Let's lowercase the entire key to match standard JS conventions.
            // Also need to handle "Date" -> "date", "Amount" -> "amount".
            newObj[key.toLowerCase()] = value;
        }
        // Ensure numeric fields are actually numbers if they are strings
        if (newObj.amount && typeof newObj.amount === 'string') {
            newObj.amount = parseFloat(newObj.amount);
        }
        if (newObj.chargedamount && typeof newObj.chargedamount === 'string') {
            // Map chargedamount -> chargedAmount for consistency if needed, 
            // but analyzers check transaction.chargedAmount || transaction.amount.
            // If we lowercase "Charged Amount" -> "charged amount", it won't match "chargedAmount".
            // We should try to CamelCase or just map common variants.

            // Map variations
            if (newObj['charged amount']) {
                newObj.chargedAmount = parseFloat(newObj['charged amount']);
            }
            if (newObj['account number']) {
                newObj.accountNumber = newObj['account number'];
            }

            // If we have just 'amount' that was string
        }
        return newObj;
    }
    return obj;
}

/**
 * Load data from specified source
 * @param {string} source - 'sheets', 'local', or 'memory'
 * @param {Object} options - Source-specific options
 * @returns {Promise<Array>} - Transaction data array
 */
export async function loadData(source, options = {}) {
    let data = [];
    switch (source) {
        case 'sheets':
            data = await loadFromSheets(options.sheetId, options.range);
            break;
        case 'local':
            if (Array.isArray(options.filename)) {
                let allData = [];
                for (const file of options.filename) {
                    const d = await loadFromLocal(file);
                    allData = allData.concat(d);
                }
                data = allData;
            } else {
                data = await loadFromLocal(options.filename);
            }
            break;
        case 'memory':
            data = options.data || [];
            break;
        default:
            throw new Error(`Unknown data source: ${source}`);
    }

    // Normalize data keys
    return normalizeKeys(data);
}

/**
 * Load data from Google Sheets
 * @param {string} sheetId - Google Sheets ID
 * @param {string} range - Optional range (e.g., 'Sheet1!A:Z')
 * @returns {Promise<Array>} - Parsed transaction data
 */
async function loadFromSheets(sheetId, range = 'A:Z') {
    const authConfig = getAuthConfig();
    if (!authConfig) {
        throw new Error('Google auth not configured');
    }

    const auth = await getAuth(authConfig);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: range
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
        return [];
    }

    // First row is headers
    const headers = rows[0].map(h => h.toString().trim());
    const data = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = row[index] !== undefined ? row[index] : null;
        });
        data.push(obj);
    }

    return data;
}

/**
 * Load data from local JSON file
 * @param {string} filename - Filename in results directory
 * @returns {Promise<Array>} - Parsed transaction data
 */
async function loadFromLocal(filename) {
    const filePath = path.join(RESULTS_DIR, filename);

    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filename}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);

    // Handle both array and {data: [...]} formats
    if (Array.isArray(parsed)) {
        return parsed;
    } else if (parsed.data && Array.isArray(parsed.data)) {
        return parsed.data;
    } else {
        throw new Error('Invalid data format: expected array or {data: [...]}');
    }
}

/**
 * Get list of available local data files
 * @returns {Array<{filename: string, size: number, modified: Date}>}
 */
export function getLocalDataFiles() {
    if (!fs.existsSync(RESULTS_DIR)) {
        return [];
    }

    const files = fs.readdirSync(RESULTS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(filename => {
            const filePath = path.join(RESULTS_DIR, filename);
            const stats = fs.statSync(filePath);
            return {
                filename,
                size: stats.size,
                modified: stats.mtime
            };
        })
        .sort((a, b) => b.modified - a.modified);

    return files;
}

/**
 * Get available data sources
 * @returns {Array<{type: string, label: string, available: boolean}>}
 */
export function getAvailableSources() {
    const authConfig = getAuthConfig();
    const localFiles = getLocalDataFiles();

    return [
        {
            type: 'memory',
            label: 'Current Results',
            description: 'Use data from the current scrape session',
            available: true
        },
        {
            type: 'local',
            label: 'Local Files',
            description: `${localFiles.length} JSON file(s) available`,
            available: localFiles.length > 0,
            files: localFiles
        },
        {
            type: 'sheets',
            label: 'Google Sheets',
            description: 'Load data from a Google Sheet',
            available: !!(authConfig && (authConfig.tokens || authConfig.client_email))
        }
    ];
}
