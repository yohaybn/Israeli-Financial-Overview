const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const DATA_DIR = path.resolve('./server/data');
const RESULTS_DIR = path.join(DATA_DIR, 'results');

async function listScrapeResults() {
    const files = await fs.readdir(RESULTS_DIR);
    console.log('Files in results dir:', files);
    
    const fileMetadata = [];
    
    for (const file of files) {
        if (!file.endsWith('.json')) {
            console.log('Skipping non-json file:', file);
            continue;
        }
        try {
            console.log(`\nTesting file: ${file}`);
            const filePath = path.join(RESULTS_DIR, file);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const rawData = JSON.parse(fileContent);
            
            // Simulate normalizeLegacyData
            let transactionCount = 0;
            if (Array.isArray(rawData)) {
                console.log('  - Detected legacy format (array)');
                rawData.forEach(account => {
                    if (account.txns) {
                        transactionCount += account.txns.length;
                    }
                });
            } else if (rawData.transactions) {
                console.log('  - Detected new format');
                transactionCount = rawData.transactions.length;
            } else {
                console.log('  - WARNING: Unknown format!');
            }
            
            console.log(`  - Transaction count: ${transactionCount}`);
            
            // Only include files with at least 1 transaction
            if (transactionCount > 0) {
                fileMetadata.push({
                    filename: file,
                    transactionCount,
                    accountCount: Array.isArray(rawData) ? rawData.length : (rawData.accounts?.length || 0)
                });
                console.log('  - INCLUDED in results');
            } else {
                console.log('  - SKIPPED (no transactions)');
            }
        } catch (error) {
            console.log(`  - ERROR: ${error.message}`);
            console.error(error);
        }
    }
    
    console.log('\n\nFinal metadata:', fileMetadata);
    return fileMetadata;
}

listScrapeResults().catch(console.error);
