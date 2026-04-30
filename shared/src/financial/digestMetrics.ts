import type { Transaction, BudgetHealth, AnomalyAlert, HistoricalBaseline } from '../types.js';
import { isInternalTransfer } from '../isInternalTransfer.js';
import { isTransactionIgnored } from '../isTransactionIgnored.js';
import { expenseCategoryKey } from '../expenseCategory.js';
import { detectRecurring, filterUpcomingAlreadyRealizedInMonth } from './recurring.js';
import {
    computeHistoricalBaseline,
    detectAnomalies,
    computeBudgetHealth
} from './financialPace.js';
import { computeTxnBaselineVariableForecast } from './variableForecast.js';

export interface FinancialDigestSnapshot {
    month: string;
    budgetHealth: BudgetHealth;
    anomalies: AnomalyAlert[];
    historicalBaseline: HistoricalBaseline;
    /** Stable string to skip duplicate Telegram sends */
    digestFingerprint: string;
}

function buildFingerprint(
    month: string,
    health: BudgetHealth,
    anomalies: AnomalyAlert[]
): string {
    const ids = anomalies.map(a => a.id).sort().join('|');
    return `${month}:${health.score}:${health.velocityRatio.toFixed(4)}:${ids}`;
}

/**
 * Same budget-health and anomaly pipeline as the dashboard hook (without subscriptions / byCategory UI).
 * Used for post-scrape Telegram digest and kept in sync with client logic via shared code.
 */
