import { useMemo } from 'react';
import { Transaction } from '@app/shared';
import { isInternalTransfer, isLoanCategory } from '../utils/transactionUtils';

interface AnalyticsData {
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    byCategory: { name: string; value: number; color: string }[];
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
            if (isInternalTransfer(t, customCCKeywords)) return;
            if (skipLoanExpense(t)) return;
            const category = t.category || 'אחר';
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

        // Group by month
        const monthMap = new Map<string, { income: number; expenses: number }>();
        transactions.forEach(t => {
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
            byMonth,
            byWeekday,
            byMonthDay,
            topMerchants,
        };
    }, [transactions, customCCKeywords]);
}
