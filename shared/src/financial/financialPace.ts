import type {
    Transaction,
    CategoryBaseline,
    HistoricalBaseline,
    BudgetHealth,
    BudgetHealthMessageKey,
    AnomalyAlert,
    UpcomingItem
} from '../types.js';
import { isInternalTransfer } from '../isInternalTransfer.js';
import { isTransactionIgnored } from '../isTransactionIgnored.js';
import { expenseCategoryKey } from '../expenseCategory.js';

/** Dampen txn-pace ratio so one-off large bills do not swing velocity wildly. */
export function clampTxnPaceRatio(ratio: number): number {
    return Math.max(0.65, Math.min(1.35, ratio));
}

/**
 * Compute historical averages and baseline metrics per category.
 */
export function computeHistoricalBaseline(
    transactions: Transaction[],
    currentMonth: string,
    forecastMonths: number,
    customCCKeywords: string[] = []
): HistoricalBaseline {
    const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);

    const allCandidateMonths: string[] = [];
    for (let i = 1; i <= forecastMonths; i++) {
        let y = currentYear;
        let m = currentMonthNum - i;
        if (m <= 0) { m += 12; y -= 1; }
        allCandidateMonths.push(`${y}-${String(m).padStart(2, '0')}`);
    }

    const monthsWithData = new Set<string>();
    for (const txn of transactions) {
        if (isTransactionIgnored(txn)) continue;
        if (isInternalTransfer(txn, customCCKeywords)) continue;
        const amount = txn.chargedAmount || txn.amount || 0;
        if (amount >= 0) continue;
        const txnMonth = txn.date.substring(0, 7);
        if (allCandidateMonths.includes(txnMonth)) monthsWithData.add(txnMonth);
    }

    const pastMonths = allCandidateMonths.filter(m => monthsWithData.has(m));
    const monthsToAnalyze = Math.max(pastMonths.length, 1);

    const catMonthTotals = new Map<string, Map<string, number>>();
    const catMonthTxnCount = new Map<string, Map<string, number>>();

    for (const txn of transactions) {
        if (isTransactionIgnored(txn)) continue;
        if (isInternalTransfer(txn, customCCKeywords)) continue;
        const amount = txn.chargedAmount || txn.amount || 0;
        if (amount >= 0) continue;

        const txnMonth = txn.date.substring(0, 7);
        if (!pastMonths.includes(txnMonth)) continue;

        const cat = expenseCategoryKey(txn.category);
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
    let sumAvgTxnCount = 0;

    for (const [category, monthTotals] of catMonthTotals) {
        const amounts = Array.from(monthTotals.values());
        const avgMonthly = amounts.reduce((a, b) => a + b, 0) / monthsToAnalyze;
        const variance = amounts.reduce((a, b) => a + Math.pow(b - avgMonthly, 2), 0) / monthsToAnalyze;
        const stdDev = Math.sqrt(variance);

        const counts = Array.from(catMonthTxnCount.get(category)!.values());
        const avgTxnCount = counts.reduce((a, b) => a + b, 0) / monthsToAnalyze;
        const expectedMonthlyTxnCount = Math.max(1, Math.round(avgTxnCount));
        const avgTxnValue = avgTxnCount > 0 ? avgMonthly / avgTxnCount : 0;

        const isFixed = avgMonthly > 0 && (stdDev / avgMonthly) < 0.2;

        categories.push({
            category,
            avgMonthly,
            stdDev,
            avgDaily: avgMonthly / 30.4,
            monthCount: monthsToAnalyze,
            isFixed,
            expectedMonthlyTxnCount,
            avgMonthlyTxnCount: avgTxnCount,
            avgTxnValue
        });
        sumAvgMonthly += avgMonthly;
        sumAvgTxnCount += avgTxnCount;
    }

    return {
        categories,
        totalAvgMonthly: sumAvgMonthly,
        monthsAnalyzed: monthsToAnalyze,
        totalAvgMonthlyTxnCount: sumAvgTxnCount
    };
}

/**
 * Compute budget health score based on velocity and projected surplus/deficit.
 */
export function computeBudgetHealth(
    totalProjectedExpenses: number,
    totalProjectedIncome: number,
    spentSoFar: number,
    historicalTotalAvg: number,
    daysPassed: number,
    daysInMonth: number,
    currentMonthExpenseTxnCount: number,
    historicalTotalAvgTxnCount: number
): BudgetHealth {
    const projectedSurplus = totalProjectedIncome - totalProjectedExpenses;

    const expectedSpendToDate =
        daysInMonth > 0 ? historicalTotalAvg * (daysPassed / daysInMonth) : 0;

    let velocityRatio = 1.0;
    if (daysPassed > 0 && daysInMonth > 0) {
        if (historicalTotalAvgTxnCount > 0 && expectedSpendToDate > 0) {
            const spendRatio = spentSoFar / expectedSpendToDate;
            const expectedTxnToDate = historicalTotalAvgTxnCount * (daysPassed / daysInMonth);
            const txnRatio =
                expectedTxnToDate > 0 ? currentMonthExpenseTxnCount / expectedTxnToDate : 1;
            velocityRatio = spendRatio / clampTxnPaceRatio(txnRatio);
        } else {
            const actualSpendRate = spentSoFar / daysPassed;
            const projectedRate = historicalTotalAvg / daysInMonth;
            velocityRatio = projectedRate > 0 ? actualSpendRate / projectedRate : 1.0;
        }
    }

    let score: 'on_track' | 'caution' | 'at_risk' = 'on_track';
    let message = 'Spending pace is good.';
    let messageKey: BudgetHealthMessageKey = 'pace_good';

    if (velocityRatio > 1.3) {
        score = 'at_risk';
        messageKey = 'pace_much_faster';
        message = 'Spending much faster than historical average.';
    } else if (velocityRatio > 1.1) {
        score = 'caution';
        messageKey = 'pace_slightly_fast';
        message = 'Spending slightly faster than usual.';
    }

    if (projectedSurplus < 0 && score === 'on_track') {
        score = 'caution';
        messageKey = 'projected_deficit';
        message = 'Projected deficit for this month.';
    }

    return {
        score,
        projectedSurplus,
        velocityRatio,
        message,
        messageKey
    };
}

