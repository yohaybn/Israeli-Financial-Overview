import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const TEST_DATA_DIR = path.join(__dirname, '..', 'src', 'testData');

/**
 * Anonymization Script for Bank Scraper Test Data
 * 
 * This script reads JSON result files from the results/ folder and creates
 * anonymized versions for testing purposes.
 * 
 * Anonymization includes:
 * - Randomizing transaction amounts (±20% variation)
 * - Masking account numbers
 * - Replacing merchant names with generic placeholders
 * - Preserving data structure and transaction types
 */

// Generic merchant names by category
const MERCHANT_NAMES = {
    food: ['Restaurant A', 'Cafe B', 'Supermarket C', 'Fast Food D', 'Bakery E'],
    transport: ['Gas Station A', 'Parking B', 'Public Transport C', 'Taxi Service D'],
    shopping: ['Store A', 'Online Shop B', 'Department Store C', 'Boutique D'],
    utilities: ['Electric Company', 'Water Company', 'Internet Provider', 'Phone Company'],
    health: ['Pharmacy A', 'Medical Center B', 'Health Insurance C', 'Clinic D'],
    entertainment: ['Cinema A', 'Streaming Service B', 'Sports Club C', 'Theater D'],
    other: ['Service Provider A', 'Company B', 'Vendor C', 'Merchant D']
};

// Hebrew keywords to category mapping
const HEBREW_KEYWORDS = {
    food: ['מסעדה', 'קפה', 'סופר', 'מזון', 'פיצה', 'המבורגר', 'לחם'],
    transport: ['דלק', 'חניה', 'תחבורה', 'מונית', 'רכבת', 'אוטובוס'],
    shopping: ['חנות', 'קניון', 'אונליין', 'בגדים'],
    utilities: ['חשמל', 'מים', 'אינטרנט', 'סלולר', 'טלפון', 'ביטוח'],
    health: ['בית מרקחת', 'רופא', 'קופת חולים', 'מרפאה'],
    entertainment: ['קולנוע', 'נטפליקס', 'ספורט', 'כושר', 'תיאטרון']
};

function detectCategory(description) {
    const lowerDesc = description.toLowerCase();

    for (const [category, keywords] of Object.entries(HEBREW_KEYWORDS)) {
        if (keywords.some(keyword => lowerDesc.includes(keyword))) {
            return category;
        }
    }

    return 'other';
}

function getRandomMerchant(category) {
    const merchants = MERCHANT_NAMES[category] || MERCHANT_NAMES.other;
    return merchants[Math.floor(Math.random() * merchants.length)];
}

function randomizeAmount(amount, variance = 0.2) {
    // Add random variation of ±variance (default 20%)
    const variation = 1 + (Math.random() * variance * 2 - variance);
    const randomized = amount * variation;

    // Round to 2 decimal places
    return Math.round(randomized * 100) / 100;
}

function maskAccountNumber(accountNumber) {
    // Keep last 4 digits, mask the rest
    const str = accountNumber.toString();
    if (str.length <= 4) return 'XXXX';

    const lastFour = str.slice(-4);
    return 'XXXX-' + lastFour;
}

function anonymizeTransaction(txn, usedIdentifiers) {
    // Generate unique identifier
    let newIdentifier;
    do {
        newIdentifier = Math.floor(Math.random() * 999999999);
    } while (usedIdentifiers.has(newIdentifier));
    usedIdentifiers.add(newIdentifier);

    const category = detectCategory(txn.description || '');

    return {
        ...txn,
        identifier: newIdentifier,
        originalAmount: randomizeAmount(txn.originalAmount),
        chargedAmount: randomizeAmount(txn.chargedAmount),
        description: getRandomMerchant(category),
        memo: txn.memo ? 'Test memo' : ''
    };
}

function anonymizeAccount(account, usedIdentifiers) {
    return {
        accountNumber: maskAccountNumber(account.accountNumber),
        txns: account.txns.map(txn => anonymizeTransaction(txn, usedIdentifiers))
    };
}

function anonymizeResultFile(inputPath, outputPath, companyId) {
    console.log(`\nProcessing: ${path.basename(inputPath)}`);

    try {
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

        if (!Array.isArray(data)) {
            console.error(`  ❌ Invalid format: Expected array of accounts`);
            return false;
        }

        const usedIdentifiers = new Set();
        const anonymized = data.map(account => anonymizeAccount(account, usedIdentifiers));

        // Write anonymized data
        fs.writeFileSync(outputPath, JSON.stringify(anonymized, null, 2));

        const txnCount = anonymized.reduce((sum, acc) => sum + (acc.txns?.length || 0), 0);
        console.log(`  ✓ Anonymized ${anonymized.length} accounts, ${txnCount} transactions`);
        console.log(`  ✓ Saved to: ${path.basename(outputPath)}`);

        return true;
    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return false;
    }
}

function extractCompanyId(filename) {
    // Extract company ID from filename like "scrape_result_isracard_*.json"
    const match = filename.match(/scrape_result_([a-z]+)_/i);
    return match ? match[1].toLowerCase() : null;
}

function main() {
    console.log('=== Bank Scraper Test Data Anonymization ===\n');

    // Ensure test data directory exists
    if (!fs.existsSync(TEST_DATA_DIR)) {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    // Find all JSON files in results directory
    if (!fs.existsSync(RESULTS_DIR)) {
        console.error(`❌ Results directory not found: ${RESULTS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(RESULTS_DIR)
        .filter(f => f.endsWith('.json') && f.startsWith('scrape_result_'));

    if (files.length === 0) {
        console.log('⚠️  No result files found in results/ directory');
        process.exit(0);
    }

    console.log(`Found ${files.length} result file(s)\n`);

    let successCount = 0;
    const processedCompanies = new Set();

    for (const file of files) {
        const companyId = extractCompanyId(file);

        if (!companyId) {
            console.log(`⚠️  Skipping ${file}: Could not extract company ID`);
            continue;
        }

        // Only process one file per company (use the first one found)
        if (processedCompanies.has(companyId)) {
            console.log(`⚠️  Skipping ${file}: Already processed ${companyId}`);
            continue;
        }

        const inputPath = path.join(RESULTS_DIR, file);
        const outputFilename = `test_data_${companyId}.json`;
        const outputPath = path.join(TEST_DATA_DIR, outputFilename);

        if (anonymizeResultFile(inputPath, outputPath, companyId)) {
            successCount++;
            processedCompanies.add(companyId);
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`✓ Successfully anonymized ${successCount} file(s)`);
    console.log(`✓ Test data saved to: ${TEST_DATA_DIR}`);
    console.log(`\nCompanies with test data: ${Array.from(processedCompanies).join(', ')}`);
}

main();
