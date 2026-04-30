import YahooFinance from 'yahoo-finance2';
import { serviceLogger as logger } from '../utils/logger.js';
import { logExternal, YAHOO_QUERY_HOST } from '../utils/externalServiceLog.js';
import { createYahooLoggingFetch } from '../utils/yahooHttpTrace.js';
import { buildYahooQuoteCandidates } from './yahooSymbolResolver.js';
import { buildEodhdQuoteCandidates } from './eodhdSymbolResolver.js';
import {
    fetchEodhdEodCloseOnDate,
    fetchEodhdLatestEodQuoteResult,
    fetchEodhdRealtimeQuoteResult,
} from './eodhdClient.js';
import { fetchYahooCloseOnDate } from './yahooChartClose.js';
import { useEodhdPrimaryQuotes, getEodhdApiToken } from '../constants/marketData.js';
import { parseEodhdQuoteMode, type EodhdQuoteMode } from '../constants/eodhdQuote.js';

// yahoo-finance2 accepts `fetch` at runtime; bundled typings for 2.14 omit it.
const yahooFinance = new YahooFinance({
    fetch: createYahooLoggingFetch(),
} as unknown as ConstructorParameters<typeof YahooFinance>[0]);

const BATCH_SIZE = 3;
const BETWEEN_BATCH_MS = 500;

let usdIlsCache: { value: number; at: number } | null = null;
/** Fresh-enough FX for display; Yahoo is easy to 429 if polled too often. */
const USD_ILS_TTL_MS = 300_000;
/** After Yahoo (and fallback) fail, reuse last good rate so the UI still converts USD. */
const USD_ILS_STALE_MAX_MS = 48 * 60 * 60 * 1000;

const FRANKFURTER_HOST = 'api.frankfurter.app';

