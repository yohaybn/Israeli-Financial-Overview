import type { AnalystQueryResult } from './analystSqlExecutor.js';

const MAX_TABLE_ROWS = 25;

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
        if (Number.isInteger(value)) return value.toLocaleString('en-US');
        return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return String(value);
}

function scalarFromResult(result: AnalystQueryResult): string {
    if (result.error) return `[error: ${result.error}]`;
    if (result.rows.length === 0) return 'N/A';
    const row = result.rows[0]!;
    const col = result.columns[0] ?? Object.keys(row)[0];
    if (!col) return 'N/A';
    return formatCell(row[col]);
}

function markdownTable(result: AnalystQueryResult): string {
    if (result.error) return `_Query error: ${result.error}_`;
    if (result.rows.length === 0) return '_No rows_';
    const cols =
        result.columns.length > 0
            ? result.columns
            : Object.keys(result.rows[0] as object);
    const slice = result.rows.slice(0, MAX_TABLE_ROWS);
    const header = `| ${cols.join(' | ')} |`;
    const sep = `| ${cols.map(() => '---').join(' | ')} |`;
    const body = slice
        .map((r) => `| ${cols.map((c) => formatCell(r[c])).join(' | ')} |`)
        .join('\n');
    const suffix =
        result.rows.length > MAX_TABLE_ROWS
            ? `\n_…and ${result.rows.length - MAX_TABLE_ROWS} more rows_`
            : '';
    return `${header}\n${sep}\n${body}${suffix}`;
}

/**
 * Replaces placeholders in the AI response template with local SQL results.
 * - {{q:key}} — first column of first row (scalar)
 * - {{q:key.count}} — row count
 * - {{q:key.table}} — markdown table (capped)
 */
export function fillAnalystResponseTemplate(
    template: string,
    results: Record<string, AnalystQueryResult>
): string {
    let out = template;
    const placeholderRe = /\{\{q:([a-zA-Z0-9_]+)(?:\.(count|table))?\}\}/g;
    out = out.replace(placeholderRe, (_match, key: string, modifier?: string) => {
        const result = results[key];
        if (!result) return `[missing query: ${key}]`;
        if (modifier === 'count') return String(result.rows.length);
        if (modifier === 'table') return markdownTable(result);
        return scalarFromResult(result);
    });
    return out;
}
