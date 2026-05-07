import { logExternal, externalOutcomeFromAxiosError, EODHD_API_HOST } from '../utils/externalServiceLog.js';
import axios from 'axios';

/** Prefer `adjusted_close` when present (corporate actions); else raw `close` — aligns with EODHD JSON and typical dashboards. */
function eodDailyBarPrice(row: { close?: number; adjusted_close?: number } | undefined): number | null {
    if (!row) return null;
    const adj = row.adjusted_close;
    if (typeof adj === 'number' && Number.isFinite(adj) && adj > 0) return adj;
    const c = row.close;
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
    return null;
}

export type EodhdRealtimeOk = { symbol: string; price: number; quoteCurrency?: string };

export type EodhdQuoteAttemptOk = { ok: true; symbol: string; price: number };
export type EodhdQuoteAttemptErr = { ok: false; error: string; httpStatus?: number };
export type EodhdQuoteAttempt = EodhdQuoteAttemptOk | EodhdQuoteAttemptErr;

/**
 * Delayed / live REST quote (`close` field). Returns structured error for UI diagnostics.
 */
export async function fetchEodhdRealtimeQuoteResult(apiToken: string, symbol: string): Promise<EodhdQuoteAttempt> {
    const sym = symbol.trim();
    if (!sym) return { ok: false, error: 'empty_symbol' };
    const path = `/api/real-time/${encodeURIComponent(sym)}`;
    const url = `https://${EODHD_API_HOST}${path}?api_token=${encodeURIComponent(apiToken)}&fmt=json`;
    const t0 = Date.now();
    try {
        const res = await axios.get(url, {
            timeout: 15000,
            headers: { Accept: 'application/json' },
            validateStatus: (st) => st >= 200 && st < 500,
        });
        const durationMs = Date.now() - t0;
        const { data, status, statusText } = res;
        if (typeof data === 'string' && data.includes('Forbidden')) {
            const err = data.slice(0, 200);
            logExternal({
                service: 'eodhd',
                operation: 'real_time',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: err,
                extra: { symbol: sym },
            });
            return { ok: false, error: err || 'forbidden', httpStatus: status };
        }
        if (status < 200 || status >= 300) {
            logExternal({
                service: 'eodhd',
                operation: 'real_time',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: statusText,
                extra: { symbol: sym },
            });
            return { ok: false, error: statusText || `http_${status}`, httpStatus: status };
        }
        const close = (data as { close?: number; code?: string })?.close;
        const code = typeof (data as { code?: string }).code === 'string' ? (data as { code: string }).code : sym;
        const price = typeof close === 'number' && Number.isFinite(close) && close > 0 ? close : null;
        if (price == null) {
            logExternal({
                service: 'eodhd',
                operation: 'real_time',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: 'missing_or_invalid_close',
                extra: { symbol: sym },
            });
            return { ok: false, error: 'missing_or_invalid_close', httpStatus: status };
        }
        logExternal({
            service: 'eodhd',
            operation: 'real_time',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome: 'ok',
            durationMs,
            httpStatus: status,
            extra: { symbol: sym, code },
        });
        return { ok: true, symbol: code.toUpperCase(), price };
    } catch (e) {
        const durationMs = Date.now() - t0;
        const { outcome, httpStatus, errorMessage } = externalOutcomeFromAxiosError(e);
        logExternal({
            service: 'eodhd',
            operation: 'real_time',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome,
            durationMs,
            httpStatus,
            errorMessage,
            extra: { symbol: sym },
        });
        return { ok: false, error: errorMessage || 'network_error', httpStatus };
    }
}

/** EODHD recommends ~15–20 tickers per live request; each symbol still counts as one API call on their plan. */
export const EODHD_REALTIME_BATCH_MAX_TICKERS = 18;

function sleepMs(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function parseRealtimeJsonRows(data: unknown): Record<string, unknown>[] {
    if (Array.isArray(data)) {
        return data.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x));
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return [data as Record<string, unknown>];
    }
    return [];
}

