import type { Transaction } from '../types.js';
import { expenseCategoryKey } from '../expenseCategory.js';
import { isInternalTransfer } from '../isInternalTransfer.js';
import { isTransactionIgnored } from '../isTransactionIgnored.js';
import { isLoanExpenseCategory } from '../loanCategory.js';
import { getColorForCategory } from './categoryColors.js';

function skipLoanExpense(t: Transaction): boolean {
    const amount = t.chargedAmount || t.amount || 0;
    return amount < 0 && isLoanExpenseCategory(t.category);
}

export interface CategoryExpenseSlice {
    name: string;
    value: number;
    color: string;
}

/**
 * Spending by expense category for the selected transactions (same filters as dashboard analytics treemap).
 */
export function buildCategoryExpenseSlices(
    transactions: Transaction[],
    customCCKeywords: string[] = []
): CategoryExpenseSlice[] {
    const categoryMap = new Map<string, number>();
    for (const t of transactions) {
        if (isTransactionIgnored(t)) continue;
        if (isInternalTransfer(t, customCCKeywords)) continue;
        if (skipLoanExpense(t)) continue;
        if ((t.chargedAmount || t.amount || 0) >= 0) continue;
        const category = expenseCategoryKey(t.category);
        const amount = Math.abs(t.chargedAmount || t.amount || 0);
        categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
    }
    return Array.from(categoryMap.entries())
        .map(([name, value]) => ({
            name,
            value: Math.round(value * 100) / 100,
            color: getColorForCategory(name),
        }))
        .sort((a, b) => b.value - a.value);
}