export function computeFinancialDigestSnapshot(
    allTransactions: Transaction[],
    options: {
        forecastMonths?: number;
        customCCKeywords?: string[];
        referenceDate?: Date;
        selectedMonth?: string;
        maxAnomalyAlerts?: number;
    } = {}
): FinancialDigestSnapshot | null {
    if (!allTransactions?.length) return null;

    const now = options.referenceDate ?? new Date();
    const currentMonth =
        options.selectedMonth ??
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const forecastMonths = options.forecastMonths ?? 6;
    const customCCKeywords = options.customCCKeywords ?? [];
    const maxAnomalyAlerts = options.maxAnomalyAlerts ?? 5;

    const realTransactions: Transaction[] = [];
    for (const txn of allTransactions) {
        if (isInternalTransfer(txn, customCCKeywords)) continue;
        if (!isTransactionIgnored(txn)) realTransactions.push(txn);
    }

    const currentMonthTxns = realTransactions.filter(
        txn => txn.date.substring(0, 7) === currentMonth
    );

    let alreadySpent = 0;
    const categorySpent = new Map<string, number>();
    const categoryTxns = new Map<string, Transaction[]>();
    const alreadySpentTxns: Transaction[] = [];

    for (const txn of currentMonthTxns) {
        const amount = txn.chargedAmount || txn.amount || 0;
        if (amount < 0 && !isTransactionIgnored(txn)) {
            const absAmount = Math.abs(amount);
            alreadySpent += absAmount;
            alreadySpentTxns.push(txn);
            const cat = expenseCategoryKey(txn.category);
            categorySpent.set(cat, (categorySpent.get(cat) || 0) + absAmount);
            if (!categoryTxns.has(cat)) categoryTxns.set(cat, []);
            categoryTxns.get(cat)!.push(txn);
        }
    }

    let alreadyReceived = 0;
    let pendingIncome = 0;

    for (const txn of currentMonthTxns) {
        const amount = txn.chargedAmount || txn.amount || 0;
        if (amount > 0) {
            if (txn.status === 'completed') alreadyReceived += amount;
            else pendingIncome += amount;
        }
    }

    const { upcoming: upcomingFixedRaw } = detectRecurring(realTransactions, currentMonth, customCCKeywords);
    const upcomingFixed = filterUpcomingAlreadyRealizedInMonth(
        upcomingFixedRaw,
        currentMonthTxns,
        customCCKeywords
    );

    const remainingPlanned = upcomingFixed
        .filter(item => item.type === 'bill')
        .reduce((sum, item) => sum + item.amount, 0);

    const expectedInflow =
        pendingIncome +
        upcomingFixed.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);

    const [cy, cm] = currentMonth.split('-').map(Number);
    const daysInMonth = new Date(cy, cm, 0).getDate();
    const isCurrentMonth = cy === now.getFullYear() && cm === now.getMonth() + 1;
    const daysPassed = isCurrentMonth ? now.getDate() : daysInMonth;
    const remainingDays = daysInMonth - daysPassed;

    const historicalBaseline = computeHistoricalBaseline(
        realTransactions,
        currentMonth,
        forecastMonths,
        customCCKeywords
    );

    const txnCountByCategory = new Map<string, number>();
    categoryTxns.forEach((txns, cat) => txnCountByCategory.set(cat, txns.length));

    const maxTxnByCategory = new Map<string, number>();
    categoryTxns.forEach((txns, cat) => {
        let max = 0;
        for (const t of txns) {
            const a = Math.abs(t.chargedAmount || t.amount || 0);
            if (a > max) max = a;
        }
        if (max > 0) maxTxnByCategory.set(cat, max);
    });

    const anomalies = detectAnomalies(
        historicalBaseline,
        categorySpent,
        txnCountByCategory,
        daysPassed,
        daysInMonth,
        upcomingFixed,
        { maxAlerts: maxAnomalyAlerts, maxTxnByCategory }
    );

    const allCategories = new Set<string>();
    categorySpent.forEach((_, cat) => allCategories.add(cat));
    upcomingFixed.filter(i => i.type === 'bill').forEach(i => allCategories.add(expenseCategoryKey(i.category)));
    historicalBaseline.categories.forEach(c => allCategories.add(c.category));

    let variableSpendForecast = 0;

    for (const name of allCategories) {
        const spent = categorySpent.get(name) || 0;
        const baseline = historicalBaseline.categories.find(c => c.category === name);
        const categoryUpcomingBills = upcomingFixed.filter(
            i => i.type === 'bill' && expenseCategoryKey(i.category) === name
        );
        const upcomingForCategory = categoryUpcomingBills.reduce((sum, i) => sum + i.amount, 0);
        let categoryVariableForecast = 0;

        if (isCurrentMonth) {
            if (baseline && !baseline.isFixed) {
                const N =
                    baseline.avgMonthlyTxnCount ??
                    baseline.expectedMonthlyTxnCount ??
                    0;
                const avgTxnValue = baseline.avgTxnValue || 0;
                const currentTxns = categoryTxns.get(name)?.length || 0;
                categoryVariableForecast = computeTxnBaselineVariableForecast({
                    expectedMonthlyTxnCount: N,
                    avgTxnValue,
                    currentMonthTxnCount: currentTxns,
                    daysInMonth,
                    remainingDays,
                }).amount;
            } else if (!baseline && spent > 0) {
                const forecastRate = spent / Math.max(1, daysPassed);
                categoryVariableForecast = forecastRate * remainingDays;
            }
        }

        variableSpendForecast += Math.max(0, categoryVariableForecast - upcomingForCategory);
    }

    const totalProjectedExpenses = alreadySpent + remainingPlanned + variableSpendForecast;
    const totalProjectedIncome = alreadyReceived + expectedInflow;

    const budgetHealth = computeBudgetHealth(
        totalProjectedExpenses,
        totalProjectedIncome,
        alreadySpent,
        historicalBaseline.totalAvgMonthly,
        daysPassed,
        daysInMonth,
        alreadySpentTxns.length,
        historicalBaseline.totalAvgMonthlyTxnCount ?? 0
    );

    return {
        month: currentMonth,
        budgetHealth,
        anomalies,
        historicalBaseline,
        digestFingerprint: buildFingerprint(currentMonth, budgetHealth, anomalies)
    };
}
