import './src/runtimeEnv.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function verify() {
    // Ensure we use the correct data directory (must run before loading services)
    process.env.DATA_DIR = path.resolve(__dirname, './data');

    const { StorageService } = await import('./src/services/storageService.js');

    const storage = new StorageService();

    console.log('Initial check of transactions...');
    const before = await storage.getAllTransactions(true); // include ignored
    console.log(`Current total transactions in DB: ${before.length}`);

    console.log('Triggering manual reload from JSON files...');
    await storage.reloadTransactionsFromFiles();

    const after = await storage.getAllTransactions(true);
    console.log(`Total transactions in DB after reload: ${after.length}`);

    if (after.length < before.length) {
        console.log(`\n✅ SUCCESS: Deduplicated ${before.length - after.length} transactions.`);
    } else {
        console.log('\nℹ️ No duplicates were found or removed. This might be because the database was already clean or the files themselves contain unique transactions.');

        // Let's check for "hidden" duplicates in the files by hashing them manually
        const hashCount = new Set(after.map(t => `${t.date}|${t.amount}|${t.description}|${t.accountNumber}`)).size;
        console.log(`Unique transactions by (date, amount, desc, account): ${hashCount}`);

        if (hashCount < after.length) {
            console.log('❌ Still found duplicates in the result set. Something is wrong with the stable ID generation.');
        } else {
            console.log('✅ The resulting dataset is unique by natural keys.');
        }
    }
}

verify().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
