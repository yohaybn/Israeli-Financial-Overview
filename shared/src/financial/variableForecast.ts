/**
 * Variable category forecast: historically ~N expense txns/month at ~avg ₪ each.
 * Caps by the share of the month remaining so we don't imply e.g. 10 trips in 9 days.
 */
export function computeTxnBaselineVariableForecast(params: {
    expectedMonthlyTxnCount: number;
    avgTxnValue: number;
    currentMonthTxnCount: number;
    daysInMonth: number;
    remainingDays: number;
}): { amount: number; forecastTxnCount: number } {
    const N = params.expectedMonthlyTxnCount;
    if (!Number.isFinite(N) || N < 1) {
        return { amount: 0, forecastTxnCount: 0 };
    }
    const avgTxnValue = Math.max(0, params.avgTxnValue);
    const current = params.currentMonthTxnCount;
    const daysInMonth = params.daysInMonth;
    const remainingDays = Math.max(0, params.remainingDays);

    if (daysInMonth <= 0) {
        return { amount: 0, forecastTxnCount: 0 };
    }

    const gapTxns = Math.max(0, N - current);
    const expectedTxnsInRemainingPeriod = N * (remainingDays / daysInMonth);
    const forecastTxnCount = Math.min(gapTxns, expectedTxnsInRemainingPeriod);
    const amount = forecastTxnCount * avgTxnValue;

    return { amount, forecastTxnCount };
}

/**
 * Minimum elapsed days before naive pace-based projections are trusted.
 * Below this, a single purchase can multiply into an absurd month-end figure
 * (e.g. one ₪2,000 charge on the 1st → ₪58,000 "forecast").
 */
export const MIN_DAYS_FOR_PACE_PROJECTION = 5;

export interface CategoryVariableForecastParams {
    /** Historical baseline for the category (undefined when no history exists). */
    baseline?: {
        isFixed: boolean;
        expectedMonthlyTxnCount?: number;
        avgMonthlyTxnCount?: number;
        avgTxnValue?: number;
    };
    isCurrentMonth: boolean;
    spent: number;
    currentMonthTxnCount: number;
    daysPassed: number;
    daysInMonth: number;
    remainingDays: number;
}

export interface CategoryVariableForecastResult {
    amount: number;
    forecastTxnCount?: number;
    method?: 'historical_avg' | 'extrapolation' | 'transaction_count';
    rate: number;
}

/**
 * Per-category variable-spend forecast, shared by the dashboard hook and the
 * Telegram digest so both stay in sync.
 *
 * - Categories with a non-fixed baseline forecast by expected transaction count
 *   (see computeTxnBaselineVariableForecast).
 * - Categories with no baseline fall back to naive pace extrapolation, but only
 *   after MIN_DAYS_FOR_PACE_PROJECTION days have elapsed, and the remaining
 *   forecast is capped at what was already spent (month-end ≤ 2× spend-to-date)
 *   so one early-month purchase cannot explode the projection.
 */
export function computeCategoryVariableForecast(
    params: CategoryVariableForecastParams
): CategoryVariableForecastResult {
    const { baseline, isCurrentMonth, spent, currentMonthTxnCount, daysPassed, remainingDays } = params;
    if (!isCurrentMonth) {
        return { amount: 0, rate: 0 };
    }

    if (baseline && !baseline.isFixed) {
        const N = baseline.avgMonthlyTxnCount ?? baseline.expectedMonthlyTxnCount ?? 0;
        const { amount, forecastTxnCount } = computeTxnBaselineVariableForecast({
            expectedMonthlyTxnCount: N,
            avgTxnValue: baseline.avgTxnValue || 0,
            currentMonthTxnCount,
            daysInMonth: params.daysInMonth,
            remainingDays,
        });
        if (N >= 1) {
            return { amount, forecastTxnCount, method: 'transaction_count', rate: 0 };
        }
        return { amount: 0, rate: 0 };
    }

    if (!baseline && spent > 0) {
        if (daysPassed < MIN_DAYS_FOR_PACE_PROJECTION) {
            return { amount: 0, rate: 0 };
        }
        const rate = spent / daysPassed;
        const amount = Math.min(rate * Math.max(0, remainingDays), spent);
        return { amount, method: 'extrapolation', rate };
    }

    return { amount: 0, rate: 0 };
}