/** One row from live (delayed) API: `/api/real-time/{first}?s=b,c&fmt=json` */
function parseRealtimeQuoteRow(raw: Record<string, unknown>): EodhdQuoteAttemptOk | null {
    const close = raw.close as unknown;
    const codeRaw =
        typeof raw.code === 'string'
            ? raw.code
            : typeof (raw as { Code?: string }).Code === 'string'
              ? (raw as { Code: string }).Code
              : null;
    const code = (codeRaw ?? '').trim();
    const price =
        typeof close === 'number' && Number.isFinite(close) && close > 0
            ? close
            : typeof close === 'string' && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(close.trim())
              ? Number(close.trim())
              : NaN;
    if (!code || !(price > 0) || !Number.isFinite(price)) return null;
    return { ok: true, symbol: code.toUpperCase(), price };
}

async function fetchEodhdRealtimeQuotesBatchChunk(
    apiToken: string,
    chunk: readonly string[],
    chunkIndex: number
): Promise<Map<string, EodhdQuoteAttemptOk>> {
    const out = new Map<string, EodhdQuoteAttemptOk>();
    const cleaned = chunk.map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!cleaned.length) return out;
    const primary = cleaned[0]!;
    const rest = cleaned.slice(1);
    const sParam = rest.length ? `&s=${encodeURIComponent(rest.join(','))}` : '';
    const pathBase = `/api/real-time/${encodeURIComponent(primary)}`;
    const url = `https://${EODHD_API_HOST}${pathBase}?api_token=${encodeURIComponent(apiToken)}&fmt=json${sParam}`;
    const t0 = Date.now();
    try {
        const res = await axios.get(url, {
            timeout: 20000,
            headers: {
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
            },
            validateStatus: (st) => st >= 200 && st < 500,
        });
        const durationMs = Date.now() - t0;
        const { data, status, statusText } = res;
        if (typeof data === 'string' && data.includes('Forbidden')) {
            const err = data.slice(0, 200);
            logExternal({
                service: 'eodhd',
                operation: 'real_time_batch',
                host: EODHD_API_HOST,
                method: 'GET',
                path: pathBase,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: err,
                extra: { chunkIndex, tickerCount: cleaned.length },
            });
            return out;
        }
        if (status < 200 || status >= 300) {
            logExternal({
                service: 'eodhd',
                operation: 'real_time_batch',
                host: EODHD_API_HOST,
                method: 'GET',
                path: pathBase,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: statusText,
                extra: { chunkIndex, tickerCount: cleaned.length },
            });
            return out;
        }
        const rows = parseRealtimeJsonRows(data);
        for (const row of rows) {
            const ok = parseRealtimeQuoteRow(row);
            if (!ok) continue;
            out.set(ok.symbol.toUpperCase(), ok);
        }
        logExternal({
            service: 'eodhd',
            operation: 'real_time_batch',
            host: EODHD_API_HOST,
            method: 'GET',
            path: pathBase,
            outcome: out.size === 0 && rows.length > 0 ? 'error' : 'ok',
            durationMs,
            httpStatus: status,
            errorMessage: out.size === 0 && rows.length > 0 ? 'no_usable_live_rows' : undefined,
            extra: { chunkIndex, requested: cleaned.length, parsedTickers: out.size },
        });
        return out;
    } catch (e) {
        const durationMs = Date.now() - t0;
        const { outcome, httpStatus, errorMessage } = externalOutcomeFromAxiosError(e);
        logExternal({
            service: 'eodhd',
            operation: 'real_time_batch',
            host: EODHD_API_HOST,
            method: 'GET',
            path: pathBase,
            outcome,
            durationMs,
            httpStatus,
            errorMessage,
            extra: { chunkIndex, tickerCount: cleaned.length },
        });
        return out;
    }
}

