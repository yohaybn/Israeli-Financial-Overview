/** Normalize for comparison: ignore spaces and dashes (common in Israeli bank account formatting). */
export function normalizeAccountNumberForExclusionMatch(s: string): string {
    return s.replace(/[\s\-]/g, '');
}

/** Parse user input: comma or newline separated account numbers. */
export function parseExcludedAccountNumbersInput(raw: string): string[] {
    return raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export function isAccountNumberExcluded(
    accountNumber: string,
    excludedList: string[] | undefined | null
): boolean {
    if (!excludedList?.length) return false;
    const n = normalizeAccountNumberForExclusionMatch(accountNumber);
    if (!n) return false;
    return excludedList.some((e) => normalizeAccountNumberForExclusionMatch(e) === n);
}

/** Merge global and per-request excluded account lists (unique, trimmed). */
export function mergeExcludedAccountNumberLists(
    globalList: string[] | undefined,
    requestList: string[] | undefined
): string[] {
    return [
        ...new Set([
            ...(globalList || []).map((s) => String(s).trim()),
            ...((requestList || []) as string[]).map((s) => String(s).trim()),
        ]),
    ].filter(Boolean);
}

/**
 * Count transactions whose account matches this exclusion pattern (normalized equality).
 */
export function countTransactionsForExclusionPattern<T extends { accountNumber?: string }>(
    transactions: T[],
    pattern: string
): number {
    const p = normalizeAccountNumberForExclusionMatch(pattern);
    if (!p) return 0;
    return transactions.filter(
        (t) => normalizeAccountNumberForExclusionMatch(t.accountNumber || '') === p
    ).length;
}

/** Remove nested `txns` from scraper library account objects (avoid duplicating data in API / JSON). */
export function stripNestedTxnsFromScrapeAccounts(accounts: unknown): unknown[] | undefined {
    if (!Array.isArray(accounts)) return undefined;
    return accounts.map((acc: any) => {
        if (acc && typeof acc === 'object' && 'txns' in acc) {
            const { txns: _omit, ...rest } = acc;
            return rest;
        }
        return acc;
    });
}
