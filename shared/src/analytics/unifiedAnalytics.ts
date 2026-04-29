import type { Transaction } from '../types.js';
import { expenseCategoryKey } from '../expenseCategory.js';
import { getColorForCategory } from './categoryColors.js';
import { isInternalTransfer } from '../isInternalTransfer.js';
import { isLoanExpenseCategory } from '../loanCategory.js';
import { isTransactionIgnored } from '../isTransactionIgnored.js';
import {
    CATEGORY_PARENT_GROUP_ORDER,
    type CategoryParentGroupKey,
    getCategoryParentGroupKey,
} from './categoryParentGroup.js';

export type { CategoryParentGroupKey } from './categoryParentGroup.js';
export { getCategoryParentGroupKey, CATEGORY_PARENT_GROUP_ORDER } from './categoryParentGroup.js';

export interface CategoryTreemapAggregatedPart {
    name: string;
    value: number;
    color: string;
}

export interface CategoryTreemapLeaf {
    name: string;
    value: number;
    color: string;
    parentKey: CategoryParentGroupKey;
    aggregated?: CategoryTreemapAggregatedPart[];
}

export const TREEMAP_SMALL_MERGED_ID = '__SMALL_MERGED__';

const TREEMAP_SMALL_FRACTION = 0.04;

export interface CategoryTreemapGroup {
    name: CategoryParentGroupKey;
    children: CategoryTreemapLeaf[];
}

export interface UnifiedAnalyticsData {
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    byCategory: { name: string; value: number; color: string }[];
    byCategoryTree: CategoryTreemapGroup[];
    treemapSmallParts: CategoryTreemapAggregatedPart[];
    byMonth: { month: string; income: number; expenses: number; net: number }[];
    byWeekday: { dayIndex: number; dayLabel: string; value: number }[];
    byMonthDay: { day: number; value: number }[];
    topMerchants: { description: string; count: number; total: number }[];
}

function parseTransactionDate(dateValue: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return new Date(`${dateValue}T12:00:00`);
    }
    return new Date(dateValue);
}

function skipLoanExpense(t: Transaction): boolean {
    const amount = t.chargedAmount || t.amount || 0;
    return amount < 0 && isLoanExpenseCategory(t.category);
}

/** Filter transactions whose `date` starts with YYYY-MM (calendar month). */
export function filterTransactionsByCalendarMonth(transactions: Transaction[], monthYm: string): Transaction[] {
    const prefix = monthYm.length >= 7 ? monthYm.slice(0, 7) : monthYm;
    return transactions.filter((t) => t.date && t.date.startsWith(prefix));
}

/**
 * Same aggregation logic as the dashboard `useAnalytics` hook (for PDF / server parity).
 */
