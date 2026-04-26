import { useMemo } from 'react';
import {
    Transaction,
    FinancialSummary,
    CategoryBaseline,
    detectRecurring,
    computeHistoricalBaseline,
    computeBudgetHealth,
    detectAnomalies,
    isTransactionIgnored,
    expenseCategoryKey,
    computeTxnBaselineVariableForecast
} from '@app/shared';

import { isInternalTransfer } from '../utils/transactionUtils';
import { detectSubscriptions } from '../utils/subscriptionUtils';

/**
 * Core hook: Computes the full financial summary with anti-double-counting,
 * expense/income projections, and recurring item detection.
 */
export function useFinancialSummary(
    allTransactions: Transaction[],
    selectedMonth?: string, // YYYY-MM
    ccPaymentDate: number = 2,
    forecastMonths: number = 6,
    customCCKeywords: string[] = []
): FinancialSummary {
    return useMemo(() => {
        const now = new Date();
        const currentMonth = selectedMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const empty: FinancialSummary = {
            month: currentMonth,
            expenses: {
                alreadySpent: 0,
                remainingPlanned: 0,
                variableForecast: 0,
                totalProjected: 0,
                expenseTxnCount: 0,
                historicalAvgMonthlyTxnCount: 0,
                expectedTxnCountToDate: 0,
                byCategory: [],
            },
            isCurrentMonth: false,
            income: { alreadyReceived: 0, expectedInflow: 0, totalProjected: 0 },
            upcomingFixed: [],
            subscriptions: [],
            recurringRealized: { income: 0, bills: 0 },
            internalTransfers: { count: 0, total: 0, transactions: [] },
        };

        if (!allTransactions || allTransactions.length === 0) return empty;

        // Step 1: Classify transactions and separate internal transfers
        // We do this for ALL transactions to ensure consistent history classification
        const realTransactions: Transaction[] = [];
        // Tracks transfers only for the selected month for display
        const monthInternalTransfers: Transaction[] = [];

        for (const txn of allTransactions) {
            const isTransfer = isInternalTransfer(txn, customCCKeywords);
            const txnMonth = txn.date.substring(0, 7); // YYYY-MM

            if (isTransfer) {
                if (txnMonth === currentMonth) {
                    monthInternalTransfers.push(txn);
                }
            } else {
                if (!isTransactionIgnored(txn)) {
                    realTransactions.push(txn);
                }
            }
        }

        // Step 2: Filter to selected month for projections
        const currentMonthTxns = realTransactions.filter(txn => {
            return txn.date.substring(0, 7) === currentMonth;
        });

        // Step 3: Calculate expense breakdown (Same logic as before)
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
                if (!categoryTxns.has(cat)) {
                    categoryTxns.set(cat, []);
                }
                categoryTxns.get(cat)!.push(txn);
            }
        }

        // Step 4: Calculate income breakdown (Same logic as before)
        let alreadyReceived = 0;
        let pendingIncome = 0;
        const alreadyReceivedTxns: Transaction[] = [];
        const pendingIncomeTxns: Transaction[] = [];

        for (const txn of currentMonthTxns) {
            const amount = txn.chargedAmount || txn.amount || 0;
            if (amount > 0) {
                if (txn.status === 'completed') {
                    alreadyReceived += amount;
                    alreadyReceivedTxns.push(txn);
                } else {
                    pendingIncome += amount;
                    pendingIncomeTxns.push(txn);
                }
            }
        }

        // Step 5: Detect recurring items not yet appearing IN THE SELECTED MONTH
        // We pass ALL real transactions to detect patterns
        const { upcoming: upcomingFixed, realizedIncome, realizedBills } = detectRecurring(realTransactions, currentMonth, customCCKeywords);
        const subscriptions = detectSubscriptions(allTransactions);

        // Calculate remaining planned from upcoming bills
        const remainingPlanned = upcomingFixed
            .filter(item => item.type === 'bill')
            .reduce((sum, item) => sum + item.amount, 0);

        const expectedInflow = pendingIncome + upcomingFixed
            .filter(item => item.type === 'income')
            .reduce((sum, item) => sum + item.amount, 0);

        // Calculate days passed and month variables for forecasting
        const [cy, cm] = currentMonth.split('-').map(Number);
        const daysInMonth = new Date(cy, cm, 0).getDate();
        const isCurrentMonth = cy === now.getFullYear() && cm === now.getMonth() + 1;
        const daysPassed = isCurrentMonth ? now.getDate() : daysInMonth;
        const remainingDays = daysInMonth - daysPassed;

        // Step 6: Historical Baseline & Anomalies
        const historicalBaseline = computeHistoricalBaseline(realTransactions, currentMonth, forecastMonths, customCCKeywords);
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
            { maxTxnByCategory }
        );

        // Step 7: Build category breakdown with projections
        const allCategories = new Set<string>();
        categorySpent.forEach((_, cat) => allCategories.add(cat));
        // Add projected categories from upcoming items and baseline
        upcomingFixed.filter(i => i.type === 'bill').forEach(i => allCategories.add(expenseCategoryKey(i.category)));
        historicalBaseline.categories.forEach((c: CategoryBaseline) => allCategories.add(c.category));

        let variableSpendForecast = 0;

        const byCategory = Array.from(allCategories).map(name => {
            const spent = Math.round((categorySpent.get(name) || 0) * 100) / 100;
            const baseline = historicalBaseline.categories.find((c: CategoryBaseline) => c.category === name);

            // Add upcoming bills for this specific category
            const categoryUpcomingBills = upcomingFixed
                .filter(i => i.type === 'bill' && expenseCategoryKey(i.category) === name);

            const upcomingForCategory = categoryUpcomingBills.reduce((sum, i) => sum + i.amount, 0);
            let categoryVariableForecast = 0;
            let forecastRate = 0;
            let forecastMethod: 'historical_avg' | 'extrapolation' | 'transaction_count' | undefined;

            // Variable Spend Forecasting
            let forecastEffectiveTxnCount: number | undefined;
            if (isCurrentMonth) {
                if (baseline && !baseline.isFixed) {
                    const N =
                        baseline.avgMonthlyTxnCount ??
                        baseline.expectedMonthlyTxnCount ??
                        0;
                    const avgTxnValue = baseline.avgTxnValue || 0;
                    const currentTxns = categoryTxns.get(name)?.length || 0;

                    const { amount, forecastTxnCount } = computeTxnBaselineVariableForecast({
                        expectedMonthlyTxnCount: N,
                        avgTxnValue,
                        currentMonthTxnCount: currentTxns,
                        daysInMonth,
                        remainingDays,
                    });
                    categoryVariableForecast = amount;
                    if (N >= 1) {
                        forecastEffectiveTxnCount = Math.round(forecastTxnCount * 100) / 100;
                        forecastRate = 0; // Daily rate is no longer the main driver
                        forecastMethod = 'transaction_count';
                    }
                } else if (!baseline && spent > 0) {
                    // If no baseline but we have spend, do a naive extrapolation
                    forecastRate = spent / Math.max(1, daysPassed);
                    categoryVariableForecast = forecastRate * remainingDays;
                    forecastMethod = 'extrapolation';
                }
            }

            // The projection for the category is what's already spent + 
            // the maximum of what we specifically expect (detected bills) 
            // and what we statistically expect (variable forecast).
            const forecastExtension = Math.max(upcomingForCategory, categoryVariableForecast);
            const projected = spent + forecastExtension;

            // Track how much "extra" variable spend (beyond detected bills) we are forecasting globally
            variableSpendForecast += Math.max(0, categoryVariableForecast - upcomingForCategory);

            const currentMonthTxnCount = categoryTxns.get(name)?.length || 0;
            return {
                name,
                spent,
                projected: Math.round(projected * 100) / 100,
                historicalAvg: baseline ? Math.round(baseline.avgMonthly * 100) / 100 : undefined,
                historicalStdDev: baseline ? Math.round(baseline.stdDev * 100) / 100 : undefined,
                transactions: categoryTxns.get(name) || [],
                upcomingBillsAmount: Math.round(upcomingForCategory * 100) / 100,
                variableForecastAmount: Math.round(categoryVariableForecast * 100) / 100,
                forecastRate: Math.round(forecastRate * 100) / 100,
                forecastMethod,
                expectedMonthlyTxnCount:
                    forecastMethod === 'transaction_count' && baseline
                        ? baseline.expectedMonthlyTxnCount
                        : undefined,
                currentMonthTxnCount:
                    forecastMethod === 'transaction_count' ? currentMonthTxnCount : undefined,
                avgTxnValue:
                    forecastMethod === 'transaction_count' && baseline
                        ? Math.round((baseline.avgTxnValue || 0) * 100) / 100
                        : undefined,
                forecastEffectiveTxnCount:
                    forecastMethod === 'transaction_count' ? forecastEffectiveTxnCount : undefined,
                upcomingBills: categoryUpcomingBills,
            };
        }).sort((a, b) => b.spent - a.spent);

        // Total projections recalculation for Budget Health
        const totalProjectedExpenses = alreadySpent + remainingPlanned + variableSpendForecast;
        const totalProjectedIncome = alreadyReceived + expectedInflow;

        const historicalAvgMonthlyTxnCount = historicalBaseline.totalAvgMonthlyTxnCount ?? 0;
        const expectedTxnCountToDate =
            daysInMonth > 0 ? Math.round((historicalAvgMonthlyTxnCount * (daysPassed / daysInMonth)) * 10) / 10 : 0;

        // Step 8: Budget Health Generation
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

        // Step 9: Internal transfers summary for selected month
        const transferTotal = monthInternalTransfers.reduce(
            (sum, txn) => sum + Math.abs(txn.chargedAmount || txn.amount || 0), 0
        );

        // Step 10: Safe to Spend (current month only)
        // Formula: income received this month - expenses spent this month + expected future inflow
        const safeToSpend = isCurrentMonth
            ? Math.round((alreadyReceived - alreadySpent + expectedInflow) * 100) / 100
            : undefined;

        // Build up transactions for remaining planned and expected inflow
        const remainingPlannedTxns: Transaction[] = upcomingFixed
            .filter(item => item.type === 'bill')
            .map(item => ({
                id: `virtual-${item.description}-${item.expectedDate}`,
                date: item.expectedDate,
                processedDate: item.expectedDate,
                description: item.description,
                amount: -item.amount,
                originalAmount: -item.amount,
                originalCurrency: 'ILS',
                chargedAmount: -item.amount,
                provider: 'virtual',
                accountNumber: 'virtual',
                status: 'pending' as 'pending',
                category: expenseCategoryKey(item.category)
            }));

        const expectedInflowTxns: Transaction[] = [
            ...pendingIncomeTxns,
            ...upcomingFixed
                .filter(item => item.type === 'income')
                .map(item => ({
                    id: `virtual-${item.description}-${item.expectedDate}`,
                    date: item.expectedDate,
                    processedDate: item.expectedDate,
                    description: item.description,
                    amount: item.amount,
                    originalAmount: item.amount,
                    originalCurrency: 'ILS',
                    chargedAmount: item.amount,
                    provider: 'virtual',
                    accountNumber: 'virtual',
                    status: 'pending' as 'pending',
                    category: 'Income'
                }))
        ];

        return {
            month: currentMonth,
            expenses: {
                alreadySpent: Math.round(alreadySpent * 100) / 100,
                remainingPlanned: Math.round(remainingPlanned * 100) / 100,
                variableForecast: Math.round(variableSpendForecast * 100) / 100,
                totalProjected: Math.round(totalProjectedExpenses * 100) / 100,
                expenseTxnCount: alreadySpentTxns.length,
                historicalAvgMonthlyTxnCount: Math.round(historicalAvgMonthlyTxnCount * 10) / 10,
                expectedTxnCountToDate,
                byCategory,
                alreadySpentTxns,
                remainingPlannedTxns
            },
            income: {
                alreadyReceived: Math.round(alreadyReceived * 100) / 100,
                expectedInflow: Math.round(expectedInflow * 100) / 100,
                totalProjected: Math.round(totalProjectedIncome * 100) / 100,
                alreadyReceivedTxns,
                expectedInflowTxns
            },
            upcomingFixed,
            subscriptions,
            recurringRealized: {
                income: Math.round(realizedIncome * 100) / 100,
                bills: Math.round(realizedBills * 100) / 100,
            },
            internalTransfers: {
                count: monthInternalTransfers.length,
                total: Math.round(transferTotal * 100) / 100,
                transactions: monthInternalTransfers,
            },
            safeToSpend,
            historicalBaseline,
            budgetHealth,
            anomalies,
            remainingDays,
            isCurrentMonth
        };
    }, [allTransactions, selectedMonth, ccPaymentDate, forecastMonths, customCCKeywords]);
}
