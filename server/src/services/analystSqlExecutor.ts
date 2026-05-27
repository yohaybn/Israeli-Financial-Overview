import type Database from 'better-sqlite3';

export const ANALYST_SQL_MAX_QUERIES = 8;
export const ANALYST_SQL_MAX_LENGTH = 12_000;
export const ANALYST_SQL_MAX_ROWS = 500;

export type AnalystQueryRow = Record<string, unknown>;

export interface AnalystQueryResult {
    rows: AnalystQueryRow[];
    columns: string[];
    error?: string;
}

const FORBIDDEN =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|VACUUM|REINDEX|PRAGMA|TRUNCATE)\b/i;

/**
 * Validates that SQL is a single read-only SELECT (or WITH ... SELECT).
 */
export function validateAnalystSelectSql(sql: string): { ok: true } | { ok: false; error: string } {
    const trimmed = sql.trim();
    if (!trimmed) return { ok: false, error: 'Empty SQL' };
    if (trimmed.length > ANALYST_SQL_MAX_LENGTH) {
        return { ok: false, error: `SQL exceeds ${ANALYST_SQL_MAX_LENGTH} characters` };
    }
    if (FORBIDDEN.test(trimmed)) {
        return { ok: false, error: 'Only SELECT queries are allowed' };
    }
    const withoutStrings = trimmed.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    const statements = withoutStrings
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
    if (statements.length !== 1) {
        return { ok: false, error: 'Exactly one SQL statement per query' };
    }
    const stmt = statements[0]!;
    if (!/^(WITH|SELECT)\b/i.test(stmt)) {
        return { ok: false, error: 'Query must start with SELECT or WITH' };
    }
    return { ok: true };
}

function setupScopeTable(db: Database.Database, scopeTransactionIds: string[] | undefined): void {
    if (!scopeTransactionIds?.length) return;
    db.exec(`CREATE TEMP TABLE IF NOT EXISTS _analyst_scope_ids (id TEXT PRIMARY KEY)`);
    db.exec(`DELETE FROM _analyst_scope_ids`);
    const insert = db.prepare(`INSERT OR IGNORE INTO _analyst_scope_ids (id) VALUES (?)`);
    const runBatch = db.transaction((ids: string[]) => {
        for (const id of ids) insert.run(id);
    });
    runBatch(scopeTransactionIds);
}

function runOneQuery(db: Database.Database, sql: string): AnalystQueryResult {
    const validation = validateAnalystSelectSql(sql);
    if (!validation.ok) {
        return { rows: [], columns: [], error: validation.error };
    }
    try {
        const stmt = db.prepare(sql);
        const rows = stmt.all() as AnalystQueryRow[];
        const limited = rows.slice(0, ANALYST_SQL_MAX_ROWS);
        const columns =
            limited.length > 0
                ? Object.keys(limited[0] as object)
                : stmt.columns().map((c) => c.name);
        return { rows: limited, columns };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { rows: [], columns: [], error: msg };
    }
}

export function executeAnalystQueries(
    db: Database.Database,
    queries: { key: string; sql: string }[],
    options?: { scopeTransactionIds?: string[] }
): Record<string, AnalystQueryResult> {
    if (queries.length > ANALYST_SQL_MAX_QUERIES) {
        throw new Error(`At most ${ANALYST_SQL_MAX_QUERIES} queries allowed`);
    }
    const out: Record<string, AnalystQueryResult> = {};
    setupScopeTable(db, options?.scopeTransactionIds);
    for (const { key, sql } of queries) {
        const k = key.trim();
        if (!k) continue;
        out[k] = runOneQuery(db, sql);
    }
    try {
        db.exec(`DROP TABLE IF EXISTS _analyst_scope_ids`);
    } catch {
        /* temp table may not exist */
    }
    return out;
}
