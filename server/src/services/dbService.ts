import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { Transaction, FraudDetectorType, FraudFinding, FraudSeverity } from '@app/shared';
import { serverLogger } from '../utils/logger.js';
import { normalizeAiMemoryKey } from '../utils/aiMemoryNormalize.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

let sharedDb: Database.Database | null = null;

/** One-time seed marker so default AI facts are not re-inserted after the user deletes them. */
const SEED_DEFAULT_AI_FACTS_KEY = 'seed_default_ai_facts_v1';

const DEFAULT_AI_MEMORY_FACTS: { id: string; text: string }[] = [
    {
        id: '00000000-0000-4000-8000-000000000001',
        text: 'In the Israeli market, a single transaction can be split into multiple interest-free or "credit" installments at the point of sale.',
    },
    {
        id: '00000000-0000-4000-8000-000000000002',
        text: 'Spending patterns in Israel are highly seasonal, dictated by the Hebrew calendar. Significant spikes in grocery, gifts, and hospitality spending occur during the months of Tishrei (Sept/Oct) and Nissan (March/April).',
    },
    {
        id: '00000000-0000-4000-8000-000000000003',
        text: 'Israeli financial institutions charge specific recurring micro-fees such as "Channel Fees", "Card Fees", and "Management Fees"; flag these as "Potentially Avoidable Expenses."',
    },
];

