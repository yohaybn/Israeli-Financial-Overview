import { v4 as uuidv4 } from 'uuid';
import type { DbService } from './dbService.js';
import { fetchUsdIlsRate, resolveQuotesForPortfolioRows } from './investmentMarketDataService.js';
import { DEFAULT_INVESTMENT_USER_ID, PORTFOLIO_DISPLAY_CURRENCY } from '../constants/investments.js';
import { serviceLogger as logger } from '../utils/logger.js';

export type LivePositionRow = {
    investmentId: string;
    symbol: string;
    /** Optional display name from investments.nickname */
    nickname: string | null;
    quantity: number;
    purchasePricePerUnit: number;
    /**
     * When true with ILS, `purchasePricePerUnit` is stored in agorot (1/100 ₪).
     * Tel-Aviv market data is often quoted in agorot too; we ÷100 on the live quote so P&L matches shekels.
     */
    valueInAgorot: boolean;
    currency: string;
    trackFromDate: string;
    /** Last trade / quote per unit in **shekels** (after agorot→₪ when `valueInAgorot`). */
    currentPrice: number | null;
    costBasisNative: number;
    marketValueNative: number | null;
    pnlNative: number | null;
    costBasisIls: number | null;
    marketValueIls: number | null;
    pnlIls: number | null;
    /** P&L as % of cost in ILS when cost &gt; 0. */
    pnlPctOfCost: number | null;
    quoteError?: string;
};

export type LivePortfolioSummary = {
    displayCurrency: typeof PORTFOLIO_DISPLAY_CURRENCY;
    usdIlsRate: number | null;
    positions: LivePositionRow[];
    totalCostBasisIls: number | null;
    totalMarketValueIls: number | null;
    totalPnlIls: number | null;
    /** Total P&L as % of total cost basis in ILS (null if cost is zero or incomplete). */
    totalPnlPctOfCost: number | null;
    partialQuotes: boolean;
};

/** Purchase price per unit in major currency units (shekels for ILS, including agorot → ÷100). */
function purchasePricePerUnitMajor(inv: {
    purchasePricePerUnit: number;
    currency: string;
    valueInAgorot: boolean;
}): number {
    if (inv.currency.toUpperCase() === 'ILS' && inv.valueInAgorot) {
        return inv.purchasePricePerUnit / 100;
    }
    return inv.purchasePricePerUnit;
}

function toIls(amountNative: number, currency: string, usdIls: number | null): number | null {
    const c = currency.toUpperCase();
    if (c === 'ILS') return amountNative;
    if (c === 'USD') {
        if (usdIls == null || !Number.isFinite(usdIls) || usdIls <= 0) return null;
        return amountNative * usdIls;
    }
    return null;
}

