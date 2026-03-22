import type { Transaction, UpcomingItem } from '../types.js';
import { isInternalTransfer } from '../isInternalTransfer.js';
import { isTransactionIgnored } from '../isTransactionIgnored.js';
import { expenseCategoryKey, DEFAULT_EXPENSE_CATEGORY } from '../expenseCategory.js';

const normalizeDescription = (desc: string) =>
    desc.replace(/[^a-zA-Z0-9\u0590-\u05FF\s]/g, '').trim();

/**
 * Detect recurring transactions by analyzing historical patterns.
 */
export function detectRecurring(
    transactions: Transaction[],
    currentMonth: string,
    customCCKeywords: string[] = []
): { upcoming: UpcomingItem[]; realizedIncome: number; realizedBills: number } {
    const upcoming: UpcomingItem[] = [];
    let realizedIncome = 0;
    let realizedBills = 0;
    const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);

    const byDescription = new Map<string, Transaction[]>();
    for (const txn of transactions) {
        if (isTransactionIgnored(txn)) continue;
        if (isInternalTransfer(txn, customCCKeywords)) continue;
        const normalized = normalizeDescription(txn.description);

        if (txn.date.substring(0, 7) >= currentMonth) continue;

        if (!byDescription.has(normalized)) byDescription.set(normalized, []);
        byDescription.get(normalized)!.push(txn);
    }

    for (const [normalizedDesc, txns] of byDescription) {
        const clusters: {
            amounts: number[];
            dates: Date[];
            months: Set<string>;
            lastDate: string;
            originalDescriptions: Set<string>;
            transactions: Transaction[];
        }[] = [];

        for (const txn of txns) {
            const amount = txn.chargedAmount || txn.amount || 0;
            if (amount === 0) continue;

            let matchedCluster = clusters.find(c => {
                const avg = c.amounts.reduce((a, b) => a + b, 0) / c.amounts.length;
                const diff = Math.abs(amount - avg);
                return (diff / Math.abs(avg)) <= 0.15;
            });

            if (!matchedCluster) {
                matchedCluster = {
                    amounts: [],
                    dates: [],
                    months: new Set(),
                    lastDate: txn.date,
                    originalDescriptions: new Set(),
                    transactions: []
                };
                clusters.push(matchedCluster);
            }

            matchedCluster.amounts.push(amount);
            matchedCluster.dates.push(new Date(txn.date));
            matchedCluster.months.add(txn.date.substring(0, 7));
            matchedCluster.originalDescriptions.add(txn.description.trim());
            matchedCluster.transactions.push(txn);
            if (txn.date > matchedCluster.lastDate) matchedCluster.lastDate = txn.date;
        }

        for (const cluster of clusters) {
            const last4Months: string[] = [];
            for (let i = 1; i <= 4; i++) {
                const d = new Date(currentYear, currentMonthNum - 1 - i, 1);
                last4Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }

            const monthsInLast4 = last4Months.filter(m => cluster.months.has(m)).length;
            if (monthsInLast4 < 3) continue;

            const avgAmount = cluster.amounts.reduce((a, b) => a + b, 0) / cluster.amounts.length;

            const days = cluster.dates.map(d => d.getDate());
            let bestClusterSize = 0;
            let bestClusterMean = 0;

            for (const day of days) {
                const closeDays = days.filter(d => Math.abs(d - day) <= 3);
                if (closeDays.length > bestClusterSize) {
                    bestClusterSize = closeDays.length;
                    bestClusterMean = closeDays.reduce((a, b) => a + b, 0) / closeDays.length;
                }
            }

            if (bestClusterSize < 3) continue;

            const monthTransactions = transactions.filter(t =>
                !isTransactionIgnored(t) &&
                normalizeDescription(t.description) === normalizedDesc &&
                t.date.startsWith(currentMonth) &&
                isInternalTransfer(t, customCCKeywords) === false &&
                Math.abs((t.chargedAmount || t.amount || 0) - avgAmount) / Math.abs(avgAmount) <= 0.15
            );

            if (monthTransactions.length > 0) {
                const realizedAmount = monthTransactions.reduce((sum, t) => sum + Math.abs(t.chargedAmount || t.amount || 0), 0);
                if (avgAmount > 0) realizedIncome += realizedAmount;
                else realizedBills += realizedAmount;
                continue;
            }

            const dayOfMonth = Math.round(bestClusterMean);
            const expectedDate = new Date(currentYear, currentMonthNum - 1, dayOfMonth);
            if (expectedDate.getMonth() !== currentMonthNum - 1) expectedDate.setDate(0);

            const descArray = Array.from(cluster.originalDescriptions);
            const displayDesc = descArray.sort((a, b) =>
                txns.filter(t => t.description.trim() === b).length -
                txns.filter(t => t.description.trim() === a).length
            )[0];

            const categoryCounts = new Map<string, number>();
            cluster.transactions.forEach(t => {
                const cat = expenseCategoryKey(t.category);
                categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
            });
            const bestCategory = Array.from(categoryCounts.entries())
                .sort((a, b) => b[1] - a[1])[0]?.[0] || DEFAULT_EXPENSE_CATEGORY;

            upcoming.push({
                description: displayDesc || normalizedDesc,
                amount: Math.abs(avgAmount),
                expectedDate: expectedDate.toISOString(),
                type: avgAmount < 0 ? 'bill' : 'income',
                category: bestCategory,
                isRecurring: true,
                confidence: Math.min(cluster.months.size / 6, 1),
                history: cluster.transactions.sort((a, b) => b.date.localeCompare(a.date))
            });
        }
    }

    return {
        upcoming: upcoming.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)),
        realizedIncome,
        realizedBills
    };
}
