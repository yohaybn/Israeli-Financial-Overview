import type { ExpenseMetaCategory } from '@app/shared';

/**
 * SQLite schema documentation for super-privacy analyst mode.
 * Only this text (plus the user question and memory context) is sent to the model — never raw transaction rows.
 */
export function buildAnalystSqlSchemaDoc(categoryMeta?: Record<string, ExpenseMetaCategory>): string {
    const metaBlock = categoryMeta
        ? `\nCategory meta-buckets (for grouping): ${JSON.stringify(categoryMeta)}\n`
        : '';

    return `DATABASE: SQLite (read-only SELECT queries only).

TABLE transactions — one row per bank/card transaction.
Columns:
- id TEXT PRIMARY KEY
- accountNumber TEXT
- date TEXT — ISO date (YYYY-MM-DD), sortable as text
- description TEXT — merchant / payee label
- amount REAL — posted/charged amount in ILS (prefer SUM(amount) for spend totals)
- category TEXT — user/AI category label
- isIgnored INTEGER — 1 = excluded from dashboards; default exclude with (isIgnored = 0 OR isIgnored IS NULL)
- isInternalTransfer INTEGER — 1 = transfer between own accounts; exclude from expense totals unless user asks about transfers
- isSubscription INTEGER, subscriptionInterval TEXT, excludeFromSubscriptions INTEGER
- provider TEXT — institution id (e.g. mizrahi, isracard, hapoalim)
- raw_data TEXT — JSON blob with extra fields; use json_extract(raw_data, '$.field') when needed

Common json_extract(raw_data, ...) paths:
- $.processedDate, $.memo, $.originalAmount, $.originalCurrency, $.chargedAmount
- $.txnType — expense | income | internal_transfer | normal
- $.type — installment-related labels from scrapers
- $.installments.number, $.installments.total
- $.status — completed | pending | ignored

TABLE ai_memory_facts (id TEXT, text TEXT) — stable user context lines
TABLE ai_memory_insights (id TEXT, text TEXT, score INTEGER)
TABLE ai_memory_alerts (id TEXT, text TEXT, score INTEGER)

Rules for writing SQL:
1. SELECT or WITH ... SELECT only. One statement per query object.
2. For spending questions: filter (isIgnored = 0 OR isIgnored IS NULL) AND (isInternalTransfer = 0 OR isInternalTransfer IS NULL) unless the user asks about transfers/ignored rows.
3. Expenses: amount < 0 OR use ABS(amount) consistently; income often amount > 0 — confirm sign from the question.
4. Use strftime('%Y-%m', date) for calendar months.
5. Prefer aggregates (SUM, COUNT, AVG) over returning many raw rows.
6. When DATA_SCOPE_ACTIVE is true (see user message), every query that reads transactions MUST include: AND id IN (SELECT id FROM _analyst_scope_ids)
7. Do not query PRAGMA or sqlite_master.
${metaBlock}`;
}
