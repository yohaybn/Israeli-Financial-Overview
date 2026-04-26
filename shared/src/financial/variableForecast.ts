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
