import type { DbService } from './dbService.js';
import { getEodhdApiToken } from '../constants/marketData.js';
import { fetchUsdIlsRate, fetchUsdIlsRatesFrankfurterRange } from './investmentMarketDataService.js';
import { loadEodPointsForInvestmentRow, type InvestmentEodRowInput } from './investmentPriceHistoryService.js';

export type PortfolioValueHistoryPoint = {
    date: string;
    /** Total portfolio market value in ILS (EOD closes × qty, same per-unit rules as position charts). */
    totalValueIls: number;
    /** Change vs first point in this series (after filters), percent. */
    changePct: number | null;
};

function todayIsoUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

function priceNativeAtOrBefore(series: { date: string; price: number }[], d: string): number | null {
    let best: number | null = null;
    for (const p of series) {
        if (p.date <= d) best = p.price;
        else break;
    }
    return best;
}

function iterCalendarDates(fromIso: string, toIso: string): string[] {
    const out: string[] = [];
    const [y0, m0, d0] = fromIso.split('-').map(Number);
    const [y1, m1, d1] = toIso.split('-').map(Number);
    const a = new Date(Date.UTC(y0, m0 - 1, d0));
    const b = new Date(Date.UTC(y1, m1 - 1, d1));
    for (let t = a.getTime(); t <= b.getTime(); t += 86400000) {
        out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
}

export type BuildPortfolioEodValueHistoryResult =
    | {
          ok: true;
          points: PortfolioValueHistoryPoint[];
          partial: boolean;
          fxMode: 'historic' | 'spot';
      }
    | { ok: false; error: 'eodhd_token_required' | 'no_positions' };

/**
 * Portfolio total value over time using the same EODHD `/api/eod` per-unit logic as each position's chart,
 * summed in ILS. USD legs use either daily Frankfurter USD→ILS (`historic`) or today's spot for every day (`spot`).
 */
export async function buildPortfolioEodValueHistory(
    db: DbService,
    userId: string,
    opts: { fromDate?: string; toDate?: string; historicUsdIls: boolean }
): Promise<BuildPortfolioEodValueHistoryResult> {
    const rows = db.listInvestments(userId);
    if (rows.length === 0) {
        return { ok: false, error: 'no_positions' };
    }
    const token = getEodhdApiToken();
    if (!token) {
        return { ok: false, error: 'eodhd_token_required' };
    }

    const today = todayIsoUtc();
    const minBuy = rows.reduce((a, r) => (r.trackFromDate < a ? r.trackFromDate : a), rows[0].trackFromDate);
    const from = opts.fromDate && opts.fromDate >= minBuy ? opts.fromDate : minBuy;
    const to = opts.toDate && opts.toDate <= today ? opts.toDate : today;
    if (from > to) {
        return { ok: true, points: [], partial: false, fxMode: opts.historicUsdIls ? 'historic' : 'spot' };
    }

    const spotFx = await fetchUsdIlsRate();
    const fxMap = opts.historicUsdIls ? await fetchUsdIlsRatesFrankfurterRange(minBuy, today) : null;
    let partial = opts.historicUsdIls && (fxMap == null || fxMap.size === 0);

    let fxCarry = spotFx;
    if (opts.historicUsdIls && fxMap && fxMap.size > 0) {
        for (const [dt, v] of [...fxMap.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
            if (dt < from) fxCarry = v;
            else break;
        }
    }

    type RowPack = {
        inv: InvestmentEodRowInput;
        points: { date: string; price: number }[];
        currency: string;
    };
    const packs: RowPack[] = [];
    let anySeriesFail = false;

    for (const r of rows) {
        const inv: InvestmentEodRowInput = {
            symbol: r.symbol,
            quantity: r.quantity,
            purchasePricePerUnit: r.purchasePricePerUnit,
            currency: r.currency,
            trackFromDate: r.trackFromDate,
            useTelAvivListing: r.useTelAvivListing,
            valueInAgorot: r.valueInAgorot,
        };
        const loaded = await loadEodPointsForInvestmentRow(inv, token);
        if (!loaded.ok) {
            anySeriesFail = true;
            continue;
        }
        const points = loaded.points.map((p) => ({ date: p.date, price: p.price }));
        packs.push({ inv, points, currency: r.currency.toUpperCase() });
    }

    if (packs.length === 0) {
        return { ok: true, points: [], partial: true, fxMode: opts.historicUsdIls ? 'historic' : 'spot' };
    }

    if (anySeriesFail) partial = true;

    const calendar = iterCalendarDates(from, to);
    const rawPoints: PortfolioValueHistoryPoint[] = [];

    for (const d of calendar) {
        if (opts.historicUsdIls && fxMap?.has(d)) {
            fxCarry = fxMap.get(d)!;
        }
        const fx = opts.historicUsdIls ? fxCarry : spotFx;

        let total = 0;
        let dayPartial = false;
        for (const pack of packs) {
            if (d < pack.inv.trackFromDate) continue;
            const unit = priceNativeAtOrBefore(pack.points, d);
            if (unit == null) {
                dayPartial = true;
                continue;
            }
            const mvNative = unit * pack.inv.quantity;
            if (pack.currency === 'ILS') {
                total += mvNative;
            } else if (pack.currency === 'USD') {
                if (fx == null || !Number.isFinite(fx) || fx <= 0) {
                    dayPartial = true;
                    continue;
                }
                total += mvNative * fx;
            }
        }
        if (dayPartial) partial = true;
        rawPoints.push({ date: d, totalValueIls: total, changePct: null });
    }

    const baseline = rawPoints[0]?.totalValueIls;
    const points: PortfolioValueHistoryPoint[] = rawPoints.map((row, i) => ({
        date: row.date,
        totalValueIls: row.totalValueIls,
        changePct:
            baseline != null && baseline > 0 && Number.isFinite(row.totalValueIls)
                ? ((row.totalValueIls / baseline) - 1) * 100
                : i === 0
                  ? 0
                  : null,
    }));

    return {
        ok: true,
        points,
        partial,
        fxMode: opts.historicUsdIls ? 'historic' : 'spot',
    };
}
