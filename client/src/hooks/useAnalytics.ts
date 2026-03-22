import { useMemo } from 'react';
import { Transaction, isTransactionIgnored, expenseCategoryKey } from '@app/shared';
import { isInternalTransfer, isLoanCategory } from '../utils/transactionUtils';
import {
    CATEGORY_PARENT_GROUP_ORDER,
    type CategoryParentGroupKey,
    getCategoryParentGroupKey,
} from '../utils/categoryParentGroup';

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
    /** When set, this leaf is the merged bucket for small categories (id: `TREEMAP_SMALL_MERGED_ID`). */
    aggregated?: CategoryTreemapAggregatedPart[];
}

/** Internal id for the treemap tile that groups categories below the small threshold. */
export const TREEMAP_SMALL_MERGED_ID = '__SMALL_MERGED__';

/** Categories below this share of total spending are merged in the treemap; details appear in the equal-width strip. */
const TREEMAP_SMALL_FRACTION = 0.04;

export interface CategoryTreemapGroup {
    name: CategoryParentGroupKey;
    children: CategoryTreemapLeaf[];
}

interface AnalyticsData {
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    byCategory: { name: string; value: number; color: string }[];
    /** Nested groups for hierarchical treemap (parent bucket → categories). */
    byCategoryTree: CategoryTreemapGroup[];
    /** Categories merged into the small bucket (equal-width strip below treemap); empty if none. */
    treemapSmallParts: CategoryTreemapAggregatedPart[];
    byMonth: { month: string; income: number; expenses: number }[];
    byWeekday: { dayIndex: number; dayLabel: string; value: number }[];
    byMonthDay: { day: number; value: number }[];
    topMerchants: { description: string; count: number; total: number }[];
}

const CATEGORY_COLORS: Record<string, string> = {
    // English
    'Food & Dining': '#FF6B6B',     // Coral Red
    'Shopping': '#4ECDC4',          // Turquoise
    'Transport': '#FFE66D',         // Bright Yellow
    'Entertainment': '#ff9f43',     // Orange
    'Health': '#FF8C94',            // Soft Pink
    'Education': '#54a0ff',         // Sky Blue
    'Travel': '#00d2d3',            // Jade Dust
    'Utilities': '#48dbfb',         // Cyan
    'Housing': '#ee5253',           // Armor
    'Insurance': '#5f27cd',         // Nassau Purple
    'Gifts': '#ff9ff3',             // Jigglypuff
    'Income': '#1dd1a1',            // Wild Watermelon
    'Investments': '#10ac84',       // Dark Mountain Meadow
    'Other': '#C7CEEA',             // Lavender
    // Hebrew
    'מזון': '#FF6B6B',
    'קניות': '#4ECDC4',
    'תחבורה': '#FFE66D',
    'פנאי ובידור': '#ff9f43',
    'בריאות': '#FF8C94',
    'חינוך': '#54a0ff',
    'חופשות וטיולים': '#00d2d3',
    'חשבונות': '#48dbfb',
    'דיור': '#ee5253',
    'ביטוח': '#5f27cd',
    'מתנות': '#ff9ff3',
    'הכנסה': '#1dd1a1',
    'השקעות': '#10ac84',
    'אחר': '#C7CEEA',
    'ללא קטגוריה': '#B0BEC5',
};

// Fallback colors for unknown categories
const PALETTE = [
    '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff',
    '#00d2d3', '#1dd1a1', '#5f27cd', '#ff9f43', '#ee5253',
    '#0abde3', '#10ac84', '#576574', '#222f3e'
];

function getColorForCategory(category: string): string {
    if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
    
    // Deterministic selection from palette based on string hash
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PALETTE.length;
    return PALETTE[index];
}

function parseTransactionDate(dateValue: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return new Date(`${dateValue}T12:00:00`);
    }
    return new Date(dateValue);
}

/** Exclude mortgage/loan category from analytics spending charts and related totals */
function skipLoanExpense(t: Transaction): boolean {
    const amount = t.chargedAmount || t.amount || 0;
    return amount < 0 && isLoanCategory(t.category);
}

export function useAnalytics(transactions: Transaction[], customCCKeywords: string[] = []): AnalyticsData {
    return useMemo(() => {
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

        // Calculate totals
        let totalIncome = 0;
        let totalExpenses = 0;

        transactions.forEach(t => {
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

        // Group by category
        const categoryMap = new Map<string, number>();
        transactions.forEach(t => {
            if (isTransactionIgnored(t)) return;
            if (isInternalTransfer(t, customCCKeywords)) return;
            if (skipLoanExpense(t)) return;
            const category = expenseCategoryKey(t.category);
            const amount = Math.abs(t.chargedAmount || t.amount || 0);
            
            // Only include expenses (negative amounts) in the spending pie chart
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

        // Group by month
        const monthMap = new Map<string, { income: number; expenses: number }>();
        transactions.forEach(t => {
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
            .map(([month, data]) => ({
                month,
                income: Math.round(data.income * 100) / 100,
                expenses: Math.round(data.expenses * 100) / 100,
            }))
            .sort((a, b) => a.month.localeCompare(b.month));

        // Spending by weekday (expenses only)
        const weekdayMap = new Map<number, number>();
        transactions.forEach(t => {
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

        // Spending by day in month (1-31, expenses only)
        const monthDayMap = new Map<number, number>();
        transactions.forEach(t => {
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

        // Top merchants
        const merchantMap = new Map<string, { count: number; total: number }>();
        transactions.forEach(t => {
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
    }, [transactions, customCCKeywords]);
}
