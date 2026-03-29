/**
 * Rough token budgeting for the unified AI analyst (Gemini).
 * CSV uses compact columns; Hebrew descriptions vary. Values are estimates only — see Google rate limits.
 */

/** Approximate UTF-8 characters per CSV data row (8 columns, mixed EN/HE). */
export const AI_ANALYST_EST_CHARS_PER_TXN_ROW = 220;

/** CSV header line length estimate. */
export const AI_ANALYST_EST_CHARS_CSV_HEADER = 100;

/**
 * Unified analyst prompt overhead: system instruction, JSON schema, memory block, category meta, etc.
 * Excludes conversation history (varies per turn).
 */
export const AI_ANALYST_EST_PROMPT_OVERHEAD_TOKENS = 3500;

export function estimateTokensFromChars(chars: number): number {
    if (chars <= 0) return 0;
    return Math.ceil(chars / 4);
}

/** Input tokens attributed to the transaction CSV only (no fixed prompt overhead). */
export function estimateAnalystTransactionCsvTokens(rowCount: number): number {
    if (rowCount <= 0) return 0;
    const csvChars = AI_ANALYST_EST_CHARS_CSV_HEADER + rowCount * AI_ANALYST_EST_CHARS_PER_TXN_ROW;
    return estimateTokensFromChars(csvChars);
}

/**
 * Typical unified analyst call: fixed prompt overhead + CSV for N rows.
 * Does not include prior chat turns or persona JSON length.
 */
export function estimateTypicalAnalystCallInputTokens(rowCount: number): number {
    return AI_ANALYST_EST_PROMPT_OVERHEAD_TOKENS + estimateAnalystTransactionCsvTokens(rowCount);
}

/**
 * When {@link maxRows} > 0, keep the first N rows (e.g. DB order `date DESC` = most recent first).
 * When 0 or unset, return all rows.
 */
export function sliceTransactionsForAnalyst<T>(transactions: T[], maxRows: number): T[] {
    if (maxRows == null || maxRows <= 0 || transactions.length <= maxRows) return transactions;
    return transactions.slice(0, maxRows);
}