const SEVERITY_RANK: Record<AnomalyAlert['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2
};

export interface DetectAnomaliesOptions {
    /** Max alerts after sorting by severity (default 5). */
    maxAlerts?: number;
    /** Largest single debit per category this month — enables whale (large one-off) detection. */
    maxTxnByCategory?: Map<string, number>;
}

/**
 * Detect spending anomalies and alerts.
 */
export function detectAnomalies(
    historicalBaseline: HistoricalBaseline,
    spentByCategory: Map<string, number>,
    txnCountByCategory: Map<string, number>,
    daysPassed: number,
    daysInMonth: number,
    upcomingFixed: UpcomingItem[],
    options?: DetectAnomaliesOptions
): AnomalyAlert[] {
    const maxAlerts = options?.maxAlerts ?? 5;
    const maxTxnByCategory = options?.maxTxnByCategory;

    const alerts: AnomalyAlert[] = [];

    for (const [cat, spent] of spentByCategory) {
        const baseline = historicalBaseline.categories.find((c: CategoryBaseline) => c.category === cat);
        if (!baseline) continue;

        const avgTxnCount = baseline.avgMonthlyTxnCount ?? baseline.expectedMonthlyTxnCount ?? 1;
        const expectedSpendToDate =
            daysInMonth > 0 ? baseline.avgMonthly * (daysPassed / daysInMonth) : baseline.avgMonthly;
        const expectedTxnToDate =
            daysInMonth > 0 ? avgTxnCount * (daysPassed / daysInMonth) : avgTxnCount;
        const currentTxnCount = txnCountByCategory.get(cat) ?? 0;
        let spendPaceRatio = 1;
        if (expectedSpendToDate > 0 && avgTxnCount > 0 && expectedTxnToDate > 0) {
            const txnRatio = currentTxnCount / expectedTxnToDate;
            spendPaceRatio = (spent / expectedSpendToDate) / clampTxnPaceRatio(txnRatio);
        }

        const projectedMonthEnd =
            daysPassed > 0 ? (spent / daysPassed) * daysInMonth : spent;
        const isOutlierProjected =
            projectedMonthEnd > baseline.avgMonthly + 2 * baseline.stdDev &&
            baseline.stdDev > 0 &&
            spent > 200;

        if (baseline.avgMonthly > 0 && expectedSpendToDate > 0) {
            if (spendPaceRatio > 1.1 && spent > 200 && !isOutlierProjected) {
                alerts.push({
                    id: `over_${cat}`,
                    type: 'velocity',
                    category: cat,
                    description: `Over average spending in ${cat}`,
                    message: `Spending in ${cat} is ahead of your usual pace for this point in the month.`,
                    severity: 'warning',
                    currentValue: spent,
                    expectedValue: Math.round(expectedSpendToDate * 100) / 100
                });
            }
        }

        if (isOutlierProjected) {
            alerts.push({
                id: `outl_${cat}`,
                type: 'outlier',
                category: cat,
                description: `Unusual spending in ${cat}`,
                message: `${cat} is trending well above your typical monthly level.`,
                severity: 'critical',
                currentValue: spent,
                expectedValue: baseline.avgMonthly
            });
        }

        // Whale: one unusually large expense vs typical txn size or share of category MTD
        if (maxTxnByCategory && !isOutlierProjected && baseline.avgMonthly > 0) {
            const maxSingle = maxTxnByCategory.get(cat) ?? 0;
            if (maxSingle >= 150) {
                const avgVal = baseline.avgTxnValue || 0;
                const shareOfMtd = spent > 0 ? maxSingle / spent : 0;
                const vsMonthly = maxSingle / baseline.avgMonthly;
                const strongVsAvg = avgVal > 0 && maxSingle >= 2.5 * avgVal && maxSingle >= 200;
                const dominatesMtd = spent >= 350 && shareOfMtd >= 0.45;
                const largeVsMonthly = vsMonthly >= 0.28 && maxSingle >= 300;
                if (strongVsAvg || dominatesMtd || largeVsMonthly) {
                    const severity: 'warning' | 'info' =
                        (avgVal > 0 && maxSingle >= 3.5 * avgVal) || shareOfMtd >= 0.55
                            ? 'warning'
                            : 'info';
                    alerts.push({
                        id: `whale_${cat}`,
                        type: 'whale',
                        category: cat,
                        description: `Large purchase in ${cat}`,
                        message:
                            avgVal > 0
                                ? `One expense (${Math.round(maxSingle)} ₪) is much larger than your typical ${cat} charge (~${Math.round(avgVal)} ₪).`
                                : `One expense (${Math.round(maxSingle)} ₪) stands out in ${cat} this month.`,
                        severity,
                        currentValue: maxSingle,
                        expectedValue: avgVal > 0 ? Math.round(avgVal * 100) / 100 : undefined
                    });
                }
            }
        }
    }

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
                expectedValue: item.amount,
                meta: {
                    itemType: item.type,
                    recurringDescription: item.description,
                    expectedDateIso: item.expectedDate
                }
            });
        }
    }

    alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    return alerts.slice(0, maxAlerts);
}