/** Live (delayed) quotes: one HTTP request per chunk, `GET /api/real-time/{first}?s=second,third,...` */
export async function fetchEodhdRealtimeQuotesBatchMerged(
    apiToken: string,
    symbolsDistinct: readonly string[]
): Promise<Map<string, EodhdQuoteAttemptOk>> {
    const merged = new Map<string, EodhdQuoteAttemptOk>();
    const uniq = [...new Set(symbolsDistinct.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    for (let i = 0, chunkIndex = 0; i < uniq.length; i += EODHD_REALTIME_BATCH_MAX_TICKERS, chunkIndex++) {
        const chunk = uniq.slice(i, i + EODHD_REALTIME_BATCH_MAX_TICKERS);
        const part = await fetchEodhdRealtimeQuotesBatchChunk(apiToken, chunk, chunkIndex);
        for (const [k, v] of part) merged.set(k, v);
        if (i + EODHD_REALTIME_BATCH_MAX_TICKERS < uniq.length) {
            await sleepMs(40 + Math.floor(Math.random() * 40));
        }
    }
    return merged;
}

/**
 * Delayed / live REST quote (`close` field). One API call per symbol.
 */
export async function fetchEodhdRealtimeQuote(apiToken: string, symbol: string): Promise<EodhdRealtimeOk | null> {
    const r = await fetchEodhdRealtimeQuoteResult(apiToken, symbol);
    return r.ok ? { symbol: r.symbol, price: r.price, quoteCurrency: undefined } : null;
}

function isoDateUTC(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Latest daily close from `/api/eod` over a short look-back window (weekends / holidays safe).
 */
export async function fetchEodhdLatestEodQuoteResult(apiToken: string, symbol: string): Promise<EodhdQuoteAttempt> {
    const sym = symbol.trim();
    if (!sym) return { ok: false, error: 'empty_symbol' };
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 40);
    const from = isoDateUTC(start);
    const to = isoDateUTC(end);
    const path = `/api/eod/${encodeURIComponent(sym)}`;
    const url = `https://${EODHD_API_HOST}${path}?from=${from}&to=${to}&period=d&api_token=${encodeURIComponent(apiToken)}&fmt=json`;
    const t0 = Date.now();
    try {
        const res = await axios.get(url, {
            timeout: 15000,
            headers: { Accept: 'application/json' },
            validateStatus: (st) => st >= 200 && st < 500,
        });
        const durationMs = Date.now() - t0;
        const { data, status, statusText } = res;
        if (typeof data === 'string' && data.includes('Forbidden')) {
            const err = data.slice(0, 200);
            logExternal({
                service: 'eodhd',
                operation: 'eod_latest',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: err,
                extra: { symbol: sym },
            });
            return { ok: false, error: err || 'forbidden', httpStatus: status };
        }
        if (status < 200 || status >= 300) {
            logExternal({
                service: 'eodhd',
                operation: 'eod_latest',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: statusText,
                extra: { symbol: sym },
            });
            return { ok: false, error: statusText || `http_${status}`, httpStatus: status };
        }
        const rows = Array.isArray(data) ? data : [];
        let best: { date: string; close: number } | null = null;
        for (const row of rows) {
            const r = row as { date?: string; close?: number; adjusted_close?: number };
            const c = eodDailyBarPrice(r);
            const dt = r.date;
            if (c != null && typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dt)) {
                if (!best || dt > best.date) best = { date: dt, close: c };
            }
        }
        if (best == null) {
            logExternal({
                service: 'eodhd',
                operation: 'eod_latest',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: 'no_eod_bars_in_range',
                extra: { symbol: sym },
            });
            return { ok: false, error: 'no_eod_bars_in_range', httpStatus: status };
        }
        logExternal({
            service: 'eodhd',
            operation: 'eod_latest',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome: 'ok',
            durationMs,
            httpStatus: status,
            extra: { symbol: sym, asOf: best.date },
        });
        return { ok: true, symbol: sym.toUpperCase(), price: best.close };
    } catch (e) {
        const durationMs = Date.now() - t0;
        const { outcome, httpStatus, errorMessage } = externalOutcomeFromAxiosError(e);
        logExternal({
            service: 'eodhd',
            operation: 'eod_latest',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome,
            durationMs,
            httpStatus,
            errorMessage,
            extra: { symbol: sym },
        });
        return { ok: false, error: errorMessage || 'network_error', httpStatus };
    }
}

export type EodhdEodBar = { date: string; close: number };

export type EodhdEodSeriesAttemptOk = { ok: true; symbol: string; bars: EodhdEodBar[] };
export type EodhdEodSeriesAttemptErr = { ok: false; error: string; httpStatus?: number };
export type EodhdEodSeriesAttempt = EodhdEodSeriesAttemptOk | EodhdEodSeriesAttemptErr;

/**
 * Daily OHLC series from `/api/eod` between `fromIso` and `toIso` (inclusive), sorted ascending by date.
 */
export async function fetchEodhdEodSeriesResult(
    apiToken: string,
    symbol: string,
    fromIso: string,
    toIso: string
): Promise<EodhdEodSeriesAttempt> {
    const sym = symbol.trim();
    if (!sym) return { ok: false, error: 'empty_symbol' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso)) {
        return { ok: false, error: 'invalid_date_range' };
    }
    if (fromIso > toIso) return { ok: false, error: 'invalid_date_range' };
    const path = `/api/eod/${encodeURIComponent(sym)}`;
    const url = `https://${EODHD_API_HOST}${path}?from=${fromIso}&to=${toIso}&period=d&api_token=${encodeURIComponent(apiToken)}&fmt=json`;
    const t0 = Date.now();
    try {
        const res = await axios.get(url, {
            timeout: 30000,
            headers: {
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
            },
            validateStatus: (st) => st >= 200 && st < 500,
        });
        const durationMs = Date.now() - t0;
        const { data, status, statusText } = res;
        if (typeof data === 'string' && data.includes('Forbidden')) {
            const err = data.slice(0, 200);
            logExternal({
                service: 'eodhd',
                operation: 'eod_series',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: err,
                extra: { symbol: sym, fromIso, toIso },
            });
            return { ok: false, error: err || 'forbidden', httpStatus: status };
        }
        if (status < 200 || status >= 300) {
            logExternal({
                service: 'eodhd',
                operation: 'eod_series',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: statusText,
                extra: { symbol: sym, fromIso, toIso },
            });
            return { ok: false, error: statusText || `http_${status}`, httpStatus: status };
        }
        const rawRows = Array.isArray(data) ? data : [];
        const bars: EodhdEodBar[] = [];
        for (const row of rawRows) {
            const r = row as { date?: string; close?: number; adjusted_close?: number };
            const c = eodDailyBarPrice(r);
            const dt = r.date;
            if (c != null && typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dt)) {
                bars.push({ date: dt, close: c });
            }
        }
        bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        logExternal({
            service: 'eodhd',
            operation: 'eod_series',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome: 'ok',
            durationMs,
            httpStatus: status,
            extra: { symbol: sym, fromIso, toIso, bars: bars.length },
        });
        return { ok: true, symbol: sym.toUpperCase(), bars };
    } catch (e) {
        const durationMs = Date.now() - t0;
        const { outcome, httpStatus, errorMessage } = externalOutcomeFromAxiosError(e);
        logExternal({
            service: 'eodhd',
            operation: 'eod_series',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome,
            durationMs,
            httpStatus,
            errorMessage,
            extra: { symbol: sym, fromIso, toIso },
        });
        return { ok: false, error: errorMessage || 'network_error', httpStatus };
    }
}

