/**
 * Calendar month (YYYY-MM) used when the scheduled financial PDF job runs.
 */
export function resolveFinancialReportMonthYm(
    rule: 'previous_calendar_month' | 'current_calendar_month',
    now: Date = new Date()
): string {
    const y = now.getFullYear();
    const m0 = now.getMonth();
    if (rule === 'current_calendar_month') {
        return `${y}-${String(m0 + 1).padStart(2, '0')}`;
    }
    const d = new Date(y, m0, 1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
