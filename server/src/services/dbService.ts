import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { Transaction, FraudDetectorType, FraudFinding, FraudSeverity } from '@app/shared';
import { serverLogger } from '../utils/logger.js';

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
                isInternalTransfer INTEGER DEFAULT 0,
                provider TEXT,
                raw_data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Add isInternalTransfer column if it doesn't exist
        try {
            this.db.exec('ALTER TABLE transactions ADD COLUMN isInternalTransfer INTEGER DEFAULT 0');
        } catch (e) {
            // Column already exists, ignore
        }

        // Migration: Add subscription columns
        try {
            this.db.exec('ALTER TABLE transactions ADD COLUMN isSubscription INTEGER DEFAULT 0');
        } catch (e) {}

        try {
            this.db.exec('ALTER TABLE transactions ADD COLUMN subscriptionInterval TEXT');
        } catch (e) {}

        try {
            this.db.exec('ALTER TABLE transactions ADD COLUMN excludeFromSubscriptions INTEGER DEFAULT 0');
        } catch (e) {}

        // Create categories cache table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS categories_cache (
                description TEXT PRIMARY KEY,
                category TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Fraud findings table (local and/or AI detectors)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS fraud_findings (
                id TEXT PRIMARY KEY,
                txn_id TEXT NOT NULL,
                detector TEXT NOT NULL,
                score REAL NOT NULL,
                severity TEXT NOT NULL,
                reasons_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_fraud_findings_txn ON fraud_findings(txn_id)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_fraud_findings_created_at ON fraud_findings(created_at)');

        serverLogger.info('Database initialized');
    }

    // --- Transactions ---

    addTransaction(transaction: Transaction) {
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO transactions (
                id, accountNumber, date, description, amount, category, provider, isInternalTransfer, isSubscription, subscriptionInterval, excludeFromSubscriptions, raw_data
            ) VALUES (
                @id, @accountNumber, @date, @description, @amount, @category, @provider, @isInternalTransfer, @isSubscription, @subscriptionInterval, @excludeFromSubscriptions, @raw_data
            )
        `);

        let isInternalValue: number | null = null;
        if (transaction.isInternalTransfer === true || transaction.txnType === 'internal_transfer' || transaction.type === 'internal_transfer') {
            isInternalValue = 1;
        } else if (transaction.isInternalTransfer === false) {
            isInternalValue = 0;
        }

        const rawData = JSON.stringify({ 
            ...transaction, 
            isInternalTransfer: isInternalValue === null ? undefined : Boolean(isInternalValue) 
        });
        stmt.run({
            id: transaction.id,
            accountNumber: transaction.accountNumber,
            date: transaction.date,
            description: transaction.description,
            amount: transaction.amount,
            category: transaction.category,
            provider: transaction.provider || 'unknown',
            isInternalTransfer: isInternalValue,
            isSubscription: transaction.isSubscription ? 1 : 0,
            subscriptionInterval: transaction.subscriptionInterval || null,
            excludeFromSubscriptions: transaction.excludeFromSubscriptions ? 1 : 0,
            raw_data: rawData
        });
    }

    transactionExists(id: string): boolean {
        const stmt = this.db.prepare('SELECT 1 FROM transactions WHERE id = ?');
        return !!stmt.get(id);
    }

    getAllTransactions(includeIgnored = false): Transaction[] {
        let query = 'SELECT raw_data, category, isIgnored, isInternalTransfer, isSubscription, subscriptionInterval, excludeFromSubscriptions FROM transactions';
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
            if (row.isInternalTransfer !== null) {
                txn.isInternalTransfer = Boolean(row.isInternalTransfer);
            }
            txn.isSubscription = Boolean(row.isSubscription);
            txn.subscriptionInterval = row.subscriptionInterval;
            txn.excludeFromSubscriptions = Boolean(row.excludeFromSubscriptions);
            return txn;
        });
    }

    updateTransactionCategory(id: string, category: string): boolean {
        const stmt = this.db.prepare('UPDATE transactions SET category = ? WHERE id = ?');
        const info = stmt.run(category, id);
        return info.changes > 0;
    }

    updateCategoryByDescription(description: string, category: string): number {
        const stmt = this.db.prepare('UPDATE transactions SET category = ? WHERE description = ?');
        const info = stmt.run(category, description);
        return info.changes;
    }

    updateTransactionType(id: string, txnType: string): boolean {
        // We need to update the raw_data JSON to persist the updated type,
        // since type is not a top-level column in our schema.
        const getStmt = this.db.prepare('SELECT raw_data FROM transactions WHERE id = ?');
        const row: any = getStmt.get(id);

        if (!row) return false;

        const isInternalTransfer = txnType === 'internal_transfer' ? 1 : 0;
        const txn = JSON.parse(row.raw_data);
        txn.txnType = txnType;
        txn.isInternalTransfer = !!isInternalTransfer;

        const updateStmt = this.db.prepare('UPDATE transactions SET raw_data = ?, isInternalTransfer = ? WHERE id = ?');
        const info = updateStmt.run(JSON.stringify(txn), isInternalTransfer, id);
        return info.changes > 0;
    }

    updateTransactionMemo(id: string, memo: string): boolean {
        const getStmt = this.db.prepare('SELECT raw_data FROM transactions WHERE id = ?');
        const row: any = getStmt.get(id);

        if (!row) return false;

        const txn = JSON.parse(row.raw_data);
        txn.memo = memo;

        const updateStmt = this.db.prepare('UPDATE transactions SET raw_data = ? WHERE id = ?');
        const info = updateStmt.run(JSON.stringify(txn), id);
        return info.changes > 0;
    }

    updateTransactionSubscription(id: string, isSubscription: boolean, interval: string | null, excludeFromSubscriptions: boolean = false): boolean {
        const getStmt = this.db.prepare('SELECT raw_data FROM transactions WHERE id = ?');
        const row: any = getStmt.get(id);

        if (!row) return false;

        const txn = JSON.parse(row.raw_data);
        txn.isSubscription = isSubscription;
        txn.subscriptionInterval = interval;
        txn.excludeFromSubscriptions = excludeFromSubscriptions;

        const updateStmt = this.db.prepare('UPDATE transactions SET raw_data = ?, isSubscription = ?, subscriptionInterval = ?, excludeFromSubscriptions = ? WHERE id = ?');
        const info = updateStmt.run(JSON.stringify(txn), isSubscription ? 1 : 0, interval, excludeFromSubscriptions ? 1 : 0, id);
        return info.changes > 0;
    }

    toggleTransactionIgnore(id: string, isIgnored: boolean): boolean {
        const stmt = this.db.prepare('UPDATE transactions SET isIgnored = ? WHERE id = ?');
        const info = stmt.run(isIgnored ? 1 : 0, id);
        return info.changes > 0;
    }

    deleteTransaction(id: string) {
        const stmt = this.db.prepare('DELETE FROM transactions WHERE id = ?');
        stmt.run(id);
    }

    clearTransactions() {
        this.db.exec('DELETE FROM transactions');
        serverLogger.info('Transactions table cleared');
    }

    getLatestTransactionDate(provider: string): string | null {
        const stmt = this.db.prepare('SELECT MAX(date) as latestDate FROM transactions WHERE provider = ?');
        const row: any = stmt.get(provider);
        return row ? row.latestDate : null;
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

    // --- Fraud Findings ---

    upsertFraudFindings(findings: FraudFinding[]) {
        if (!findings || findings.length === 0) return;
        const stmt = this.db.prepare(`
            INSERT INTO fraud_findings (id, txn_id, detector, score, severity, reasons_json, created_at)
            VALUES (@id, @txn_id, @detector, @score, @severity, @reasons_json, COALESCE(@created_at, CURRENT_TIMESTAMP))
            ON CONFLICT(id) DO UPDATE SET
                score = excluded.score,
                severity = excluded.severity,
                reasons_json = excluded.reasons_json,
                created_at = excluded.created_at
        `);
        const tx = this.db.transaction((rows: FraudFinding[]) => {
            for (const f of rows) {
                stmt.run({
                    id: f.id,
                    txn_id: f.transactionId,
                    detector: f.detector,
                    score: f.score,
                    severity: f.severity,
                    reasons_json: JSON.stringify(f.reasons || []),
                    created_at: f.createdAt
                });
            }
        });
        tx(findings);
    }

    getFraudFindings(params?: { since?: string; minScore?: number; minSeverity?: FraudSeverity; detector?: FraudDetectorType }): FraudFinding[] {
        const clauses: string[] = [];
        const bind: any = {};

        if (params?.since) {
            clauses.push('created_at >= @since');
            bind.since = params.since;
        }
        if (typeof params?.minScore === 'number') {
            clauses.push('score >= @minScore');
            bind.minScore = params.minScore;
        }
        if (params?.detector) {
            clauses.push('detector = @detector');
            bind.detector = params.detector;
        }
        if (params?.minSeverity) {
            // severity ordering: low < medium < high
            clauses.push(`
                CASE severity
                    WHEN 'low' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'high' THEN 3
                    ELSE 0
                END >=
                CASE @minSeverity
                    WHEN 'low' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'high' THEN 3
                    ELSE 0
                END
            `);
            bind.minSeverity = params.minSeverity;
        }

        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const stmt = this.db.prepare(`
            SELECT id, txn_id, detector, score, severity, reasons_json, created_at
            FROM fraud_findings
            ${where}
            ORDER BY created_at DESC
        `);
        const rows = stmt.all(bind);
        return rows.map((r: any) => ({
            id: r.id,
            transactionId: r.txn_id,
            detector: r.detector,
            score: Number(r.score),
            severity: r.severity,
            reasons: JSON.parse(r.reasons_json || '[]'),
            createdAt: new Date(r.created_at).toISOString(),
        }));
    }

    getFraudFindingsForTxn(txnId: string): FraudFinding[] {
        const stmt = this.db.prepare(`
            SELECT id, txn_id, detector, score, severity, reasons_json, created_at
            FROM fraud_findings
            WHERE txn_id = ?
            ORDER BY created_at DESC
        `);
        const rows = stmt.all(txnId);
        return rows.map((r: any) => ({
            id: r.id,
            transactionId: r.txn_id,
            detector: r.detector,
            score: Number(r.score),
            severity: r.severity,
            reasons: JSON.parse(r.reasons_json || '[]'),
            createdAt: new Date(r.created_at).toISOString(),
        }));
    }
}
