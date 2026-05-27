import {
    MAX_SQL_ANALYTIC_CARDS,
    type SqlAnalyticCardChartKind,
    type SqlAnalyticCardDefinition,
    type SqlAnalyticCardQuery,
} from './types.js';

const QUERY_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/i;
const COLUMN_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface SqlChartSeriesRow {
    label: string;
    [seriesKey: string]: string | number;
}

export interface SqlQueryResultShape {
    rows: Record<string, unknown>[];
    columns: string[];
    error?: string;
}

function asTrimmedString(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

function normalizeQueries(raw: unknown): SqlAnalyticCardQuery[] {
    if (!Array.isArray(raw)) return [];
    const out: SqlAnalyticCardQuery[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const key = asTrimmedString(o.key).toLowerCase();
        const sql = asTrimmedString(o.sql);
        if (!key || !QUERY_KEY_RE.test(key) || !sql || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, sql });
    }
    return out.slice(0, 8);
}

function normalizeChartKind(raw: unknown): SqlAnalyticCardChartKind {
    return raw === 'line' || raw === 'pie' ? raw : 'bar';
}

function normalizeValueLabels(raw: unknown, valueColumns: string[]): string[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: string[] = [];
    for (let i = 0; i < valueColumns.length; i++) {
        const v = raw[i];
        const label = typeof v === 'string' ? v.trim().slice(0, 80) : '';
        out.push(label);
    }
    const anySet = out.some(Boolean);
    return anySet ? out : undefined;
}

function normalizeValueColumns(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of raw) {
        const col = asTrimmedString(v);
        if (!col || !COLUMN_NAME_RE.test(col) || seen.has(col)) continue;
        seen.add(col);
        out.push(col);
        if (out.length >= 4) break;
    }
    return out;
}

/**
 * Validates and normalizes a SQL analytic card from AI or API input.
 */
export function sanitizeSqlAnalyticCard(
    raw: unknown,
    options?: { existingId?: string }
): { ok: true; value: SqlAnalyticCardDefinition } | { ok: false; error: string } {
    if (!raw || typeof raw !== 'object') {
        return { ok: false, error: 'Invalid card payload' };
    }
    const o = raw as Record<string, unknown>;
    const title = asTrimmedString(o.title);
    if (!title || title.length > 120) {
        return { ok: false, error: 'Title is required (max 120 characters)' };
    }
    const queries = normalizeQueries(o.queries);
    if (queries.length === 0) {
        return { ok: false, error: 'At least one SQL query is required' };
    }
    const dataQueryKey = asTrimmedString(o.dataQueryKey).toLowerCase();
    if (!dataQueryKey || !queries.some((q) => q.key === dataQueryKey)) {
        return { ok: false, error: 'dataQueryKey must match a query key' };
    }
    const labelColumn = asTrimmedString(o.labelColumn);
    if (!labelColumn || !COLUMN_NAME_RE.test(labelColumn)) {
        return { ok: false, error: 'labelColumn must be a valid SQL column alias' };
    }
    const valueColumns = normalizeValueColumns(o.valueColumns);
    if (valueColumns.length === 0) {
        return { ok: false, error: 'At least one valueColumn is required' };
    }
    const chartKind = normalizeChartKind(o.chartKind);
    if (chartKind === 'pie' && valueColumns.length > 1) {
        valueColumns.splice(1);
    }
    const descriptionRaw = asTrimmedString(o.description);
    const description = descriptionRaw ? descriptionRaw.slice(0, 400) : undefined;
    const id = options?.existingId?.trim() || asTrimmedString(o.id);
    if (!id) {
        return { ok: false, error: 'Card id is required' };
    }

    const valueLabels = normalizeValueLabels(o.valueLabels, valueColumns);

    return {
        ok: true,
        value: {
            id,
            title,
            description,
            chartKind,
            dataQueryKey,
            labelColumn,
            valueColumns,
            ...(valueLabels ? { valueLabels } : {}),
            queries,
            createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
        },
    };
}

/** Legend / tooltip label for a value column (falls back to column alias). */
export function resolveSqlValueDisplayLabel(
    column: string,
    index: number,
    valueLabels?: string[]
): string {
    const custom = valueLabels?.[index]?.trim();
    return custom || column;
}

export function assertSqlAnalyticCardsWithinLimit(
    cards: SqlAnalyticCardDefinition[],
    isEdit: boolean
): { ok: true } | { ok: false; error: string } {
    if (isEdit) return { ok: true };
    if (cards.length >= MAX_SQL_ANALYTIC_CARDS) {
        return {
            ok: false,
            error: `You can save at most ${MAX_SQL_ANALYTIC_CARDS} SQL analytic cards`,
        };
    }
    return { ok: true };
}

function coerceNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function formatLabel(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return String(v);
}

/**
 * Maps SQL result rows to Recharts-friendly series data.
 */
export function mapSqlResultToChartRows(
    result: SqlQueryResultShape,
    labelColumn: string,
    valueColumns: string[]
): { rows: SqlChartSeriesRow[]; error?: string } {
    if (result.error) {
        return { rows: [], error: result.error };
    }
    if (result.rows.length === 0) {
        return { rows: [], error: 'Query returned no rows' };
    }
    const labelKey = labelColumn;
    const rows: SqlChartSeriesRow[] = [];
    for (const raw of result.rows) {
        const label = formatLabel(raw[labelKey]);
        if (!label) continue;
        const row: SqlChartSeriesRow = { label };
        let hasValue = false;
        for (const col of valueColumns) {
            const n = coerceNumber(raw[col]);
            if (n == null) continue;
            row[col] = n;
            hasValue = true;
        }
        if (hasValue) rows.push(row);
    }
    if (rows.length === 0) {
        return {
            rows: [],
            error: `No chartable rows (check labelColumn "${labelColumn}" and valueColumns)`,
        };
    }
    return { rows };
}

export function validateChartColumnsAgainstResult(
    result: SqlQueryResultShape,
    labelColumn: string,
    valueColumns: string[]
): { ok: true } | { ok: false; error: string } {
    if (result.error) {
        return { ok: false, error: result.error };
    }
    const cols = new Set(
        result.columns.length > 0
            ? result.columns
            : result.rows.length > 0
              ? Object.keys(result.rows[0]!)
              : []
    );
    if (!cols.has(labelColumn)) {
        return { ok: false, error: `labelColumn "${labelColumn}" not found in query result` };
    }
    for (const vc of valueColumns) {
        if (!cols.has(vc)) {
            return { ok: false, error: `valueColumn "${vc}" not found in query result` };
        }
    }
    return { ok: true };
}
