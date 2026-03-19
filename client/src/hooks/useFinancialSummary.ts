import { useMemo } from 'react';
import { Transaction, FinancialSummary, UpcomingItem, CategoryBaseline, HistoricalBaseline, BudgetHealth, AnomalyAlert } from '@app/shared';

// Built-in Israeli credit card company name patterns for detecting CC settlements
import { isInternalTransfer } from '../utils/transactionUtils';
import { detectSubscriptions } from '../utils/subscriptionUtils';

/**
 * Detect recurring transactions by analyzing historical patterns.
 * Looks for same description appearing in multiple months with similar amounts.
 */
/**
 * Detect recurring transactions by analyzing historical patterns.
 * Looks for same description appearing in multiple months with similar amounts and dates.
 * 
 * Rules:
 * 1. Matching Metadata: Description consistent
 * 2. Price Stability: Fluctuates by max 15%
 * 3. Temporal Consistency: Occurs on similar date (±2 days)
 * 4. Historical Frequency: Pattern present in at least 3 months
 */
/**
 * Detect recurring transactions by analyzing historical patterns.
 * 
 * Logic flow:
 * 1. Group by Description (Exact match)
 * 2. Cluster by Amount (±15% variance)
 * 3. Verify Pattern History (Min 3 months)
 * 4. Verify Date Consistency (±2 days)
 */
/**
 * Normalize transaction description by stripping special characters.
 * Keeps alphanumeric and Hebrew characters.
 */
const normalizeDescription = (desc: string) =>
    desc.replace(/[^a-zA-Z0-9\u0590-\u05FF\s]/g, '').trim();

/**
 * Detect recurring transactions by analyzing historical patterns.
 * 
 * Rules:
 * 1. Normalization: Strip special characters from descriptions.
 * 2. Amount Cluster: Group transactions within ±15% of each other.
 * 3. Frequency: Pattern appears in 3 of the last 4 months.
 * 4. Date Window: ±3 days vs previous occurrence.
 */
