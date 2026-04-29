export interface MonthlyNetByMonthRow {
    month: string;
    net: number;
}

export interface MonthlyNetFlowProjection {
    lookbackUsed: number;
    horizonMonths: number;
    averageNet: number | null;
    cumulativeIfAverageContinues: number | null;
    /** When false, omit strong projection copy (need at least 2 months of history). */
    showProjection: boolean;
}

const DEFAULT_HORIZON = 6;
const DEFAULT_LOOKBACK = 6;

/**
 * Simple projection: average monthly net over the last L complete buckets in `byMonth`,
 * extrapolated as cumulative flow over `horizonMonths` (not bank balance).
 */
export function computeMonthlyNetFlowProjection(
    byMonth: MonthlyNetByMonthRow[],
    options?: { horizonMonths?: number; lookbackMonths?: number }
): MonthlyNetFlowProjection {
    const horizonMonths = options?.horizonMonths ?? DEFAULT_HORIZON;
    const lookbackMonths = options?.lookbackMonths ?? DEFAULT_LOOKBACK;

    if (!byMonth?.length) {
        return {
            lookbackUsed: 0,
            horizonMonths,
            averageNet: null,
            cumulativeIfAverageContinues: null,
            showProjection: false,
        };
    }

    const sorted = [...byMonth].sort((a, b) => a.month.localeCompare(b.month));
    const L = Math.min(lookbackMonths, sorted.length);
    const slice = sorted.slice(-L);
    const sumNet = slice.reduce((s, r) => s + r.net, 0);
    const averageNet = L > 0 ? Math.round((sumNet / L) * 100) / 100 : null;
    const cumulativeIfAverageContinues =
        averageNet != null ? Math.round(averageNet * horizonMonths * 100) / 100 : null;

    return {
        lookbackUsed: L,
        horizonMonths,
        averageNet,
        cumulativeIfAverageContinues,
        showProjection: sorted.length >= 2,
    };
}