export async function fetchEodhdEodCloseOnDate(
    apiToken: string,
    symbol: string,
    isoDate: string
): Promise<number | null> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
    const sym = symbol.trim();
    if (!sym) return null;
    const path = `/api/eod/${encodeURIComponent(sym)}`;
    const url = `https://${EODHD_API_HOST}${path}?from=${isoDate}&to=${isoDate}&period=d&api_token=${encodeURIComponent(apiToken)}&fmt=json`;
    const t0 = Date.now();
    try {
        const res = await axios.get(url, {
            timeout: 15000,
            headers: { Accept: 'application/json' },
            validateStatus: (st) => st >= 200 && st < 500,
        });
        const durationMs = Date.now() - t0;
        const { data, status, statusText } = res;
        if (typeof data === 'string' && data.includes('Forbidden')) {
            logExternal({
                service: 'eodhd',
                operation: 'eod_close',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: data.slice(0, 200),
                extra: { symbol: sym, isoDate },
            });
            return null;
        }
        if (status < 200 || status >= 300) {
            logExternal({
                service: 'eodhd',
                operation: 'eod_close',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: statusText,
                extra: { symbol: sym, isoDate },
            });
            return null;
        }
        const rows = Array.isArray(data) ? data : [];
        const row = rows[0] as { date?: string; close?: number; adjusted_close?: number } | undefined;
        const close = eodDailyBarPrice(row);
        if (close == null) {
            logExternal({
                service: 'eodhd',
                operation: 'eod_close',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: 'no_bar_for_date',
                extra: { symbol: sym, isoDate },
            });
            return null;
        }
        logExternal({
            service: 'eodhd',
            operation: 'eod_close',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome: 'ok',
            durationMs,
            httpStatus: status,
            extra: { symbol: sym, isoDate },
        });
        return close;
    } catch (e) {
        const durationMs = Date.now() - t0;
        const { outcome, httpStatus, errorMessage } = externalOutcomeFromAxiosError(e);
        logExternal({
            service: 'eodhd',
            operation: 'eod_close',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome,
            durationMs,
            httpStatus,
            errorMessage,
            extra: { symbol: sym, isoDate },
        });
        return null;
    }
}