function detectRecurring(
    transactions: Transaction[],
    currentMonth: string,
    customCCKeywords: string[] = []
): { upcoming: UpcomingItem[], realizedIncome: number, realizedBills: number } {
    const upcoming: UpcomingItem[] = [];
    let realizedIncome = 0;
    let realizedBills = 0;
    const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);

    // 1. Group by Normalized Description
    const byDescription = new Map<string, Transaction[]>();
    for (const txn of transactions) {
        if (isInternalTransfer(txn, customCCKeywords)) continue;
        const normalized = normalizeDescription(txn.description);

        // Skip current month transactions for PATTERN RECOGNITION (Learning Phase)
        if (txn.date.substring(0, 7) >= currentMonth) continue;

        if (!byDescription.has(normalized)) byDescription.set(normalized, []);
        byDescription.get(normalized)!.push(txn);
    }

    // 2. Cluster by Amount (±15%) & Process each cluster
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
                return (diff / Math.abs(avg)) <= 0.15; // Strict ±15%
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

        // 3. Evaluate Each Cluster Independently
        for (const cluster of clusters) {
            // Rule: Frequency - 3 of last 4 months
            const last4Months: string[] = [];
            for (let i = 1; i <= 4; i++) {
                const d = new Date(currentYear, currentMonthNum - 1 - i, 1);
                last4Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }

            const monthsInLast4 = last4Months.filter(m => cluster.months.has(m)).length;
            if (monthsInLast4 < 3) continue;

            const avgAmount = cluster.amounts.reduce((a, b) => a + b, 0) / cluster.amounts.length;

            // Rule: Date Window (±3 days vs average)
            // We cluster by day of month to find the most consistent pattern
            const days = cluster.dates.map(d => d.getDate());
            let bestClusterSize = 0;
            let bestClusterMean = 0;

            for (const day of days) {
                const closeDays = days.filter(d => Math.abs(d - day) <= 3); // ±3 days
                if (closeDays.length > bestClusterSize) {
                    bestClusterSize = closeDays.length;
                    bestClusterMean = closeDays.reduce((a, b) => a + b, 0) / closeDays.length;
                }
            }

            // Must have at least 3 occurrences in the date cluster
            if (bestClusterSize < 3) continue;

            // Ensure matches the 3-of-4 months rule even for the date-restricted items
            // (Implicitly ensured by the previous month filter and overall cluster check)

            // Check if user already paid this month
            const monthTransactions = transactions.filter(t =>
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

            // Construct Result
            const dayOfMonth = Math.round(bestClusterMean);
            const expectedDate = new Date(currentYear, currentMonthNum - 1, dayOfMonth);
            if (expectedDate.getMonth() !== currentMonthNum - 1) expectedDate.setDate(0);

            // Use the most common original description for display
            const descArray = Array.from(cluster.originalDescriptions);
            const displayDesc = descArray.sort((a, b) =>
                txns.filter(t => t.description.trim() === b).length -
                txns.filter(t => t.description.trim() === a).length
            )[0];

            // Assign the most common category for this cluster
            const categoryCounts = new Map<string, number>();
            cluster.transactions.forEach(t => {
                const cat = t.category || 'אחר';
                categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
            });
            const bestCategory = Array.from(categoryCounts.entries())
                .sort((a, b) => b[1] - a[1])[0]?.[0] || 'אחר';

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

/**
 * Compute historical averages and baseline metrics per category.
 * @param forecastMonths - user-configured window; clamped to actual available months
 */
function computeHistoricalBaseline(
    transactions: Transaction[],
    currentMonth: string,
    forecastMonths: number,
    customCCKeywords: string[] = []
): HistoricalBaseline {
    const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);

    // Build the full requested window of months
    const allCandidateMonths: string[] = [];
    for (let i = 1; i <= forecastMonths; i++) {
        let y = currentYear;
        let m = currentMonthNum - i;
        if (m <= 0) { m += 12; y -= 1; }
        allCandidateMonths.push(`${y}-${String(m).padStart(2, '0')}`);
    }

    // Determine which months actually have expense data
    const monthsWithData = new Set<string>();
    for (const txn of transactions) {
        if (isInternalTransfer(txn, customCCKeywords)) continue;
        const amount = txn.chargedAmount || txn.amount || 0;
        if (amount >= 0) continue;
        const txnMonth = txn.date.substring(0, 7);
        if (allCandidateMonths.includes(txnMonth)) monthsWithData.add(txnMonth);
    }

    // Clamp to months that actually have data (min 1 to avoid division-by-zero)
    const pastMonths = allCandidateMonths.filter(m => monthsWithData.has(m));
    const monthsToAnalyze = Math.max(pastMonths.length, 1);

    // Map: Category -> Month -> Total Amount
    const catMonthTotals = new Map<string, Map<string, number>>();
    // Map: Category -> Month -> Txn Count
    const catMonthTxnCount = new Map<string, Map<string, number>>();

    for (const txn of transactions) {
        if (isInternalTransfer(txn, customCCKeywords)) continue;
        const amount = txn.chargedAmount || txn.amount || 0;
        if (amount >= 0) continue; // Only expenses

        const txnMonth = txn.date.substring(0, 7);
        if (!pastMonths.includes(txnMonth)) continue;

        const cat = txn.category || 'אחר';
        if (!catMonthTotals.has(cat)) {
            catMonthTotals.set(cat, new Map(pastMonths.map(m => [m, 0])));
            catMonthTxnCount.set(cat, new Map(pastMonths.map(m => [m, 0])));
        }
        const currentTotal = catMonthTotals.get(cat)!.get(txnMonth) || 0;
        catMonthTotals.get(cat)!.set(txnMonth, currentTotal + Math.abs(amount));

        const currentCount = catMonthTxnCount.get(cat)!.get(txnMonth) || 0;
        catMonthTxnCount.get(cat)!.set(txnMonth, currentCount + 1);
    }

    const categories: CategoryBaseline[] = [];
    let sumAvgMonthly = 0;

    for (const [category, monthTotals] of catMonthTotals) {
        const amounts = Array.from(monthTotals.values());
        const avgMonthly = amounts.reduce((a, b) => a + b, 0) / monthsToAnalyze;
        const variance = amounts.reduce((a, b) => a + Math.pow(b - avgMonthly, 2), 0) / monthsToAnalyze;
        const stdDev = Math.sqrt(variance);

        const counts = Array.from(catMonthTxnCount.get(category)!.values());
        const avgTxnCount = counts.reduce((a, b) => a + b, 0) / monthsToAnalyze;
        const expectedMonthlyTxnCount = Math.max(1, Math.round(avgTxnCount));
        const avgTxnValue = avgTxnCount > 0 ? avgMonthly / avgTxnCount : 0;

        // If stdDev is less than 20% of avgMonthly, consider it fixed, else variable
        const isFixed = avgMonthly > 0 && (stdDev / avgMonthly) < 0.2;

        categories.push({
            category,
            avgMonthly,
            stdDev,
            avgDaily: avgMonthly / 30.4, // rough average days per month
            monthCount: monthsToAnalyze,
            isFixed,
            expectedMonthlyTxnCount,
            avgTxnValue
        });
        sumAvgMonthly += avgMonthly;
    }

    return {
        categories,
        totalAvgMonthly: sumAvgMonthly,
        monthsAnalyzed: monthsToAnalyze
    };
}

/**
 * Compute budget health score based on velocity and projected surplus/deficit.
 */
function computeBudgetHealth(
    totalProjectedExpenses: number,
    totalProjectedIncome: number,
    spentSoFar: number,
    historicalTotalAvg: number,
    daysPassed: number,
    daysInMonth: number
): BudgetHealth {
    const projectedSurplus = totalProjectedIncome - totalProjectedExpenses;

    const actualSpendRate = daysPassed > 0 ? spentSoFar / daysPassed : 0;
    const projectedRate = daysInMonth > 0 ? historicalTotalAvg / daysInMonth : 0;
    const velocityRatio = projectedRate > 0 ? actualSpendRate / projectedRate : 1.0;

    let score: 'on_track' | 'caution' | 'at_risk' = 'on_track';
    let message = 'Spending pace is good.';

    if (velocityRatio > 1.3) {
        score = 'at_risk';
        message = 'Spending much faster than historical average.';
    } else if (velocityRatio > 1.1) {
        score = 'caution';
        message = 'Spending slightly faster than usual.';
    }

    if (projectedSurplus < 0 && score === 'on_track') {
        score = 'caution';
        message = 'Projected deficit for this month.';
    }

    return {
        score,
        projectedSurplus,
        velocityRatio,
        message
    };
}

/**
 * Detect spending anomalies and alerts.
 */
function detectAnomalies(
    historicalBaseline: HistoricalBaseline,
    spentByCategory: Map<string, number>,
    upcomingFixed: UpcomingItem[]
): AnomalyAlert[] {
    const alerts: AnomalyAlert[] = [];

    // 1. Velocity & Outliers
    for (const [cat, spent] of spentByCategory) {
        const baseline = historicalBaseline.categories.find((c: CategoryBaseline) => c.category === cat);
        if (!baseline) continue;

        // Over Budget (formerly velocity pacing)
        if (baseline.avgMonthly > 0) {
            if (spent > baseline.avgMonthly && spent > 200) { // Ignore small categories
                alerts.push({
                    id: `over_${cat}`,
                    type: 'velocity', // Keeps the amber styling
                    category: cat,
                    description: `Over average spending in ${cat}`,
                    message: `You've spent more than your typical monthly average for ${cat}.`,
                    severity: 'warning',
                    currentValue: spent,
                    expectedValue: baseline.avgMonthly
                });
            }
        }

        // Outlier
        if (spent > baseline.avgMonthly + 2 * baseline.stdDev && baseline.stdDev > 0 && spent > 200) {
            alerts.push({
                id: `outl_${cat}`,
                type: 'outlier',
                category: cat,
                description: `Unusual spending in ${cat}`,
                message: `${cat} total is significantly higher than your typical monthly average.`,
                severity: 'critical',
                currentValue: spent,
                expectedValue: baseline.avgMonthly
            });
        }
    }

    // 2. Missing Expected
    const now = new Date();
    for (const item of upcomingFixed) {
        const expectedDate = new Date(item.expectedDate);
        const diffDays = (now.getTime() - expectedDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 3) {
            alerts.push({
                id: `miss_${item.description.replace(/\s/g, '_')}`,
                type: 'missing_expected',
                description: `Missing expected ${item.type}`,
                message: `Expected '${item.description}' around ${expectedDate.toLocaleDateString()}, but it hasn't appeared yet.`,
                severity: 'info',
                expectedValue: item.amount
            });
        }
    }

    return alerts;
}

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
            expenses: { alreadySpent: 0, remainingPlanned: 0, variableForecast: 0, totalProjected: 0, byCategory: [] },
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
                if (!txn.isIgnored) {
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
            if (amount < 0 && !txn.isIgnored) {
                const absAmount = Math.abs(amount);
                alreadySpent += absAmount;
                alreadySpentTxns.push(txn);
                const cat = txn.category || 'אחר';
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
        const anomalies = detectAnomalies(historicalBaseline, categorySpent, upcomingFixed);

        // Step 7: Build category breakdown with projections
        const allCategories = new Set<string>();
        categorySpent.forEach((_, cat) => allCategories.add(cat));
        // Add projected categories from upcoming items and baseline
        upcomingFixed.filter(i => i.type === 'bill').forEach(i => allCategories.add(i.category || 'אחר'));
        historicalBaseline.categories.forEach((c: CategoryBaseline) => allCategories.add(c.category));

        let variableSpendForecast = 0;

        const byCategory = Array.from(allCategories).map(name => {
            const spent = Math.round((categorySpent.get(name) || 0) * 100) / 100;
            const baseline = historicalBaseline.categories.find((c: CategoryBaseline) => c.category === name);

            // Add upcoming bills for this specific category
            const categoryUpcomingBills = upcomingFixed
                .filter(i => i.type === 'bill' && (i.category === name || (!i.category && name === 'אחר')));

            const upcomingForCategory = categoryUpcomingBills.reduce((sum, i) => sum + i.amount, 0);
            let categoryVariableForecast = 0;
            let forecastRate = 0;
            let forecastMethod: 'historical_avg' | 'extrapolation' | 'transaction_count' | undefined;

            // Variable Spend Forecasting
            if (isCurrentMonth) {
                if (baseline && !baseline.isFixed) {
                    const N = baseline.expectedMonthlyTxnCount || 1;
                    const avgTxnValue = baseline.avgTxnValue || 0;
                    const currentTxns = categoryTxns.get(name)?.length || 0;

                    if (currentTxns < N) {
                        categoryVariableForecast = (N - currentTxns) * avgTxnValue;
                    } else {
                        categoryVariableForecast = 0;
                    }

                    forecastRate = 0; // Daily rate is no longer the main driver
                    forecastMethod = 'transaction_count';
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
                upcomingBills: categoryUpcomingBills,
            };
        }).sort((a, b) => b.spent - a.spent);

        // Total projections recalculation for Budget Health
        const totalProjectedExpenses = alreadySpent + remainingPlanned + variableSpendForecast;
        const totalProjectedIncome = alreadyReceived + expectedInflow;

        // Step 8: Budget Health Generation
        const budgetHealth = computeBudgetHealth(
            totalProjectedExpenses,
            totalProjectedIncome,
            alreadySpent,
            historicalBaseline.totalAvgMonthly,
            daysPassed,
            daysInMonth
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
                category: item.category || 'אחר'
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
            remainingDays
        };
    }, [allTransactions, selectedMonth, ccPaymentDate, forecastMonths, customCCKeywords]);
}
