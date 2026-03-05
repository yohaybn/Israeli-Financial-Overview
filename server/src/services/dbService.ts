import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { Transaction } from '@app/shared';
import { serverLogger } from '../utils/logger';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

export class DbService {
    private db: Database.Database;

    constructor() {
        fs.ensureDirSync(DATA_DIR);
        this.db = new Database(DB_PATH);
        this.initialize();
    }

    private initialize() {
        // Enable WAL mode for better concurrency
        this.db.pragma('journal_mode = WAL');

        // Create transactions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                accountNumber TEXT,
                date TEXT,
                description TEXT,
                amount REAL,
                category TEXT,
                isIgnored INTEGER DEFAULT 0,
                provider TEXT,
                raw_data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create categories cache table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS categories_cache (
                description TEXT PRIMARY KEY,
                category TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        serverLogger.info('Database initialized');
    }

    // --- Transactions ---

    addTransaction(transaction: Transaction) {
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO transactions (
                id, accountNumber, date, description, amount, category, provider, raw_data
            ) VALUES (
                @id, @accountNumber, @date, @description, @amount, @category, @provider, @raw_data
            )
        `);

        const rawData = JSON.stringify(transaction);
        stmt.run({
            id: transaction.id,
            accountNumber: transaction.accountNumber,
            date: transaction.date,
            description: transaction.description,
            amount: transaction.amount,
            category: transaction.category,
            provider: transaction.provider || 'unknown',
            raw_data: rawData
        });
    }

    transactionExists(id: string): boolean {
        const stmt = this.db.prepare('SELECT 1 FROM transactions WHERE id = ?');
        return !!stmt.get(id);
    }

    getAllTransactions(includeIgnored = false): Transaction[] {
        let query = 'SELECT raw_data, category, isIgnored FROM transactions';
        if (!includeIgnored) {
            query += ' WHERE isIgnored = 0';
        }
        query += ' ORDER BY date DESC';

        const stmt = this.db.prepare(query);
        const rows = stmt.all();

        return rows.map((row: any) => {
            const txn = JSON.parse(row.raw_data);
            // Override with DB values if they differ (e.g. category update)
            txn.category = row.category;
            txn.isIgnored = Boolean(row.isIgnored);
            return txn;
        });
    }

    updateTransactionCategory(id: string, category: string): boolean {
        const stmt = this.db.prepare('UPDATE transactions SET category = ? WHERE id = ?');
        const info = stmt.run(category, id);
        return info.changes > 0;
    }

    updateTransactionType(id: string, txnType: string): boolean {
        // We need to update the raw_data JSON to persist the updated type,
        // since type is not a top-level column in our schema.
        const getStmt = this.db.prepare('SELECT raw_data FROM transactions WHERE id = ?');
        const row: any = getStmt.get(id);

        if (!row) return false;

        const txn = JSON.parse(row.raw_data);
        txn.txnType = txnType;

        const updateStmt = this.db.prepare('UPDATE transactions SET raw_data = ? WHERE id = ?');
        const info = updateStmt.run(JSON.stringify(txn), id);
        return info.changes > 0;
    }

    toggleTransactionIgnore(id: string, isIgnored: boolean): boolean {
        const stmt = this.db.prepare('UPDATE transactions SET isIgnored = ? WHERE id = ?');
        const info = stmt.run(isIgnored ? 1 : 0, id);
        return info.changes > 0;
    }

    clearTransactions() {
        this.db.exec('DELETE FROM transactions');
        serverLogger.info('Transactions table cleared');
    }

    // --- Categories Cache ---

    getCategory(description: string): string | null {
        const stmt = this.db.prepare('SELECT category FROM categories_cache WHERE description = ?');
        const row: any = stmt.get(description);
        return row ? row.category : null;
    }

    setCategory(description: string, category: string) {
        const stmt = this.db.prepare(`
            INSERT INTO categories_cache (description, category, updated_at)
            VALUES (@description, @category, CURRENT_TIMESTAMP)
            ON CONFLICT(description) DO UPDATE SET
                category = excluded.category,
                updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run({ description, category });
    }

    clearCategoriesCache() {
        this.db.exec('DELETE FROM categories_cache');
        serverLogger.info('Categories cache cleared');
    }
}
