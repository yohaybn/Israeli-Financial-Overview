import type { DbService } from './dbService.js';
import { getEodhdApiToken } from '../constants/marketData.js';
import { buildEodhdQuoteCandidates } from './eodhdSymbolResolver.js';
import { fetchEodhdEodSeriesResult } from './eodhdClient.js';

export type InvestmentPriceHistoryPoint = {
    date: string;
    price: number;
    /** Your recorded purchase price per unit on the buy date (first point). */
    source: 'purchase' | 'eod';
};

export type InvestmentEodRowInput = {
    symbol: string;
    quantity: number;
    purchasePricePerUnit: number;
    currency: string;
    trackFromDate: string;
    useTelAvivListing: boolean;
    valueInAgorot: boolean;
};

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function todayIsoUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

function purchasePricePerUnitMajor(inv: InvestmentEodRowInput): number {
    if (inv.currency.toUpperCase() === 'ILS' && inv.valueInAgorot) {
        return inv.purchasePricePerUnit / 100;
    }
    return inv.purchasePricePerUnit;
}

function eodCloseToDisplayPerUnit(close: number, inv: { currency: string; valueInAgorot: boolean }): number {
    if (inv.currency.toUpperCase() === 'ILS' && inv.valueInAgorot) {
        return close / 100;
    }
    return close;
}

/**
 * Same EOD series as the per-position chart: purchase price on `trackFromDate`, then daily closes after that.
 * Used by single-investment chart and aggregate portfolio value history.
 */
export async function loadEodPointsForInvestmentRow(
    inv: InvestmentEodRowInput,
    token: string
): Promise<
    | { ok: true; points: InvestmentPriceHistoryPoint[]; resolvedSymbol: string }
    | { ok: false; error: string; detail?: string }
> {
    const buy = inv.trackFromDate;
    const today = todayIsoUtc();
    if (buy > today) {
        return { ok: false, error: 'invalid_buy_date' };
    }

    const purchaseMajor = purchasePricePerUnitMajor(inv);
    const points: InvestmentPriceHistoryPoint[] = [
        { date: buy, price: purchaseMajor, source: 'purchase' },
    ];

    const candidates = buildEodhdQuoteCandidates(inv.symbol, inv.currency, inv.useTelAvivListing);
    const errors: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
        const sym = candidates[i];
        const series = await fetchEodhdEodSeriesResult(token, sym, buy, today);
        if (!series.ok) {
            errors.push(`${sym}: ${series.error}`);
            if (i + 1 < candidates.length) await sleep(100 + Math.floor(Math.random() * 80));
            continue;
        }
        if (series.bars.length === 0) {
            errors.push(`${sym}: empty_series`);
            if (i + 1 < candidates.length) await sleep(100 + Math.floor(Math.random() * 80));
            continue;
        }
        const marketBars = series.bars.filter((b) => b.date > buy);
        if (marketBars.length === 0) {
            return {
                ok: true,
                points,
                resolvedSymbol: series.symbol,
            };
        }
        for (const b of marketBars) {
            points.push({
                date: b.date,
                price: eodCloseToDisplayPerUnit(b.close, inv),
                source: 'eod',
            });
        }
        return {
            ok: true,
            points,
            resolvedSymbol: series.symbol,
        };
    }

    return {
        ok: false,
        error: 'eodhd_no_data',
        detail: errors.length ? errors.slice(0, 4).join(' | ') : undefined,
    };
}

export type BuildInvestmentPriceHistoryResult =
    | {
          ok: true;
          points: InvestmentPriceHistoryPoint[];
          resolvedSymbol: string;
          currency: string;
      }
    | {
          ok: false;
          error: 'not_found' | 'eodhd_token_required' | 'invalid_buy_date' | 'eodhd_no_data';
          detail?: string;
      };

/**
 * Builds a per-unit price series for charting: first point is the user's purchase price on `trackFromDate`,
 * then EODHD `/api/eod` daily closes (same unit convention as live portfolio quotes for TA agorot).
 */
export async function buildInvestmentPriceHistory(
    db: DbService,
    userId: string,
    investmentId: string
): Promise<BuildInvestmentPriceHistoryResult> {
    const inv = db.getInvestment(investmentId);
    if (!inv || inv.userId !== userId) {
        return { ok: false, error: 'not_found' };
    }

    const token = getEodhdApiToken();
    if (!token) {
        return { ok: false, error: 'eodhd_token_required' };
    }

    const row: InvestmentEodRowInput = {
        symbol: inv.symbol,
        quantity: inv.quantity,
        purchasePricePerUnit: inv.purchasePricePerUnit,
        currency: inv.currency,
        trackFromDate: inv.trackFromDate,
        useTelAvivListing: inv.useTelAvivListing,
        valueInAgorot: inv.valueInAgorot,
    };

    const inner = await loadEodPointsForInvestmentRow(row, token);
    if (!inner.ok) {
        if (inner.error === 'invalid_buy_date') {
            return { ok: false, error: 'invalid_buy_date' };
        }
        return { ok: false, error: 'eodhd_no_data', detail: inner.detail };
    }
    return {
        ok: true,
        points: inner.points,
        resolvedSymbol: inner.resolvedSymbol,
        currency: inv.currency.toUpperCase(),
    };
}