export async function computeLivePortfolioForUser(db: DbService, userId: string): Promise<LivePortfolioSummary> {
    const rows = db.listInvestments(userId);
    // Run FX before quotes so parallel Yahoo requests do not contend the same session (reduces 429s).
    const usdIlsRate = await fetchUsdIlsRate();
    const quoteMode = db.getInvestmentAppSettings(DEFAULT_INVESTMENT_USER_ID).eodhdQuoteMode;
    const resolvedQuotes = await resolveQuotesForPortfolioRows(
        rows.map((r) => ({
            symbol: r.symbol,
            currency: r.currency,
            useTelAvivListing: r.useTelAvivListing,
        })),
        { eodhdQuoteMode: quoteMode }
    );

    const positions: LivePositionRow[] = [];
    let anyPartial = false;

    for (const inv of rows) {
        const sym = inv.symbol.toUpperCase();
        const res = resolvedQuotes.get(sym);
        const rawQuote = res && 'price' in res ? res.price : null;
        const quoteResolutionError = res && 'error' in res ? res.error : undefined;
        const quoteShekelsPerUnit =
            rawQuote != null && Number.isFinite(rawQuote)
                ? inv.currency.toUpperCase() === 'ILS' && inv.valueInAgorot
                    ? rawQuote / 100
                    : rawQuote
                : null;
        if (quoteShekelsPerUnit == null) anyPartial = true;

        const puMajor = purchasePricePerUnitMajor(inv);
        const costBasisNative = puMajor * inv.quantity;
        const marketValueNative =
            quoteShekelsPerUnit != null ? quoteShekelsPerUnit * inv.quantity : null;
        const pnlNative =
            quoteShekelsPerUnit != null ? (quoteShekelsPerUnit - puMajor) * inv.quantity : null;

        const costBasisIls = toIls(costBasisNative, inv.currency, usdIlsRate);
        const marketValueIls =
            marketValueNative != null ? toIls(marketValueNative, inv.currency, usdIlsRate) : null;
        const pnlIls = pnlNative != null ? toIls(pnlNative, inv.currency, usdIlsRate) : null;

        if (costBasisIls == null || marketValueIls == null || pnlIls == null) {
            anyPartial = true;
        }

        const pnlPctOfCost =
            costBasisIls != null && costBasisIls > 0 && pnlIls != null && Number.isFinite(pnlIls)
                ? (pnlIls / costBasisIls) * 100
                : null;

        positions.push({
            investmentId: inv.id,
            symbol: sym,
            nickname: inv.nickname,
            quantity: inv.quantity,
            purchasePricePerUnit: inv.purchasePricePerUnit,
            valueInAgorot: inv.valueInAgorot,
            currency: inv.currency.toUpperCase(),
            trackFromDate: inv.trackFromDate,
            currentPrice: quoteShekelsPerUnit,
            costBasisNative,
            marketValueNative,
            pnlNative,
            costBasisIls,
            marketValueIls,
            pnlIls,
            pnlPctOfCost,
            quoteError:
                quoteShekelsPerUnit == null
                    ? (quoteResolutionError ?? 'quote_unavailable')
                    : costBasisIls == null
                      ? 'fx_unavailable'
                      : undefined,
        });
    }

    if (rows.length === 0) {
        return {
            displayCurrency: PORTFOLIO_DISPLAY_CURRENCY,
            usdIlsRate: usdIlsRate,
            positions: [],
            totalCostBasisIls: 0,
            totalMarketValueIls: 0,
            totalPnlIls: 0,
            totalPnlPctOfCost: 0,
            partialQuotes: false,
        };
    }

    const totalCostBasisIls = positions.every((p) => p.costBasisIls != null)
        ? positions.reduce((a, p) => a + (p.costBasisIls as number), 0)
        : null;
    const totalMarketValueIls = positions.every((p) => p.marketValueIls != null)
        ? positions.reduce((a, p) => a + (p.marketValueIls as number), 0)
        : null;
    const totalPnlIls = positions.every((p) => p.pnlIls != null)
        ? positions.reduce((a, p) => a + (p.pnlIls as number), 0)
        : null;

    const totalPnlPctOfCost =
        totalCostBasisIls != null &&
        totalCostBasisIls > 0 &&
        totalPnlIls != null &&
        Number.isFinite(totalPnlIls)
            ? (totalPnlIls / totalCostBasisIls) * 100
            : null;

    const missing = rows
        .map((r) => r.symbol.trim().toUpperCase())
        .filter((sym) => !resolvedQuotes.has(sym));
    if (missing.length) {
        logger.debug('Some portfolio symbols had no quote after provider resolution', {
            unresolved: missing.length,
            symbols: missing,
        });
    }

    return {
        displayCurrency: PORTFOLIO_DISPLAY_CURRENCY,
        usdIlsRate,
        positions,
        totalCostBasisIls,
        totalMarketValueIls,
        totalPnlIls,
        totalPnlPctOfCost,
        partialQuotes: anyPartial,
    };
}

export async function recordPortfolioSnapshotNow(
    db: DbService,
    userId: string,
    snapshotDate: string
): Promise<{ ok: boolean; reason?: string }> {
    const summary = await computeLivePortfolioForUser(db, userId);
    if (summary.positions.length === 0) {
        return { ok: false, reason: 'no_positions' };
    }
    if (summary.totalMarketValueIls == null) {
        return { ok: false, reason: 'incomplete_quotes_or_fx' };
    }
    db.upsertPortfolioHistorySnapshot({
        id: uuidv4(),
        userId,
        snapshotDate,
        totalValue: summary.totalMarketValueIls,
        displayCurrency: summary.displayCurrency,
    });
    return { ok: true };
}
