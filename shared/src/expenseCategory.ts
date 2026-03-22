import type { Transaction } from './types.js';

/** Default bucket for uncategorized expenses (must match summary / baseline logic). */
export const DEFAULT_EXPENSE_CATEGORY = 'אחר';

/**
 * Canonical category key for grouping — same as useFinancialSummary and baselines:
 * missing, empty, or whitespace-only → אחר.
 */
export function expenseCategoryKey(category: string | undefined | null): string {
    const c = category?.trim();
    return c || DEFAULT_EXPENSE_CATEGORY;
}

export function expenseCategoryKeyFromTxn(txn: Pick<Transaction, 'category'>): string {
    return expenseCategoryKey(txn.category);
}