export function computeUnifiedAnalytics(
    transactions: Transaction[],
    customCCKeywords: string[] = []
): UnifiedAnalyticsData {
    if (!transactions || transactions.length === 0) {
        return {
            totalIncome: 0,
            totalExpenses: 0,
            netBalance: 0,
            byCategory: [],
            byCategoryTree: [],
            treemapSmallParts: [],
            byMonth: [],
            byWeekday: [],
            byMonthDay: [],
            topMerchants: [],
        };
    }

    let totalIncome = 0;
    let totalExpenses = 0;

    transactions.forEach((t) => {
        if (isTransactionIgnored(t)) return;
        if (isInternalTransfer(t, customCCKeywords)) return;
        if (skipLoanExpense(t)) return;
        const amount = t.chargedAmount || t.amount || 0;
        if (amount > 0) {
            totalIncome += amount;
        } else {
            totalExpenses += Math.abs(amount);
        }
    });

    const categoryMap = new Map<string, number>();
    transactions.forEach((t) => {
        if (isTransactionIgnored(t)) return;
        if (isInternalTransfer(t, customCCKeywords)) return;
        if (skipLoanExpense(t)) return;
        const category = expenseCategoryKey(t.category);
        const amount = Math.abs(t.chargedAmount || t.amount || 0);
        if ((t.chargedAmount || t.amount || 0) >= 0) return;
        categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
    });

    const byCategory = Array.from(categoryMap.entries())
        .map(([name, value]) => ({
            name,
            value: Math.round(value * 100) / 100,
            color: getColorForCategory(name),
        }))
        .sort((a, b) => b.value - a.value);

    const totalCategorySpend = byCategory.reduce((s, c) => s + c.value, 0);
    const smallThreshold = Math.max(totalCategorySpend * TREEMAP_SMALL_FRACTION, 1);
    const largeRows = byCategory.filter((c) => c.value >= smallThreshold);
    const smallRows = byCategory.filter((c) => c.value < smallThreshold);

    let treemapSmallParts: CategoryTreemapAggregatedPart[] = [];
    const leavesForTree: CategoryTreemapLeaf[] = [];

    for (const row of largeRows) {
        const parentKey = getCategoryParentGroupKey(row.name);
        leavesForTree.push({
            name: row.name,
            value: row.value,
            color: row.color,
            parentKey,
        });
    }

    if (smallRows.length > 0) {
        treemapSmallParts = smallRows.map((r) => ({
            name: r.name,
            value: r.value,
            color: r.color,
        }));
        const mergedSum = smallRows.reduce((s, r) => s + r.value, 0);
        leavesForTree.push({
            name: TREEMAP_SMALL_MERGED_ID,
            value: Math.round(mergedSum * 100) / 100,
            color: '#64748b',
            parentKey: 'other',
            aggregated: treemapSmallParts,
        });
    }

    const groupByParent = new Map<CategoryParentGroupKey, CategoryTreemapLeaf[]>();
    for (const leaf of leavesForTree) {
        const list = groupByParent.get(leaf.parentKey) ?? [];
        list.push(leaf);
        groupByParent.set(leaf.parentKey, list);
    }

    const sortChildren = (a: CategoryTreemapLeaf, b: CategoryTreemapLeaf) => {
        if (a.name === TREEMAP_SMALL_MERGED_ID) return 1;
        if (b.name === TREEMAP_SMALL_MERGED_ID) return -1;
        return b.value - a.value;
    };

    const byCategoryTree: CategoryTreemapGroup[] = CATEGORY_PARENT_GROUP_ORDER.map((pk) => {
        const children = groupByParent.get(pk);
        if (!children?.length) return null;
        children.sort(sortChildren);
        return { name: pk, children };
    }).filter((g): g is CategoryTreemapGroup => g != null);

    const monthMap = new Map<string, { income: number; expenses: number }>();
    transactions.forEach((t) => {
        if (isTransactionIgnored(t)) return;
        if (isInternalTransfer(t, customCCKeywords)) return;
        const date = new Date(t.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const amount = t.chargedAmount || t.amount || 0;
        if (!monthMap.has(monthKey)) {
            monthMap.set(monthKey, { income: 0, expenses: 0 });
        }
        const entry = monthMap.get(monthKey)!;
        if (amount > 0) {
            entry.income += amount;
        } else if (!skipLoanExpense(t)) {
            entry.expenses += Math.abs(amount);
        }
    });

    const byMonth = Array.from(monthMap.entries())
        .map(([month, data]) => {
            const income = Math.round(data.income * 100) / 100;
            const expenses = Math.round(data.expenses * 100) / 100;
            return {
                month,
                income,
                expenses,
                net: Math.round((income - expenses) * 100) / 100,
            };
        })
        .sort((a, b) => a.month.localeCompare(b.month));

    const weekdayMap = new Map<number, number>();
    transactions.forEach((t) => {
        if (isTransactionIgnored(t)) return;
        if (isInternalTransfer(t, customCCKeywords)) return;
        if (skipLoanExpense(t)) return;
        const amount = t.chargedAmount || t.amount || 0;
        if (amount >= 0) return;
        const dayIndex = parseTransactionDate(t.date).getDay();
        weekdayMap.set(dayIndex, (weekdayMap.get(dayIndex) || 0) + Math.abs(amount));
    });

    const byWeekday = Array.from({ length: 7 }, (_, dayIndex) => ({
        dayIndex,
        dayLabel: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex],
        value: Math.round((weekdayMap.get(dayIndex) || 0) * 100) / 100,
    }));

    const monthDayMap = new Map<number, number>();
    transactions.forEach((t) => {
        if (isTransactionIgnored(t)) return;
        if (isInternalTransfer(t, customCCKeywords)) return;
        if (skipLoanExpense(t)) return;
        const amount = t.chargedAmount || t.amount || 0;
        if (amount >= 0) return;
        const day = parseTransactionDate(t.date).getDate();
        monthDayMap.set(day, (monthDayMap.get(day) || 0) + Math.abs(amount));
    });

    const byMonthDay = Array.from({ length: 31 }, (_, idx) => {
        const day = idx + 1;
        return {
            day,
            value: Math.round((monthDayMap.get(day) || 0) * 100) / 100,
        };
    });

    const merchantMap = new Map<string, { count: number; total: number }>();
    transactions.forEach((t) => {
        if (isTransactionIgnored(t)) return;
        if (isInternalTransfer(t, customCCKeywords)) return;
        if (skipLoanExpense(t)) return;
        const desc = t.description;
        if (!merchantMap.has(desc)) {
            merchantMap.set(desc, { count: 0, total: 0 });
        }
        const entry = merchantMap.get(desc)!;
        entry.count += 1;
        entry.total += Math.abs(t.chargedAmount || t.amount || 0);
    });

    const topMerchants = Array.from(merchantMap.entries())
        .map(([description, data]) => ({
            description,
            count: data.count,
            total: Math.round(data.total * 100) / 100,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return {
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netBalance: Math.round((totalIncome - totalExpenses) * 100) / 100,
        byCategory,
        byCategoryTree,
        treemapSmallParts,
        byMonth,
        byWeekday,
        byMonthDay,
        topMerchants,
    };
}
