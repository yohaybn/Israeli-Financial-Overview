import type { AnalystQueryResult } from './analystSqlExecutor.js';

const MAX_LIST_ROWS = 15;

/** Injected into super-privacy SQL prompts so templates fit the in-app analyst chat UI. */
export const ANALYST_CHAT_TEMPLATE_FORMAT_RULES = `
RESPONSE TEMPLATE — IN-APP CHAT FORMAT (required):
The "responseTemplate" is rendered in a narrow chat bubble with lightweight Markdown only (**bold**, *italic*, bullet lists, short paragraphs). The user reads this on mobile/desktop chat — not in a report or spreadsheet.

DO NOT use:
- Markdown pipe tables (lines like | A | B | or |---|---|) — they break layout in chat.
- HTML tags, code blocks, or wide preformatted blocks.
- Long walls of text; keep answers scannable.

DO use:
- One short opening line answering the question.
- **Bold labels** for sections (e.g. **Total spending**, **Top categories**).
- Bullet lists via {{q:key.list}} for multiple SQL rows (design queries with ≤15 rows for list placeholders).
- Inline scalars from the first result row: **{{q:query_key.sql_column_alias}}** (use the exact SQL column alias from your SELECT).
- {{q:key.count}} for row counts when useful.
- Separate bullets per insight; blank line between sections.

Placeholder reference (query_key = the "key" in queries[]; sql_column_alias = AS name in SELECT):
- {{q:query_key}} — first column of the first row only (avoid when SELECT returns multiple columns).
- {{q:query_key.column_alias}} — value from that column in the first row (preferred for multi-column SELECTs, e.g. {{q:total.total_spend}}, {{q:total.tx_count}}).
- {{q:query_key.count}} — number of rows returned.
- {{q:query_key.list}} — chat-friendly bullet list (preferred for rankings, categories, merchants).
- {{q:query_key.table}} — same as .list (do not write pipe tables yourself).

Example responseTemplate:
"**ביגוד**\\n\\nסה״כ: **{{q:total.total_spend}}** ₪ ({{q:total.tx_count}} עסקאות).\\n\\n**לפי חודש:**\\n{{q:monthly.list}}"
`.trim();

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
        if (Number.isFinite(value) && Math.abs(value) >= 1000) {
            return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
        }
        if (Number.isInteger(value)) return value.toLocaleString('en-US');
        return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    const s = String(value).trim();
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

const RESERVED_MODIFIERS = new Set(['count', 'list', 'table']);

function resolveColumnName(result: AnalystQueryResult, columnName: string): string | null {
    if (result.rows.length === 0) return null;
    const row = result.rows[0]!;
    const cols = result.columns.length > 0 ? result.columns : Object.keys(row);
    const exact = cols.find((c) => c === columnName);
    if (exact) return exact;
    const lower = columnName.toLowerCase();
    const ci = cols.find((c) => c.toLowerCase() === lower);
    if (ci) return ci;
    return cols.find((c) => c.toLowerCase().replace(/[^a-z0-9]/g, '') === lower.replace(/[^a-z0-9]/g, '')) ?? null;
}

function scalarFromResult(result: AnalystQueryResult, columnName?: string): string {
    if (result.error) return `[error: ${result.error}]`;
    if (result.rows.length === 0) return 'N/A';
    const row = result.rows[0]!;
    if (columnName) {
        const col = resolveColumnName(result, columnName);
        if (!col) return `[missing column: ${columnName}]`;
        return formatCell(row[col]);
    }
    const col = result.columns[0] ?? Object.keys(row)[0];
    if (!col) return 'N/A';
    return formatCell(row[col]);
}

function formatRowAsChatBullet(row: AnalystQueryRow, columns: string[]): string {
    if (columns.length === 0) return '- —';
    if (columns.length === 1) {
        return `- ${formatCell(row[columns[0]!])}`;
    }
    if (columns.length === 2) {
        const [labelCol, valueCol] = columns;
        const label = formatCell(row[labelCol]);
        const value = formatCell(row[valueCol]);
        return `- **${label}**: ${value}`;
    }
    const parts = columns.map((c) => formatCell(row[c])).filter((p) => p !== '—');
    return `- ${parts.join(' · ')}`;
}

type AnalystQueryRow = Record<string, unknown>;

function chatListFromResult(result: AnalystQueryResult): string {
    if (result.error) return `_Query error: ${result.error}_`;
    if (result.rows.length === 0) return '_No matching rows._';
    const cols =
        result.columns.length > 0
            ? result.columns
            : Object.keys(result.rows[0] as object);
    const slice = result.rows.slice(0, MAX_LIST_ROWS) as AnalystQueryRow[];
    const lines = slice.map((row) => formatRowAsChatBullet(row, cols));
    const suffix =
        result.rows.length > MAX_LIST_ROWS
            ? `\n_…and ${result.rows.length - MAX_LIST_ROWS} more_`
            : '';
    return `${lines.join('\n')}${suffix}`;
}

/**
 * Replaces placeholders in the AI response template with local SQL results.
 * - {{q:key}} — first column of first row
 * - {{q:key.column_alias}} — named column from first row (SQL AS alias)
 * - {{q:key.count}} — row count
 * - {{q:key.list}} / {{q:key.table}} — bullet list for chat UI
 */
export function fillAnalystResponseTemplate(
    template: string,
    results: Record<string, AnalystQueryResult>
): string {
    let out = template;
    const placeholderRe = /\{\{q:([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?\}\}/g;
    out = out.replace(placeholderRe, (_match, key: string, modifier?: string) => {
        const result = results[key];
        if (!result) return `[missing query: ${key}]`;
        if (!modifier) return scalarFromResult(result);
        if (modifier === 'count') return String(result.rows.length);
        if (modifier === 'table' || modifier === 'list') return chatListFromResult(result);
        if (RESERVED_MODIFIERS.has(modifier)) return scalarFromResult(result);
        return scalarFromResult(result, modifier);
    });
    return out;
}