function seedDefaultAiMemoryFactsIfNeeded(db: Database.Database) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS db_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
    const already = db.prepare(`SELECT 1 FROM db_meta WHERE key = ?`).get(SEED_DEFAULT_AI_FACTS_KEY);
    if (already) return;

    const insertFact = db.prepare(
        `INSERT OR IGNORE INTO ai_memory_facts (id, text, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    const insertMeta = db.prepare(`INSERT INTO db_meta (key, value) VALUES (?, ?)`);
    db.transaction(() => {
        for (const { id, text } of DEFAULT_AI_MEMORY_FACTS) {
            insertFact.run(id, text);
        }
        insertMeta.run(SEED_DEFAULT_AI_FACTS_KEY, '1');
    })();
}

function initialize(db: Database.Database) {
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    // Create transactions table
    db.exec(`
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
        db.exec('ALTER TABLE transactions ADD COLUMN isInternalTransfer INTEGER DEFAULT 0');
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add subscription columns
    try {
        db.exec('ALTER TABLE transactions ADD COLUMN isSubscription INTEGER DEFAULT 0');
    } catch (e) {}

    try {
        db.exec('ALTER TABLE transactions ADD COLUMN subscriptionInterval TEXT');
    } catch (e) {}

    try {
        db.exec('ALTER TABLE transactions ADD COLUMN excludeFromSubscriptions INTEGER DEFAULT 0');
    } catch (e) {}

    try {
        db.exec('ALTER TABLE transactions ADD COLUMN category_user_set INTEGER DEFAULT 0');
    } catch (e) {
        /* column exists */
    }

    // Create categories cache table
    db.exec(`
        CREATE TABLE IF NOT EXISTS categories_cache (
            description TEXT PRIMARY KEY,
            category TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Fraud findings table (local and/or AI detectors)
    db.exec(`
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
    db.exec('CREATE INDEX IF NOT EXISTS idx_fraud_findings_txn ON fraud_findings(txn_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fraud_findings_created_at ON fraud_findings(created_at)');

    // Global AI memory (single workspace — shared across web and Telegram)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ai_memory_facts (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS ai_memory_insights (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    try {
        db.exec('ALTER TABLE ai_memory_insights ADD COLUMN score INTEGER DEFAULT 50');
    } catch (_) {
        /* column exists */
    }
    try {
        db.exec('UPDATE ai_memory_insights SET score = 50 WHERE score IS NULL');
    } catch (_) {}

    db.exec(`
        CREATE TABLE IF NOT EXISTS ai_memory_alerts (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 50,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_ai_memory_insights_created ON ai_memory_insights(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ai_memory_insights_score ON ai_memory_insights(score DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ai_memory_alerts_score ON ai_memory_alerts(score DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ai_memory_alerts_created ON ai_memory_alerts(created_at)');

    seedDefaultAiMemoryFactsIfNeeded(db);

    db.exec(`
        CREATE TABLE IF NOT EXISTS ai_memory_dismissed_alert_keys (
            normalized_key TEXT PRIMARY KEY,
            dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    serverLogger.info('Database initialized');
}

function getSharedDb(): Database.Database {
    if (sharedDb) return sharedDb;
    fs.ensureDirSync(DATA_DIR);
    sharedDb = new Database(DB_PATH);
    initialize(sharedDb);
    return sharedDb;
}

/**
 * Close the shared DB connection so the database file can be replaced (e.g. during backup restore).
 * The next getSharedDb() call will open the database again.
 */
export function closeDbForRestore(): void {
    if (sharedDb) {
        try {
            sharedDb.pragma('wal_checkpoint(TRUNCATE)');
        } catch (_) {}
        sharedDb.close();
        sharedDb = null;
    }
}

export class DbService {
    /** Getter so we always use the current shared connection (reopened after restore). */
    private get db(): Database.Database {
        return getSharedDb();
    }

    // --- Transactions ---

    /** @returns true if a new row was inserted (not a duplicate id). */
    addTransaction(transaction: Transaction): boolean {
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO transactions (
                id, accountNumber, date, description, amount, category, category_user_set, provider, isInternalTransfer, isSubscription, subscriptionInterval, excludeFromSubscriptions, raw_data
            ) VALUES (
                @id, @accountNumber, @date, @description, @amount, @category, @category_user_set, @provider, @isInternalTransfer, @isSubscription, @subscriptionInterval, @excludeFromSubscriptions, @raw_data
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
        const result = stmt.run({
            id: transaction.id,
            accountNumber: transaction.accountNumber,
            date: transaction.date,
            description: transaction.description,
            amount: transaction.amount,
            category: transaction.category,
            category_user_set: transaction.categoryUserSet ? 1 : 0,
            provider: transaction.provider || 'unknown',
            isInternalTransfer: isInternalValue,
            isSubscription: transaction.isSubscription ? 1 : 0,
            subscriptionInterval: transaction.subscriptionInterval || null,
            excludeFromSubscriptions: transaction.excludeFromSubscriptions ? 1 : 0,
            raw_data: rawData
        });
        return result.changes > 0;
    }

    transactionExists(id: string): boolean {
        const stmt = this.db.prepare('SELECT 1 FROM transactions WHERE id = ?');
        return !!stmt.get(id);
    }

    getAllTransactions(includeIgnored = false): Transaction[] {
        let query =
            'SELECT raw_data, category, category_user_set, isIgnored, isInternalTransfer, isSubscription, subscriptionInterval, excludeFromSubscriptions FROM transactions';
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
            txn.categoryUserSet = Boolean(row.category_user_set);
            txn.isIgnored = Boolean(row.isIgnored);
            // Same derivation as addTransaction — raw txnType/type must win over a stale isInternalTransfer column
            // (otherwise explicit false blocks isInternalTransfer() from ever seeing txnType).
            let isInternalValue: number | null = null;
            if (txn.isInternalTransfer === true || txn.txnType === 'internal_transfer' || txn.type === 'internal_transfer') {
                isInternalValue = 1;
            } else if (txn.isInternalTransfer === false) {
                isInternalValue = 0;
            }
            if (isInternalValue === null) {
                if (row.isInternalTransfer !== null && row.isInternalTransfer !== undefined) {
                    txn.isInternalTransfer = Boolean(row.isInternalTransfer);
                } else {
                    txn.isInternalTransfer = undefined;
                }
            } else {
                txn.isInternalTransfer = Boolean(isInternalValue);
            }
            txn.isSubscription = Boolean(row.isSubscription);
            txn.subscriptionInterval = row.subscriptionInterval;
            txn.excludeFromSubscriptions = Boolean(row.excludeFromSubscriptions);
            return txn;
        });
    }

    /**
     * Align isInternalTransfer column and raw_data with txnType/type from raw_data.
     * Run after backup restore when an older DB had the column out of sync with JSON in raw_data.
     */
    reconcileInternalTransferColumnFromRawData(): number {
        const stmt = this.db.prepare('SELECT id, raw_data, isInternalTransfer FROM transactions');
        const rows = stmt.all() as { id: string; raw_data: string; isInternalTransfer: number | null }[];
        const updateStmt = this.db.prepare('UPDATE transactions SET raw_data = ?, isInternalTransfer = ? WHERE id = ?');
        let count = 0;
        for (const row of rows) {
            let txn: Transaction;
            try {
                txn = JSON.parse(row.raw_data);
            } catch {
                continue;
            }
            let isInternalValue: number | null = null;
            if (txn.isInternalTransfer === true || txn.txnType === 'internal_transfer' || txn.type === 'internal_transfer') {
                isInternalValue = 1;
            } else if (txn.isInternalTransfer === false) {
                isInternalValue = 0;
            }
            if (isInternalValue === null) continue;

            const expectedBool = isInternalValue === 1;
            const colTrue = row.isInternalTransfer === 1;
            const colMatch = colTrue === expectedBool;
            const rawMatch = txn.isInternalTransfer === expectedBool;
            if (colMatch && rawMatch) continue;

            txn.isInternalTransfer = expectedBool;
            updateStmt.run(JSON.stringify(txn), isInternalValue, row.id);
            count++;
        }
        return count;
    }

    /**
     * @param categoryUserSet When set, updates the flag: true = user-chosen category, false = AI/system.
     *                        When undefined, only the category column is updated (legacy callers).
     */
    updateTransactionCategory(id: string, category: string, categoryUserSet?: boolean): boolean {
        if (categoryUserSet === undefined) {
            const stmt = this.db.prepare('UPDATE transactions SET category = ? WHERE id = ?');
            const info = stmt.run(category, id);
            return info.changes > 0;
        }
        const stmt = this.db.prepare('UPDATE transactions SET category = ?, category_user_set = ? WHERE id = ?');
        const info = stmt.run(category, categoryUserSet ? 1 : 0, id);
        return info.changes > 0;
    }

    /**
     * @param categoryUserSet When true, marks rows as user-set for this description (skips AI overwrite).
     */
    updateCategoryByDescription(description: string, category: string, categoryUserSet?: boolean): number {
        if (categoryUserSet === undefined) {
            const stmt = this.db.prepare('UPDATE transactions SET category = ? WHERE description = ?');
            const info = stmt.run(category, description);
            return info.changes;
        }
        const stmt = this.db.prepare(
            'UPDATE transactions SET category = ?, category_user_set = ? WHERE description = ?'
        );
        const info = stmt.run(category, categoryUserSet ? 1 : 0, description);
        return info.changes;
    }

    /** True if any row with this description has a user-chosen category (do not bulk-reclassify). */
    descriptionHasUserSetCategory(description: string): boolean {
        const stmt = this.db.prepare(
            'SELECT 1 FROM transactions WHERE description = ? AND category_user_set = 1 LIMIT 1'
        );
        return !!stmt.get(description);
    }

    /** True if this row was categorized by the user (AI / imports must not overwrite). */
    transactionCategoryIsUserSet(id: string): boolean {
        const stmt = this.db.prepare('SELECT category_user_set FROM transactions WHERE id = ?');
        const row = stmt.get(id) as { category_user_set?: number } | undefined;
        return Boolean(row?.category_user_set);
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
        const getStmt = this.db.prepare('SELECT raw_data FROM transactions WHERE id = ?');
        const row: any = getStmt.get(id);
        if (!row) return false;

        const txn = JSON.parse(row.raw_data) as Transaction;
        txn.isIgnored = isIgnored;
        if (isIgnored) {
            txn.status = 'ignored';
        } else if (txn.status === 'ignored') {
            txn.status = 'completed';
        }

        const stmt = this.db.prepare('UPDATE transactions SET isIgnored = ?, raw_data = ? WHERE id = ?');
        const info = stmt.run(isIgnored ? 1 : 0, JSON.stringify(txn), id);
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

    checkpoint() {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
    }

    close() {
        closeDbForRestore();
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

    // --- AI memory (facts + insights) ---

    listAiMemoryFacts(): { id: string; text: string; createdAt: string; updatedAt: string }[] {
        const stmt = this.db.prepare(
            `SELECT id, text, created_at, updated_at FROM ai_memory_facts ORDER BY updated_at DESC`
        );
        const rows = stmt.all() as { id: string; text: string; created_at: string; updated_at: string }[];
        return rows.map((r) => ({
            id: r.id,
            text: r.text,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));
    }

    insertAiMemoryFact(id: string, text: string): void {
        const stmt = this.db.prepare(
            `INSERT INTO ai_memory_facts (id, text, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        );
        stmt.run(id, text);
    }

    updateAiMemoryFact(id: string, text: string): boolean {
        const stmt = this.db.prepare(
            `UPDATE ai_memory_facts SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        );
        const info = stmt.run(text, id);
        return info.changes > 0;
    }

    deleteAiMemoryFact(id: string): boolean {
        const stmt = this.db.prepare(`DELETE FROM ai_memory_facts WHERE id = ?`);
        const info = stmt.run(id);
        return info.changes > 0;
    }

    clearAllAiMemoryFacts(): number {
        return this.db.prepare(`DELETE FROM ai_memory_facts`).run().changes;
    }

    /** For prompts: highest score first, then recent */
    listAiMemoryInsights(limit: number = 200): { id: string; text: string; score: number; createdAt: string }[] {
        const stmt = this.db.prepare(
            `SELECT id, text, COALESCE(score, 50) as score, created_at FROM ai_memory_insights ORDER BY COALESCE(score, 50) DESC, created_at DESC LIMIT ?`
        );
        const rows = stmt.all(limit) as { id: string; text: string; score: number; created_at: string }[];
        return rows.map((r) => ({
            id: r.id,
            text: r.text,
            score: Number(r.score),
            createdAt: r.created_at,
        }));
    }

    /** Top insights by importance score (for dashboard) */
    topAiMemoryInsights(limit: number = 3): { id: string; text: string; score: number; createdAt: string }[] {
        return this.listAiMemoryInsights(limit);
    }

    insertAiMemoryInsight(id: string, text: string, score: number = 50): void {
        const s = Math.max(1, Math.min(100, Math.round(score)));
        const stmt = this.db.prepare(
            `INSERT INTO ai_memory_insights (id, text, score, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
        );
        stmt.run(id, text, s);
    }

    deleteAiMemoryInsight(id: string): boolean {
        const stmt = this.db.prepare(`DELETE FROM ai_memory_insights WHERE id = ?`);
        const info = stmt.run(id);
        return info.changes > 0;
    }

    clearAllAiMemoryInsights(): number {
        return this.db.prepare(`DELETE FROM ai_memory_insights`).run().changes;
    }

    /** Deletes rows strictly older than `days` (by created_at). No-op if days < 1. */
    deleteAiMemoryInsightsOlderThan(days: number): number {
        const d = Math.floor(days);
        if (d < 1 || !Number.isFinite(d)) return 0;
        const mod = `-${d} days`;
        const stmt = this.db.prepare(
            `DELETE FROM ai_memory_insights WHERE datetime(created_at) < datetime('now', ?)`
        );
        return stmt.run(mod).changes;
    }

    listAiMemoryAlerts(limit: number = 200): { id: string; text: string; score: number; createdAt: string }[] {
        const stmt = this.db.prepare(
            `SELECT id, text, score, created_at FROM ai_memory_alerts ORDER BY score DESC, created_at DESC LIMIT ?`
        );
        const rows = stmt.all(limit) as { id: string; text: string; score: number; created_at: string }[];
        return rows.map((r) => ({
            id: r.id,
            text: r.text,
            score: Number(r.score),
            createdAt: r.created_at,
        }));
    }

    insertAiMemoryAlert(id: string, text: string, score: number = 50): void {
        const s = Math.max(1, Math.min(100, Math.round(score)));
        const stmt = this.db.prepare(
            `INSERT INTO ai_memory_alerts (id, text, score, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
        );
        stmt.run(id, text, s);
    }

    isAiMemoryAlertDismissed(normalizedKey: string): boolean {
        const row = this.db
            .prepare(`SELECT 1 AS ok FROM ai_memory_dismissed_alert_keys WHERE normalized_key = ? LIMIT 1`)
            .get(normalizedKey) as { ok: number } | undefined;
        return !!row;
    }

    deleteAiMemoryAlert(id: string): boolean {
        const row = this.db.prepare(`SELECT text FROM ai_memory_alerts WHERE id = ?`).get(id) as
            | { text: string }
            | undefined;
        if (!row) return false;
        const key = normalizeAiMemoryKey(row.text);
        this.db
            .prepare(
                `INSERT OR IGNORE INTO ai_memory_dismissed_alert_keys (normalized_key, dismissed_at) VALUES (?, CURRENT_TIMESTAMP)`
            )
            .run(key);
        const stmt = this.db.prepare(`DELETE FROM ai_memory_alerts WHERE id = ?`);
        const info = stmt.run(id);
        return info.changes > 0;
    }

    /** Removes all alert rows without recording dismissal keys (explicit bulk clear). */
    clearAllAiMemoryAlerts(): number {
        return this.db.prepare(`DELETE FROM ai_memory_alerts`).run().changes;
    }

    /** Deletes rows strictly older than `days` (by created_at). No-op if days < 1. */
    deleteAiMemoryAlertsOlderThan(days: number): number {
        const d = Math.floor(days);
        if (d < 1 || !Number.isFinite(d)) return 0;
        const mod = `-${d} days`;
        const stmt = this.db.prepare(
            `DELETE FROM ai_memory_alerts WHERE datetime(created_at) < datetime('now', ?)`
        );
        return stmt.run(mod).changes;
    }
}
