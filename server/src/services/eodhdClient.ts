import { logExternal, externalOutcomeFromAxiosError, EODHD_API_HOST } from '../utils/externalServiceLog.js';
import axios from 'axios';

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
            const r = row as { date?: string; close?: number };
            const c = r.close;
            const dt = r.date;
            if (typeof c === 'number' && Number.isFinite(c) && c > 0 && typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dt)) {
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
            headers: { Accept: 'application/json' },
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
            const r = row as { date?: string; close?: number };
            const c = r.close;
            const dt = r.date;
            if (typeof c === 'number' && Number.isFinite(c) && c > 0 && typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dt)) {
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
        const row = rows[0] as { date?: string; close?: number } | undefined;
        const close = row && typeof row.close === 'number' && Number.isFinite(row.close) && row.close > 0 ? row.close : null;
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
