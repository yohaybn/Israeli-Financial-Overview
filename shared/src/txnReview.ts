import type { Transaction, TransactionReviewItem } from './types.js';
import { DEFAULT_EXPENSE_CATEGORY, expenseCategoryKey } from './expenseCategory.js';

/** AI / user category label for bank transfers (matches aiService category list). */
export const TRANSFERS_CATEGORY_LABEL = 'העברות';

export type TransactionReviewReason = 'transfers' | 'uncategorized';

/**
 * Whether a transaction should prompt the user to add a memo or refine category.
 */
export function transactionNeedsReview(
    txn: Pick<Transaction, 'category' | 'memo'>,
    opts: { transfers: boolean; uncategorized: boolean }
): TransactionReviewReason | null {
    const key = expenseCategoryKey(txn.category);
    if (opts.transfers && key === TRANSFERS_CATEGORY_LABEL) return 'transfers';
    if (opts.uncategorized && key === DEFAULT_EXPENSE_CATEGORY) return 'uncategorized';
    return null;
}

/**
 * Resolve full {@link Transaction} rows for review UI, using unified DB rows when available.
 */
export function transactionsForReviewItems(items: TransactionReviewItem[], unified: Transaction[]): Transaction[] {
    const map = new Map(unified.map((t) => [t.id, t]));
    return items.map((it) => {
        const full = map.get(it.id);
        if (full) return full;
        const d =
            it.date && it.date.length >= 10
                ? it.date.slice(0, 10)
                : typeof it.date === 'string'
                  ? it.date
                  : '';
        const iso = d ? `${d}T12:00:00.000Z` : new Date().toISOString();
        return {
            id: it.id,
            date: iso,
            processedDate: iso,
            description: it.description,
            amount: it.amount,
            originalAmount: it.amount,
            originalCurrency: 'ILS',
            chargedAmount: it.amount,
            chargedCurrency: 'ILS',
            status: 'completed',
            category: it.category,
            provider: '',
            accountNumber: it.accountNumber ?? '',
            txnType: 'expense',
        } as Transaction;
    });
}
