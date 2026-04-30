import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import {
    Transaction,
    FraudDetectorType,
    FraudFinding,
    FraudSeverity,
    type InsightRuleDefinitionV1,
    type InsightRuleSource,
} from '@app/shared';
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

    db.exec(`
        CREATE TABLE IF NOT EXISTS insight_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            priority INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'user',
            definition_json TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_insight_rules_enabled ON insight_rules(enabled)`);

    db.exec(`
        CREATE TABLE IF NOT EXISTS insight_rule_fires (
            id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL,
            period_key TEXT NOT NULL,
            kind TEXT NOT NULL,
            score INTEGER NOT NULL,
            message_en TEXT NOT NULL,
            message_he TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (rule_id) REFERENCES insight_rules(id) ON DELETE CASCADE,
            UNIQUE(rule_id, period_key)
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_insight_rule_fires_score ON insight_rule_fires(score DESC)`);

    db.exec(`
        CREATE TABLE IF NOT EXISTS investments (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            quantity REAL NOT NULL,
            purchase_price_per_unit REAL NOT NULL,
            currency TEXT NOT NULL,
            track_from_date TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id)`);
    try {
        db.exec('ALTER TABLE investments ADD COLUMN source_transaction_id TEXT');
    } catch (_) {
        /* column exists */
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_investments_source_txn ON investments(source_transaction_id)`);
    try {
        db.exec('ALTER TABLE investments ADD COLUMN use_tel_aviv_listing INTEGER NOT NULL DEFAULT 1');
    } catch (_) {
        /* column exists */
    }
    const TASE_DEFAULT_MIGRATION_KEY = 'migrated_investments_tase_default_v1';
    const taseMigrated = db.prepare(`SELECT 1 FROM db_meta WHERE key = ?`).get(TASE_DEFAULT_MIGRATION_KEY);
    if (!taseMigrated) {
        try {
            db.exec(
                `UPDATE investments SET use_tel_aviv_listing = CASE WHEN UPPER(currency) = 'ILS' THEN 1 ELSE 0 END`
            );
            db.prepare(`INSERT OR IGNORE INTO db_meta (key, value) VALUES (?, '1')`).run(TASE_DEFAULT_MIGRATION_KEY);
        } catch (_) {
            /* ignore if investments missing */
        }
    }
    try {
        db.exec(`ALTER TABLE investments ADD COLUMN value_in_agorot INTEGER NOT NULL DEFAULT 0`);
    } catch (_) {
        /* column exists */
    }
    try {
        db.exec(`UPDATE investments SET value_in_agorot = 0 WHERE UPPER(currency) != 'ILS'`);
    } catch (_) {
        /* ignore */
    }
    try {
        db.exec(`ALTER TABLE investments ADD COLUMN nickname TEXT`);
    } catch (_) {
        /* column exists */
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_history (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            snapshot_date TEXT NOT NULL,
            total_value REAL NOT NULL,
            display_currency TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, snapshot_date)
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_date ON portfolio_history(user_id, snapshot_date)`);

    db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_snapshot_settings (
            user_id TEXT PRIMARY KEY,
            run_time TEXT NOT NULL DEFAULT '22:00',
            timezone TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
            enabled INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.prepare(
        `INSERT OR IGNORE INTO portfolio_snapshot_settings (user_id, run_time, timezone, enabled) VALUES ('local', '22:00', 'Asia/Jerusalem', 1)`
    ).run();

    db.exec(`
        CREATE TABLE IF NOT EXISTS investment_app_settings (
            user_id TEXT PRIMARY KEY,
            feature_enabled INTEGER NOT NULL DEFAULT 1,
            eodhd_api_token TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.prepare(
        `INSERT OR IGNORE INTO investment_app_settings (user_id, feature_enabled, eodhd_api_token) VALUES ('local', 0, NULL)`
    ).run();
    try {
        db.exec(
            `ALTER TABLE investment_app_settings ADD COLUMN eodhd_quote_mode TEXT NOT NULL DEFAULT 'realtime'`
        );
    } catch (_) {
        /* column exists */
    }
    try {
        db.exec(
            `ALTER TABLE investment_app_settings ADD COLUMN portfolio_historic_usd_ils INTEGER NOT NULL DEFAULT 1`
        );
    } catch (_) {
        /* column exists */
    }

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

    private mapRawTransactionRow(row: {
        raw_data: string;
        category: string;
        category_user_set: number;
        isIgnored: number;
        isInternalTransfer: number | null;
        isSubscription: number;
        subscriptionInterval: string | null;
        excludeFromSubscriptions: number;
    }): Transaction {
        const txn = JSON.parse(row.raw_data) as Transaction;
        txn.category = row.category;
        txn.categoryUserSet = Boolean(row.category_user_set);
        txn.isIgnored = Boolean(row.isIgnored);
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
        txn.subscriptionInterval = row.subscriptionInterval as Transaction['subscriptionInterval'];
        txn.excludeFromSubscriptions = Boolean(row.excludeFromSubscriptions);
        return txn;
    }

    getTransactionById(id: string): Transaction | undefined {
        const row = this.db
            .prepare(
                `SELECT raw_data, category, category_user_set, isIgnored, isInternalTransfer, isSubscription, subscriptionInterval, excludeFromSubscriptions
                 FROM transactions WHERE id = ?`
            )
            .get(id) as
            | {
                  raw_data: string;
                  category: string;
                  category_user_set: number;
                  isIgnored: number;
                  isInternalTransfer: number | null;
                  isSubscription: number;
                  subscriptionInterval: string | null;
                  excludeFromSubscriptions: number;
              }
            | undefined;
        return row ? this.mapRawTransactionRow(row) : undefined;
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

        return rows.map((row: any) => this.mapRawTransactionRow(row));
    }

    updateTransactionInvestmentMetadata(
        id: string,
        patch: { isInvestment?: boolean; investmentId?: string | null }
    ): boolean {
        const getStmt = this.db.prepare('SELECT raw_data FROM transactions WHERE id = ?');
        const row = getStmt.get(id) as { raw_data: string } | undefined;
        if (!row) return false;

        const txn = JSON.parse(row.raw_data) as Transaction;
        if (patch.isInvestment !== undefined) {
            txn.isInvestment = patch.isInvestment;
        }
        if (patch.investmentId !== undefined) {
            if (patch.investmentId === null || patch.investmentId === '') {
                delete txn.investmentId;
            } else {
                txn.investmentId = patch.investmentId;
            }
        }

        const updateStmt = this.db.prepare('UPDATE transactions SET raw_data = ? WHERE id = ?');
        return updateStmt.run(JSON.stringify(txn), id).changes > 0;
    }

    investmentExistsForSourceTransaction(sourceTransactionId: string): boolean {
        const row = this.db
            .prepare(`SELECT COUNT(*) as n FROM investments WHERE source_transaction_id = ?`)
            .get(sourceTransactionId) as { n: number } | undefined;
        return Boolean(row && Number(row.n) > 0);
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

    // --- Insight rules (rules engine) ---

    listInsightRules(): {
        id: string;
        name: string;
        enabled: boolean;
        priority: number;
        source: InsightRuleSource;
        definition: InsightRuleDefinitionV1;
        createdAt: string;
        updatedAt: string;
    }[] {
        const rows = this.db
            .prepare(
                `SELECT id, name, enabled, priority, source, definition_json, created_at, updated_at FROM insight_rules ORDER BY priority DESC, name ASC`
            )
            .all() as {
            id: string;
            name: string;
            enabled: number;
            priority: number;
            source: string;
            definition_json: string;
            created_at: string;
            updated_at: string;
        }[];
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            enabled: r.enabled !== 0,
            priority: r.priority,
            source: (r.source === 'ai' ? 'ai' : 'user') as InsightRuleSource,
            definition: JSON.parse(r.definition_json) as InsightRuleDefinitionV1,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));
    }

    getInsightRule(id: string):
        | {
              id: string;
              name: string;
              enabled: boolean;
              priority: number;
              source: InsightRuleSource;
              definition: InsightRuleDefinitionV1;
              createdAt: string;
              updatedAt: string;
          }
        | undefined {
        const r = this.db
            .prepare(
                `SELECT id, name, enabled, priority, source, definition_json, created_at, updated_at FROM insight_rules WHERE id = ?`
            )
            .get(id) as
            | {
                  id: string;
                  name: string;
                  enabled: number;
                  priority: number;
                  source: string;
                  definition_json: string;
                  created_at: string;
                  updated_at: string;
              }
            | undefined;
        if (!r) return undefined;
        return {
            id: r.id,
            name: r.name,
            enabled: r.enabled !== 0,
            priority: r.priority,
            source: (r.source === 'ai' ? 'ai' : 'user') as InsightRuleSource,
            definition: JSON.parse(r.definition_json) as InsightRuleDefinitionV1,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }

    insertInsightRule(
        id: string,
        name: string,
        enabled: boolean,
        priority: number,
        source: InsightRuleSource,
        definition: InsightRuleDefinitionV1
    ): void {
        this.db
            .prepare(
                `INSERT INTO insight_rules (id, name, enabled, priority, source, definition_json, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
            )
            .run(id, name, enabled ? 1 : 0, priority, source, JSON.stringify(definition));
    }

    updateInsightRule(
        id: string,
        updates: {
            name?: string;
            enabled?: boolean;
            priority?: number;
            source?: InsightRuleSource;
            definition?: InsightRuleDefinitionV1;
        }
    ): boolean {
        const row = this.getInsightRule(id);
        if (!row) return false;
        const name = updates.name ?? row.name;
        const enabled = updates.enabled ?? row.enabled;
        const priority = updates.priority ?? row.priority;
        const source = updates.source ?? row.source;
        const definition = updates.definition ?? row.definition;
        const info = this.db
            .prepare(
                `UPDATE insight_rules SET name = ?, enabled = ?, priority = ?, source = ?, definition_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            )
            .run(name, enabled ? 1 : 0, priority, source, JSON.stringify(definition), id);
        return info.changes > 0;
    }

    deleteInsightRule(id: string): boolean {
        const stmt = this.db.prepare(`DELETE FROM insight_rules WHERE id = ?`);
        return stmt.run(id).changes > 0;
    }

    clearAllInsightRules(): number {
        return this.db.prepare(`DELETE FROM insight_rules`).run().changes;
    }

    upsertInsightRuleFire(
        id: string,
        ruleId: string,
        periodKey: string,
        kind: 'insight' | 'alert',
        score: number,
        messageEn: string,
        messageHe: string
    ): void {
        const s = Math.max(1, Math.min(100, Math.round(score)));
        this.db
            .prepare(
                `INSERT INTO insight_rule_fires (id, rule_id, period_key, kind, score, message_en, message_he, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(rule_id, period_key) DO UPDATE SET
                   id = excluded.id,
                   kind = excluded.kind,
                   score = excluded.score,
                   message_en = excluded.message_en,
                   message_he = excluded.message_he,
                   updated_at = CURRENT_TIMESTAMP`
            )
            .run(id, ruleId, periodKey, kind, s, messageEn, messageHe);
    }

    listInsightRuleFires(limit: number = 200): {
        id: string;
        ruleId: string;
        periodKey: string;
        kind: 'insight' | 'alert';
        score: number;
        messageEn: string;
        messageHe: string;
        updatedAt: string;
    }[] {
        const rows = this.db
            .prepare(
                `SELECT id, rule_id, period_key, kind, score, message_en, message_he, updated_at
                 FROM insight_rule_fires ORDER BY score DESC, updated_at DESC LIMIT ?`
            )
            .all(limit) as {
            id: string;
            rule_id: string;
            period_key: string;
            kind: string;
            score: number;
            message_en: string;
            message_he: string;
            updated_at: string;
        }[];
        return rows.map((r) => ({
            id: r.id,
            ruleId: r.rule_id,
            periodKey: r.period_key,
            kind: r.kind === 'alert' ? 'alert' : 'insight',
            score: Number(r.score),
            messageEn: r.message_en,
            messageHe: r.message_he,
            updatedAt: r.updated_at,
        }));
    }

    deleteInsightRuleFire(id: string): boolean {
        return this.db.prepare(`DELETE FROM insight_rule_fires WHERE id = ?`).run(id).changes > 0;
    }

    deleteInsightRuleFiresByRuleId(ruleId: string): number {
        return this.db.prepare(`DELETE FROM insight_rule_fires WHERE rule_id = ?`).run(ruleId).changes;
    }

    deleteInsightRuleFireByRuleAndPeriod(ruleId: string, periodKey: string): boolean {
        return this.db.prepare(`DELETE FROM insight_rule_fires WHERE rule_id = ? AND period_key = ?`).run(ruleId, periodKey).changes > 0;
    }

    // --- Investments & portfolio ---

    listInvestments(userId: string): {
        id: string;
        userId: string;
        symbol: string;
        nickname: string | null;
        quantity: number;
        purchasePricePerUnit: number;
        currency: string;
        trackFromDate: string;
        sourceTransactionId: string | null;
        useTelAvivListing: boolean;
        valueInAgorot: boolean;
        createdAt: string;
        updatedAt: string;
    }[] {
        const rows = this.db
            .prepare(
                `SELECT id, user_id, symbol, nickname, quantity, purchase_price_per_unit, currency, track_from_date, source_transaction_id, use_tel_aviv_listing, value_in_agorot, created_at, updated_at
                 FROM investments WHERE user_id = ? ORDER BY symbol ASC, created_at ASC`
            )
            .all(userId) as {
            id: string;
            user_id: string;
            symbol: string;
            nickname: string | null;
            quantity: number;
            purchase_price_per_unit: number;
            currency: string;
            track_from_date: string;
            source_transaction_id: string | null;
            use_tel_aviv_listing: number | null;
            value_in_agorot: number | null;
            created_at: string;
            updated_at: string;
        }[];
        return rows.map((r) => ({
            id: r.id,
            userId: r.user_id,
            symbol: r.symbol,
            nickname: r.nickname != null && String(r.nickname).trim() !== '' ? String(r.nickname).trim() : null,
            quantity: Number(r.quantity),
            purchasePricePerUnit: Number(r.purchase_price_per_unit),
            currency: r.currency,
            trackFromDate: r.track_from_date,
            sourceTransactionId: r.source_transaction_id ?? null,
            useTelAvivListing:
                r.use_tel_aviv_listing == null
                    ? r.currency?.toUpperCase() === 'ILS'
                    : Boolean(r.use_tel_aviv_listing),
            valueInAgorot: Boolean(r.value_in_agorot),
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));
    }

    getInvestment(id: string):
        | {
              id: string;
              userId: string;
              symbol: string;
              nickname: string | null;
              quantity: number;
              purchasePricePerUnit: number;
              currency: string;
              trackFromDate: string;
              sourceTransactionId: string | null;
              useTelAvivListing: boolean;
              valueInAgorot: boolean;
              createdAt: string;
              updatedAt: string;
          }
        | undefined {
        const r = this.db
            .prepare(
                `SELECT id, user_id, symbol, nickname, quantity, purchase_price_per_unit, currency, track_from_date, source_transaction_id, use_tel_aviv_listing, value_in_agorot, created_at, updated_at
                 FROM investments WHERE id = ?`
            )
            .get(id) as
            | {
                  id: string;
                  user_id: string;
                  symbol: string;
                  nickname: string | null;
                  quantity: number;
                  purchase_price_per_unit: number;
                  currency: string;
                  track_from_date: string;
                  source_transaction_id: string | null;
                  use_tel_aviv_listing: number | null;
                  value_in_agorot: number | null;
                  created_at: string;
                  updated_at: string;
              }
            | undefined;
        if (!r) return undefined;
        return {
            id: r.id,
            userId: r.user_id,
            symbol: r.symbol,
            nickname: r.nickname != null && String(r.nickname).trim() !== '' ? String(r.nickname).trim() : null,
            quantity: Number(r.quantity),
            purchasePricePerUnit: Number(r.purchase_price_per_unit),
            currency: r.currency,
            trackFromDate: r.track_from_date,
            sourceTransactionId: r.source_transaction_id ?? null,
            useTelAvivListing:
                r.use_tel_aviv_listing == null
                    ? r.currency?.toUpperCase() === 'ILS'
                    : Boolean(r.use_tel_aviv_listing),
            valueInAgorot: Boolean(r.value_in_agorot),
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }

    insertInvestment(row: {
        id: string;
        userId: string;
        symbol: string;
        nickname?: string | null;
        quantity: number;
        purchasePricePerUnit: number;
        currency: string;
        trackFromDate: string;
        sourceTransactionId?: string | null;
        useTelAvivListing?: boolean;
        valueInAgorot?: boolean;
    }): void {
        const tel =
            row.useTelAvivListing === undefined
                ? row.currency?.toUpperCase() === 'ILS'
                    ? 1
                    : 0
                : row.useTelAvivListing
                  ? 1
                  : 0;
        const ag =
            row.valueInAgorot && row.currency?.toUpperCase() === 'ILS'
                ? 1
                : 0;
        const nick =
            row.nickname != null && String(row.nickname).trim() !== '' ? String(row.nickname).trim() : null;
        this.db
            .prepare(
                `INSERT INTO investments (id, user_id, symbol, nickname, quantity, purchase_price_per_unit, currency, track_from_date, source_transaction_id, use_tel_aviv_listing, value_in_agorot, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
            )
            .run(
                row.id,
                row.userId,
                row.symbol,
                nick,
                row.quantity,
                row.purchasePricePerUnit,
                row.currency,
                row.trackFromDate,
                row.sourceTransactionId ?? null,
                tel,
                ag
            );
    }

    updateInvestment(
        id: string,
        patch: Partial<{
            symbol: string;
            nickname: string | null;
            quantity: number;
            purchasePricePerUnit: number;
            currency: string;
            trackFromDate: string;
            useTelAvivListing: boolean;
            valueInAgorot: boolean;
        }>
    ): boolean {
        const fields: string[] = [];
        const values: (string | number | null)[] = [];
        if (patch.symbol !== undefined) {
            fields.push('symbol = ?');
            values.push(patch.symbol);
        }
        if (patch.nickname !== undefined) {
            fields.push('nickname = ?');
            values.push(patch.nickname);
        }
        if (patch.quantity !== undefined) {
            fields.push('quantity = ?');
            values.push(patch.quantity);
        }
        if (patch.purchasePricePerUnit !== undefined) {
            fields.push('purchase_price_per_unit = ?');
            values.push(patch.purchasePricePerUnit);
        }
        if (patch.currency !== undefined) {
            fields.push('currency = ?');
            values.push(patch.currency);
        }
        if (patch.trackFromDate !== undefined) {
            fields.push('track_from_date = ?');
            values.push(patch.trackFromDate);
        }
        if (patch.useTelAvivListing !== undefined) {
            fields.push('use_tel_aviv_listing = ?');
            values.push(patch.useTelAvivListing ? 1 : 0);
        }
        if (patch.valueInAgorot !== undefined) {
            fields.push('value_in_agorot = ?');
            values.push(patch.valueInAgorot ? 1 : 0);
        }
        if (fields.length === 0) return false;
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        const sql = `UPDATE investments SET ${fields.join(', ')} WHERE id = ?`;
        return this.db.prepare(sql).run(...values).changes > 0;
    }

    deleteInvestment(id: string): boolean {
        return this.db.prepare(`DELETE FROM investments WHERE id = ?`).run(id).changes > 0;
    }

    listPortfolioHistory(
        userId: string,
        opts?: { fromDate?: string; toDate?: string }
    ): { id: string; snapshotDate: string; totalValue: number; displayCurrency: string }[] {
        let sql = `SELECT id, snapshot_date, total_value, display_currency FROM portfolio_history WHERE user_id = ?`;
        const params: string[] = [userId];
        if (opts?.fromDate) {
            sql += ` AND snapshot_date >= ?`;
            params.push(opts.fromDate);
        }
        if (opts?.toDate) {
            sql += ` AND snapshot_date <= ?`;
            params.push(opts.toDate);
        }
        sql += ` ORDER BY snapshot_date ASC`;
        const rows = this.db.prepare(sql).all(...params) as {
            id: string;
            snapshot_date: string;
            total_value: number;
            display_currency: string;
        }[];
        return rows.map((r) => ({
            id: r.id,
            snapshotDate: r.snapshot_date,
            totalValue: Number(r.total_value),
            displayCurrency: r.display_currency,
        }));
    }

    /** Deletes all saved daily portfolio snapshots (SQLite `portfolio_history`). Does not affect EOD-based charts. */
    deleteAllPortfolioHistory(userId: string): number {
        return this.db.prepare(`DELETE FROM portfolio_history WHERE user_id = ?`).run(userId).changes;
    }

    upsertPortfolioHistorySnapshot(row: {
        id: string;
        userId: string;
        snapshotDate: string;
        totalValue: number;
        displayCurrency: string;
    }): void {
        this.db
            .prepare(
                `INSERT INTO portfolio_history (id, user_id, snapshot_date, total_value, display_currency, created_at)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
                   total_value = excluded.total_value,
                   display_currency = excluded.display_currency,
                   id = excluded.id`
            )
            .run(row.id, row.userId, row.snapshotDate, row.totalValue, row.displayCurrency);
    }

    getPortfolioSnapshotSettings(userId: string): {
        userId: string;
        runTime: string;
        timezone: string;
        enabled: boolean;
        updatedAt: string;
    } {
        const r = this.db
            .prepare(`SELECT user_id, run_time, timezone, enabled, updated_at FROM portfolio_snapshot_settings WHERE user_id = ?`)
            .get(userId) as
            | {
                  user_id: string;
                  run_time: string;
                  timezone: string;
                  enabled: number;
                  updated_at: string;
              }
            | undefined;
        if (!r) {
            return {
                userId,
                runTime: '22:00',
                timezone: 'Asia/Jerusalem',
                enabled: true,
                updatedAt: '',
            };
        }
        return {
            userId: r.user_id,
            runTime: r.run_time,
            timezone: r.timezone,
            enabled: r.enabled !== 0,
            updatedAt: r.updated_at,
        };
    }

    upsertPortfolioSnapshotSettings(row: {
        userId: string;
        runTime: string;
        timezone: string;
        enabled: boolean;
    }): void {
        this.db
            .prepare(
                `INSERT INTO portfolio_snapshot_settings (user_id, run_time, timezone, enabled, updated_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(user_id) DO UPDATE SET
                   run_time = excluded.run_time,
                   timezone = excluded.timezone,
                   enabled = excluded.enabled,
                   updated_at = CURRENT_TIMESTAMP`
            )
            .run(row.userId, row.runTime, row.timezone, row.enabled ? 1 : 0);
    }

    getInvestmentAppSettings(userId: string): {
        userId: string;
        featureEnabled: boolean;
        eodhdApiToken: string | null;
        eodhdQuoteMode: string;
        portfolioHistoricUsdIls: boolean;
        updatedAt: string;
    } {
        const r = this.db
            .prepare(
                `SELECT user_id, feature_enabled, eodhd_api_token, eodhd_quote_mode, portfolio_historic_usd_ils, updated_at FROM investment_app_settings WHERE user_id = ?`
            )
            .get(userId) as
            | {
                  user_id: string;
                  feature_enabled: number;
                  eodhd_api_token: string | null;
                  eodhd_quote_mode: string | null;
                  portfolio_historic_usd_ils: number | null;
                  updated_at: string;
              }
            | undefined;
        if (!r) {
            return {
                userId,
                featureEnabled: false,
                eodhdApiToken: null,
                eodhdQuoteMode: 'realtime',
                portfolioHistoricUsdIls: true,
                updatedAt: '',
            };
        }
        return {
            userId: r.user_id,
            featureEnabled: r.feature_enabled !== 0,
            eodhdApiToken: r.eodhd_api_token,
            eodhdQuoteMode: (r.eodhd_quote_mode && String(r.eodhd_quote_mode).trim()) || 'realtime',
            portfolioHistoricUsdIls: r.portfolio_historic_usd_ils == null ? true : r.portfolio_historic_usd_ils !== 0,
            updatedAt: r.updated_at,
        };
    }

    upsertInvestmentAppSettings(row: {
        userId: string;
        featureEnabled: boolean;
        eodhdApiToken: string | null;
        eodhdQuoteMode: string;
        portfolioHistoricUsdIls: boolean;
    }): void {
        this.db
            .prepare(
                `INSERT INTO investment_app_settings (user_id, feature_enabled, eodhd_api_token, eodhd_quote_mode, portfolio_historic_usd_ils, updated_at)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(user_id) DO UPDATE SET
                   feature_enabled = excluded.feature_enabled,
                   eodhd_api_token = excluded.eodhd_api_token,
                   eodhd_quote_mode = excluded.eodhd_quote_mode,
                   portfolio_historic_usd_ils = excluded.portfolio_historic_usd_ils,
                   updated_at = CURRENT_TIMESTAMP`
            )
            .run(
                row.userId,
                row.featureEnabled ? 1 : 0,
                row.eodhdApiToken,
                row.eodhdQuoteMode,
                row.portfolioHistoricUsdIls ? 1 : 0
            );
    }
}
