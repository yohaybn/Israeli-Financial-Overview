import { useMemo } from 'react';
import { Transaction } from '@app/shared';
import { isInternalTransfer } from '../utils/transactionUtils';

interface AnalyticsData {
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    byCategory: { name: string; value: number; color: string }[];
    byMonth: { month: string; income: number; expenses: number }[];
    topMerchants: { description: string; count: number; total: number }[];
}

const CATEGORY_COLORS: Record<string, string> = {
    // English
    'Food & Dining': '#FF6B6B',
    'Shopping': '#4ECDC4',
    'Transport': '#FFE66D',
    'Entertainment': '#A8D8EA',
    'Health': '#FF8C94',
    'Education': '#AA96DA',
    'Travel': '#FCBAD3',
    'Other': '#C7CEEA',
    'אחר': '#C7CEEA',
    'ללא קטגוריה': '#B0BEC5',
};

function getColorForCategory(category: string): string {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['אחר'] || CATEGORY_COLORS['Other'] || '#B0BEC5';
}

export function useAnalytics(transactions: Transaction[]): AnalyticsData {
    return useMemo(() => {
        if (!transactions || transactions.length === 0) {
            return {
                totalIncome: 0,
                totalExpenses: 0,
                netBalance: 0,
                byCategory: [],
                byMonth: [],
                topMerchants: [],
            };
        }

        // Calculate totals
        let totalIncome = 0;
        let totalExpenses = 0;

        transactions.forEach(t => {
            if (isInternalTransfer(t)) return;
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
            if (isInternalTransfer(t)) return;
            const category = t.category || 'אחר';
            const amount = Math.abs(t.chargedAmount || t.amount || 0);
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
            if (isInternalTransfer(t)) return;
            const date = new Date(t.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const amount = t.chargedAmount || t.amount || 0;

            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, { income: 0, expenses: 0 });
            }

            const entry = monthMap.get(monthKey)!;
            if (amount > 0) {
                entry.income += amount;
            } else {
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

        // Top merchants
        const merchantMap = new Map<string, { count: number; total: number }>();
        transactions.forEach(t => {
            if (isInternalTransfer(t)) return;
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
            topMerchants,
        };
    }, [transactions]);
}