async function fetchUsdIlsFromFrankfurter(): Promise<number | null> {
    const t0 = Date.now();
    const path = '/latest';
    try {
        const url = `https://${FRANKFURTER_HOST}${path}?from=USD&to=ILS`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const durationMs = Date.now() - t0;
        if (!res.ok) {
            logExternal({
                service: 'frankfurter',
                operation: 'quote_usd_ils',
                host: FRANKFURTER_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: res.status,
                errorMessage: res.statusText,
            });
            return null;
        }
        const data = (await res.json()) as { rates?: { ILS?: number } };
        const r = data?.rates?.ILS;
        const p = typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : null;
        if (p == null) {
            logExternal({
                service: 'frankfurter',
                operation: 'quote_usd_ils',
                host: FRANKFURTER_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                errorMessage: 'missing_or_invalid_rate',
            });
            return null;
        }
        logExternal({
            service: 'frankfurter',
            operation: 'quote_usd_ils',
            host: FRANKFURTER_HOST,
            method: 'GET',
            path,
            outcome: 'ok',
            durationMs,
            extra: { from: 'USD', to: 'ILS' },
        });
        return p;
    } catch (e) {
        const durationMs = Date.now() - t0;
        logExternal({
            service: 'frankfurter',
            operation: 'quote_usd_ils',
            host: FRANKFURTER_HOST,
            method: 'GET',
            path,
            outcome: 'error',
            durationMs,
            errorMessage: e instanceof Error ? e.message : String(e),
        });
        return null;
    }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ILS per 1 USD on `isoDate` (Frankfurter ECB series, then Yahoo `ILS=X` chart close).
 * Same units as {@link fetchUsdIlsRate}: multiply USD by this rate to get ILS.
 */
export async function fetchUsdIlsRateOnDate(isoDate: string): Promise<number | null> {
    const d = String(isoDate || '').trim().slice(0, 10);
    if (!ISO_DATE_RE.test(d)) return null;
    const t0 = Date.now();
    const path = `/${d}`;
    try {
        const url = `https://${FRANKFURTER_HOST}${path}?from=USD&to=ILS`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const durationMs = Date.now() - t0;
        if (res.ok) {
            const data = (await res.json()) as { rates?: { ILS?: number } };
            const r = data?.rates?.ILS;
            const p = typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : null;
            if (p != null) {
                logExternal({
                    service: 'frankfurter',
                    operation: 'historic_usd_ils',
                    host: FRANKFURTER_HOST,
                    method: 'GET',
                    path,
                    outcome: 'ok',
                    durationMs,
                    httpStatus: res.status,
                    extra: { date: d },
                });
                return p;
            }
        } else {
            logExternal({
                service: 'frankfurter',
                operation: 'historic_usd_ils',
                host: FRANKFURTER_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs: Date.now() - t0,
                httpStatus: res.status,
                errorMessage: res.statusText,
                extra: { date: d },
            });
        }
    } catch (e) {
        const durationMs = Date.now() - t0;
        logExternal({
            service: 'frankfurter',
            operation: 'historic_usd_ils',
            host: FRANKFURTER_HOST,
            method: 'GET',
            path,
            outcome: 'error',
            durationMs,
            errorMessage: e instanceof Error ? e.message : String(e),
            extra: { date: d },
        });
    }

    const ty0 = Date.now();
    const yClose = await fetchYahooCloseOnDate('ILS=X', d);
    if (yClose != null && Number.isFinite(yClose) && yClose > 0) {
        logExternal({
            service: 'yahoo',
            operation: 'historic_usd_ils',
            host: YAHOO_QUERY_HOST,
            method: 'GET',
            path: '/v8/finance/chart',
            outcome: 'ok',
            durationMs: Date.now() - ty0,
            extra: { symbol: 'ILS=X', date: d, source: 'chart_close' },
        });
        return yClose;
    }
    return null;
}

/**
 * ILS per 1 USD for each calendar date in `[fromIso, toIso]` from Frankfurter's range endpoint.
 * Weekends/holidays may be missing; callers should forward-fill. Returns null if the request fails.
 */
export async function fetchUsdIlsRatesFrankfurterRange(fromIso: string, toIso: string): Promise<Map<string, number> | null> {
    if (!ISO_DATE_RE.test(fromIso) || !ISO_DATE_RE.test(toIso) || fromIso > toIso) return null;
    const path = `/${fromIso}..${toIso}`;
    const t0 = Date.now();
    try {
        const url = `https://${FRANKFURTER_HOST}${path}?from=USD&to=ILS`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const durationMs = Date.now() - t0;
        if (!res.ok) {
            logExternal({
                service: 'frankfurter',
                operation: 'usd_ils_range',
                host: FRANKFURTER_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: res.status,
                errorMessage: res.statusText,
                extra: { fromIso, toIso },
            });
            return null;
        }
        const data = (await res.json()) as { rates?: Record<string, { ILS?: number }> };
        const raw = data?.rates;
        if (!raw || typeof raw !== 'object') {
            logExternal({
                service: 'frankfurter',
                operation: 'usd_ils_range',
                host: FRANKFURTER_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: res.status,
                errorMessage: 'missing_rates',
                extra: { fromIso, toIso },
            });
            return null;
        }
        const m = new Map<string, number>();
        for (const [d, v] of Object.entries(raw)) {
            if (!ISO_DATE_RE.test(d)) continue;
            const ils = v?.ILS;
            if (typeof ils === 'number' && Number.isFinite(ils) && ils > 0) m.set(d, ils);
        }
        logExternal({
            service: 'frankfurter',
            operation: 'usd_ils_range',
            host: FRANKFURTER_HOST,
            method: 'GET',
            path,
            outcome: 'ok',
            durationMs,
            httpStatus: res.status,
            extra: { fromIso, toIso, days: m.size },
        });
        return m;
    } catch (e) {
        const durationMs = Date.now() - t0;
        logExternal({
            service: 'frankfurter',
            operation: 'usd_ils_range',
            host: FRANKFURTER_HOST,
            method: 'GET',
            path,
            outcome: 'error',
            durationMs,
            errorMessage: e instanceof Error ? e.message : String(e),
            extra: { fromIso, toIso },
        });
        return null;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export async function fetchUsdIlsRate(): Promise<number | null> {
    const now = Date.now();
    if (usdIlsCache && now - usdIlsCache.at < USD_ILS_TTL_MS) {
        return usdIlsCache.value;
    }
    const t0 = Date.now();
    try {
        const q = (await yahooFinance.quote('ILS=X')) as { regularMarketPrice?: number };
        const durationMs = Date.now() - t0;
        const p = typeof q?.regularMarketPrice === 'number' && Number.isFinite(q.regularMarketPrice) ? q.regularMarketPrice : null;
        if (p == null || p <= 0) {
            logger.warn('Yahoo ILS=X quote missing or invalid');
            logExternal({
                service: 'yahoo',
                operation: 'quote_usd_ils',
                host: YAHOO_QUERY_HOST,
                method: 'GET',
                path: '/v7/finance/quote',
                outcome: 'error',
                durationMs,
                errorMessage: 'missing_or_invalid_price',
                extra: { symbol: 'ILS=X' },
            });
            return null;
        }
        usdIlsCache = { value: p, at: now };
        logExternal({
            service: 'yahoo',
            operation: 'quote_usd_ils',
            host: YAHOO_QUERY_HOST,
            method: 'GET',
            path: '/v7/finance/quote',
            outcome: 'ok',
            durationMs,
            extra: { symbol: 'ILS=X' },
        });
        return p;
    } catch (e) {
        const durationMs = Date.now() - t0;
        logger.warn('Failed to fetch USD/ILS from Yahoo', { message: e instanceof Error ? e.message : String(e) });
        logExternal({
            service: 'yahoo',
            operation: 'quote_usd_ils',
            host: YAHOO_QUERY_HOST,
            method: 'GET',
            path: '/v7/finance/quote',
            outcome: 'error',
            durationMs,
            errorMessage: e instanceof Error ? e.message : String(e),
            extra: { symbol: 'ILS=X' },
        });
        const frank = await fetchUsdIlsFromFrankfurter();
        if (frank != null) {
            usdIlsCache = { value: frank, at: now };
            return frank;
        }
        if (usdIlsCache != null && now - usdIlsCache.at < USD_ILS_STALE_MAX_MS) {
            logger.warn('Using stale USD/ILS cache after Yahoo and Frankfurter failure', {
                cacheAgeMs: now - usdIlsCache.at,
            });
            return usdIlsCache.value;
        }
        return null;
    }
}

export type YahooQuoteResult =
    | { ok: true; symbol: string; price: number; quoteCurrency?: string }
    | { ok: false; symbol: string; error: string };

/**
 * Fetches quotes in small batches to reduce burst rate-limit risk from Yahoo.
 */
export async function fetchYahooQuotesForSymbols(symbols: string[]): Promise<YahooQuoteResult[]> {
    const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    const out: YahooQuoteResult[] = [];
    const batchT0 = Date.now();

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
        const batch = unique.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(async (symbol) => {
                try {
                    const q = (await yahooFinance.quote(symbol)) as {
                        symbol?: string;
                        regularMarketPrice?: number;
                        currency?: string;
                    };
                    const price =
                        typeof q?.regularMarketPrice === 'number' && Number.isFinite(q.regularMarketPrice)
                            ? q.regularMarketPrice
                            : null;
                    if (price == null || price < 0) {
                        return { ok: false as const, symbol, error: 'missing_price' };
                    }
                    return {
                        ok: true as const,
                        symbol: (q.symbol || symbol).toUpperCase(),
                        price,
                        quoteCurrency: q.currency,
                    };
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    return { ok: false as const, symbol, error: msg.slice(0, 200) };
                }
            })
        );
        out.push(...batchResults);
        if (i + BATCH_SIZE < unique.length) {
            await sleep(BETWEEN_BATCH_MS + Math.floor(Math.random() * 120));
        }
    }

    if (unique.length > 0) {
        const durationMs = Date.now() - batchT0;
        const okCount = out.filter((r) => r.ok).length;
        const failCount = out.length - okCount;
        const maxSymbolsInLog = 80;
        const symbolsForLog = unique.slice(0, maxSymbolsInLog);
        const failures = out.filter((r): r is { ok: false; symbol: string; error: string } => !r.ok);
        logExternal({
            service: 'yahoo',
            operation: 'quote_batch',
            host: YAHOO_QUERY_HOST,
            method: 'GET',
            path: '/v7/finance/quote',
            outcome: failCount === unique.length ? 'error' : 'ok',
            durationMs,
            extra: {
                symbolsRequested: unique.length,
                /** Exact Yahoo tickers passed to `quote()` (includes `TA.*` / `*.TA` candidates). */
                symbols: symbolsForLog,
                symbolsTruncated: unique.length > maxSymbolsInLog,
                quotesOk: okCount,
                quotesFailed: failCount,
                quoteErrorsSample: failures.slice(0, 8).map((r) => ({ symbol: r.symbol, error: r.error })),
            },
        });
    }

    return out;
}

export type PortfolioQuoteRow = {
    symbol: string;
    currency: string;
    useTelAvivListing: boolean;
};

export type ResolvedQuote = { price: number; resolvedSymbol: string };

/** Per-row portfolio quote: success or human-readable error from providers. */
export type PortfolioQuoteResolution = ResolvedQuote | { error: string };

function fmtHttp(status: number | undefined, err: string): string {
    return status != null ? `${err} (HTTP ${status})` : err;
}

async function tryEodhdCandidatesForKey(
    tk: string,
    candidates: string[],
    mode: EodhdQuoteMode
): Promise<{ hit: ResolvedQuote | null; errors: string[] }> {
    const errors: string[] = [];

    const tryRt = async (sym: string): Promise<ResolvedQuote | null> => {
        const r = await fetchEodhdRealtimeQuoteResult(tk, sym);
        if (r.ok) return { price: r.price, resolvedSymbol: r.symbol };
        errors.push(`EODHD ${sym} [realtime]: ${fmtHttp(r.httpStatus, r.error)}`);
        return null;
    };

    const tryEod = async (sym: string): Promise<ResolvedQuote | null> => {
        const r = await fetchEodhdLatestEodQuoteResult(tk, sym);
        if (r.ok) return { price: r.price, resolvedSymbol: r.symbol };
        errors.push(`EODHD ${sym} [eod]: ${fmtHttp(r.httpStatus, r.error)}`);
        return null;
    };

    const runPrimaryThenFallback = async (
        primary: (sym: string) => Promise<ResolvedQuote | null>,
        secondary: (sym: string) => Promise<ResolvedQuote | null>
    ): Promise<ResolvedQuote | null> => {
        for (const sym of candidates) {
            const h = await primary(sym);
            if (h) return h;
            await sleep(80 + Math.floor(Math.random() * 60));
        }
        for (const sym of candidates) {
            const h = await secondary(sym);
            if (h) return h;
            await sleep(80 + Math.floor(Math.random() * 60));
        }
        return null;
    };

    let hit: ResolvedQuote | null = null;
    switch (mode) {
        case 'realtime':
            for (const sym of candidates) {
                hit = await tryRt(sym);
                if (hit) return { hit, errors };
                await sleep(80 + Math.floor(Math.random() * 60));
            }
            break;
        case 'eod':
            for (const sym of candidates) {
                hit = await tryEod(sym);
                if (hit) return { hit, errors };
                await sleep(80 + Math.floor(Math.random() * 60));
            }
            break;
        case 'realtime_then_eod':
            hit = await runPrimaryThenFallback(tryRt, tryEod);
            if (hit) return { hit, errors };
            break;
        case 'eod_then_realtime':
            hit = await runPrimaryThenFallback(tryEod, tryRt);
            if (hit) return { hit, errors };
            break;
        default:
            break;
    }
    return { hit: null, errors };
}

export type ResolveQuotesOptions = {
    /** From `investment_app_settings.eodhd_quote_mode` (default `realtime`). */
    eodhdQuoteMode?: string | null;
};

/**
 * Resolves last prices for stored portfolio symbols. With `eodhd_then_yahoo` + `EODHD_API_TOKEN`,
 * tries EODHD per `eodhdQuoteMode`, then Yahoo (TASE `TA.*` / `*.TA` candidates when ILS + enabled).
 * Map key = portfolio symbol (uppercase). Value is either a quote or `{ error }` with provider messages.
 */
export async function resolveQuotesForPortfolioRows(
    rows: PortfolioQuoteRow[],
    opts: ResolveQuotesOptions = {}
): Promise<Map<string, PortfolioQuoteResolution>> {
    const mode = parseEodhdQuoteMode(opts.eodhdQuoteMode);
    const keyToYahooCandidates = new Map<string, string[]>();
    const keyToEodCandidates = new Map<string, string[]>();
    for (const r of rows) {
        const key = r.symbol.trim().toUpperCase();
        keyToYahooCandidates.set(key, buildYahooQuoteCandidates(r.symbol, r.currency, r.useTelAvivListing));
        keyToEodCandidates.set(key, buildEodhdQuoteCandidates(r.symbol, r.currency, r.useTelAvivListing));
    }

    /** Successful quote only; EODHD errors are kept separately so Yahoo can still run. */
    const successByKey = new Map<string, ResolvedQuote>();
    const eodErrByKey = new Map<string, string>();
    const eodToken = getEodhdApiToken();
    const tryEod = Boolean(useEodhdPrimaryQuotes() && eodToken);

    if (tryEod && eodToken) {
        const tk = eodToken;
        for (const r of rows) {
            const key = r.symbol.trim().toUpperCase();
            if (successByKey.has(key)) continue;
            const cands = keyToEodCandidates.get(key) ?? [];
            const { hit, errors } = await tryEodhdCandidatesForKey(tk, cands, mode);
            if (hit != null) {
                successByKey.set(key, hit);
            } else if (errors.length) {
                eodErrByKey.set(key, errors.join('; '));
            }
        }
    }

    const missing = rows.filter((r) => !successByKey.has(r.symbol.trim().toUpperCase()));
    if (missing.length === 0) {
        const out = new Map<string, PortfolioQuoteResolution>();
        for (const r of rows) {
            const key = r.symbol.trim().toUpperCase();
            const s = successByKey.get(key);
            if (s) out.set(key, s);
            else out.set(key, { error: 'quote_unavailable' });
        }
        return out;
    }

    const allYahooCandidates = [...new Set(missing.flatMap((r) => keyToYahooCandidates.get(r.symbol.trim().toUpperCase()) ?? []))];
    const quoteResults = await fetchYahooQuotesForSymbols(allYahooCandidates);
    const priceByYahoo = new Map<string, number>();
    const symbolByYahoo = new Map<string, string>();
    const yahooErrByCand = new Map<string, string>();
    for (const q of quoteResults) {
        const u = q.symbol.toUpperCase();
        if (q.ok) {
            priceByYahoo.set(u, q.price);
            symbolByYahoo.set(u, q.symbol);
        } else {
            yahooErrByCand.set(u, q.error);
        }
    }
    for (const r of missing) {
        const key = r.symbol.trim().toUpperCase();
        if (successByKey.has(key)) continue;
        const yErrs: string[] = [];
        for (const c of keyToYahooCandidates.get(key) ?? []) {
            const u = c.toUpperCase();
            const p = priceByYahoo.get(u);
            if (p != null && p > 0) {
                successByKey.set(key, { price: p, resolvedSymbol: (symbolByYahoo.get(u) ?? c).toUpperCase() });
                break;
            }
            const ye = yahooErrByCand.get(u);
            if (ye) yErrs.push(`Yahoo ${c}: ${ye}`);
        }
    }

    const out = new Map<string, PortfolioQuoteResolution>();
    for (const r of rows) {
        const key = r.symbol.trim().toUpperCase();
        const s = successByKey.get(key);
        if (s) {
            out.set(key, s);
            continue;
        }
        const yErrs: string[] = [];
        for (const c of keyToYahooCandidates.get(key) ?? []) {
            const u = c.toUpperCase();
            const ye = yahooErrByCand.get(u);
            if (ye) yErrs.push(`Yahoo ${c}: ${ye}`);
        }
        const eodPart = eodErrByKey.get(key);
        const yPart = yErrs.length ? yErrs.join('; ') : 'Yahoo: no price for tried symbols';
        const msg = [eodPart, yPart].filter(Boolean).join(' | ');
        out.set(key, { error: msg || 'quote_unavailable' });
    }
    return out;
}

/**
 * Historical EOD close on `isoDate` to estimate share count from total cost (EODHD first when configured, else Yahoo chart).
 */
export async function guessShareQuantityFromCostOnDate(
    portfolioSymbol: string,
    currency: string,
    useTelAvivListing: boolean,
    costAbs: number,
    isoDate: string
): Promise<{ quantity: number; resolvedSymbol: string; close: number } | null> {
    if (!Number.isFinite(costAbs) || costAbs <= 0) return null;
    const eodToken = getEodhdApiToken();
    const tryEod = Boolean(useEodhdPrimaryQuotes() && eodToken);

    if (tryEod && eodToken) {
        const tk = eodToken;
        for (const sym of buildEodhdQuoteCandidates(portfolioSymbol, currency, useTelAvivListing)) {
            const close = await fetchEodhdEodCloseOnDate(tk, sym, isoDate);
            if (close != null && close > 0) {
                const rawQty = costAbs / close;
                if (!Number.isFinite(rawQty) || rawQty <= 0) continue;
                const qty = Math.round(rawQty * 1e6) / 1e6;
                if (qty > 0) {
                    return { quantity: qty, resolvedSymbol: sym.toUpperCase(), close };
                }
            }
            await sleep(120);
        }
    }

    for (const y of buildYahooQuoteCandidates(portfolioSymbol, currency, useTelAvivListing)) {
        const close = await fetchYahooCloseOnDate(y, isoDate);
        if (close != null && close > 0) {
            const rawQty = costAbs / close;
            if (!Number.isFinite(rawQty) || rawQty <= 0) continue;
            const qty = Math.round(rawQty * 1e6) / 1e6;
            if (qty > 0) {
                return { quantity: qty, resolvedSymbol: y.toUpperCase(), close };
            }
        }
        await sleep(250);
    }
    return null;
}
