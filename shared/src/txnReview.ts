import type { Transaction } from './types.js';
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
