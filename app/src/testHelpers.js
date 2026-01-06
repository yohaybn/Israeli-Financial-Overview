import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DATA_DIR = path.join(__dirname, 'testData');

/**
 * Load anonymized test data for a specific company
 * @param {string} companyId - Company identifier (e.g., 'isracard', 'mizrahi')
 * @returns {Array} Parsed JSON test data
 * @throws {Error} If test data file not found
 */
export function loadTestData(companyId) {
    const filename = `test_data_${companyId.toLowerCase()}.json`;
    const filepath = path.join(TEST_DATA_DIR, filename);

    if (!fs.existsSync(filepath)) {
        throw new Error(`Test data not found for company: ${companyId}. Expected file: ${filename}`);
    }

    try {
        const data = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        throw new Error(`Failed to load test data for ${companyId}: ${error.message}`);
    }
}

/**
 * Get list of available test data companies
 * @returns {Array<string>} List of company IDs with test data
 */
export function getAvailableTestData() {
    if (!fs.existsSync(TEST_DATA_DIR)) {
        return [];
    }

    return fs.readdirSync(TEST_DATA_DIR)
        .filter(f => f.startsWith('test_data_') && f.endsWith('.json'))
        .map(f => f.replace('test_data_', '').replace('.json', ''));
}

/**
 * Check if test data exists for a company
 * @param {string} companyId - Company identifier
 * @returns {boolean} True if test data exists
 */
export function hasTestData(companyId) {
    const filename = `test_data_${companyId.toLowerCase()}.json`;
    const filepath = path.join(TEST_DATA_DIR, filename);
    return fs.existsSync(filepath);
}

/**
 * Mock a scraper call using test data
 * @param {string} companyId - Company identifier
 * @param {Object} options - Scraper options (for compatibility)
 * @returns {Object} Mock scraper result
 */
export function mockScrapeCall(companyId, options = {}) {
    const data = loadTestData(companyId);

    return {
        success: true,
        accounts: data,
        scrapeResult: {
            success: true,
            accounts: data
        }
    };
}

/**
 * Validate scraper response structure
 * @param {Object} result - Scraper result to validate
 * @returns {Object} Validation result with { valid: boolean, errors: Array }
 */
export function validateScraperResponse(result) {
    const errors = [];

    if (!result) {
        errors.push('Result is null or undefined');
        return { valid: false, errors };
    }

    if (typeof result.success !== 'boolean') {
        errors.push('Missing or invalid "success" field');
    }

    if (result.success) {
        if (!result.data && !result.accounts) {
            errors.push('Successful result missing "data" or "accounts" field');
        }

        const accounts = result.data || result.accounts;
        if (!Array.isArray(accounts)) {
            errors.push('Data/accounts field is not an array');
        } else {
            // Validate account structure
            accounts.forEach((account, idx) => {
                if (!account.accountNumber) {
                    errors.push(`Account ${idx}: Missing accountNumber`);
                }

                if (!Array.isArray(account.txns)) {
                    errors.push(`Account ${idx}: Missing or invalid txns array`);
                } else {
                    // Validate transaction structure
                    account.txns.forEach((txn, txnIdx) => {
                        const requiredFields = ['type', 'date', 'originalAmount', 'chargedAmount', 'description'];
                        requiredFields.forEach(field => {
                            if (txn[field] === undefined) {
                                errors.push(`Account ${idx}, Transaction ${txnIdx}: Missing ${field}`);
                            }
                        });
                    });
                }
            });
        }
    } else {
        if (!result.error) {
            errors.push('Failed result missing "error" field');
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Count total transactions in scraper result
 * @param {Object} result - Scraper result
 * @returns {number} Total transaction count
 */
export function countTransactions(result) {
    const accounts = result.data || result.accounts || [];
    return accounts.reduce((sum, account) => sum + (account.txns?.length || 0), 0);
}