export type EodhdSymbolSearchHit = {
    symbol: string;
    name: string;
    exchange?: string;
    quoteType?: string;
};

export async function searchEodhdSymbols(apiToken: string, query: string): Promise<EodhdSymbolSearchHit[]> {
    const q = query.trim();
    if (q.length < 1) return [];
    const path = `/api/search/${encodeURIComponent(q)}`;
    const url = `https://${EODHD_API_HOST}${path}?api_token=${encodeURIComponent(apiToken)}&fmt=json&limit=12`;
    const t0 = Date.now();
    try {
        const res = await axios.get(url, {
            timeout: 12000,
            headers: { Accept: 'application/json' },
            validateStatus: (st) => st >= 200 && st < 500,
        });
        const durationMs = Date.now() - t0;
        const { data, status, statusText } = res;
        if (typeof data === 'string') {
            logExternal({
                service: 'eodhd',
                operation: 'symbol_search',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: data.slice(0, 200),
                extra: { queryLen: q.length },
            });
            return [];
        }
        if (status < 200 || status >= 300) {
            logExternal({
                service: 'eodhd',
                operation: 'symbol_search',
                host: EODHD_API_HOST,
                method: 'GET',
                path,
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: statusText,
                extra: { queryLen: q.length },
            });
            return [];
        }
        const raw = Array.isArray(data) ? data : data != null ? [data] : [];
        const out: EodhdSymbolSearchHit[] = [];
        for (const row of raw) {
            const r = row as { Code?: string; Exchange?: string; Name?: string; Type?: string };
            const code = typeof r.Code === 'string' ? r.Code.trim() : '';
            const ex = typeof r.Exchange === 'string' ? r.Exchange.trim() : '';
            if (!code || !ex) continue;
            const symbol = `${code}.${ex}`.toUpperCase();
            const name = (typeof r.Name === 'string' && r.Name.trim()) || symbol;
            out.push({
                symbol,
                name,
                exchange: ex,
                quoteType: typeof r.Type === 'string' ? r.Type : undefined,
            });
        }
        logExternal({
            service: 'eodhd',
            operation: 'symbol_search',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome: 'ok',
            durationMs,
            httpStatus: status,
            extra: { queryLen: q.length, hits: out.length },
        });
        return out;
    } catch (e) {
        const durationMs = Date.now() - t0;
        const { outcome, httpStatus, errorMessage } = externalOutcomeFromAxiosError(e);
        logExternal({
            service: 'eodhd',
            operation: 'symbol_search',
            host: EODHD_API_HOST,
            method: 'GET',
            path,
            outcome,
            durationMs,
            httpStatus,
            errorMessage,
            extra: { queryLen: q.length },
        });
        return [];
    }
}
