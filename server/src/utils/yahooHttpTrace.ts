import { serverLogger } from './logger.js';
import { maskSensitiveData } from './masking.js';

/**
 * When enabled (default), logs each Yahoo HTTP exchange with `outgoing` / `incoming`
 * shaped like Express request/response logs. Set `YAHOO_HTTP_TRACE=0` to disable.
 */
export function isYahooHttpTraceEnabled(): boolean {
    const v = process.env.YAHOO_HTTP_TRACE;
    if (v === '0' || v === 'false' || v === 'off') return false;
    return true;
}

function maxTraceBodyChars(): number {
    const raw = process.env.YAHOO_HTTP_TRACE_BODY_MAX;
    const n = raw != null && raw !== '' ? parseInt(raw, 10) : 12_000;
    if (!Number.isFinite(n) || n < 0) return 12_000;
    return Math.min(n, 500_000);
}

function truncateChars(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
}

/** Redact known-sensitive query keys and cap length. */
export function redactYahooUrlForLog(url: string): string {
    try {
        const u = new URL(url);
        for (const k of ['crumb', 'token', 'access_token', 'refresh_token', 'code']) {
            if (u.searchParams.has(k)) u.searchParams.set(k, '[REDACTED]');
        }
        const s = u.toString();
        return s.length > 4000 ? `${s.slice(0, 4000)}…` : s;
    } catch {
        return truncateChars(url, 4000);
    }
}

function normalizeOutgoingHeaders(h: HeadersInit | undefined): Record<string, string> | undefined {
    if (h == null) return undefined;
    const out: Record<string, string> = {};
    try {
        const hdrs = new Headers(h);
        hdrs.forEach((value, key) => {
            const lk = key.toLowerCase();
            if (lk === 'authorization' || lk === 'cookie' || lk === 'set-cookie') {
                out[key] = '[REDACTED]';
            } else {
                out[key] = value.length > 500 ? `${value.slice(0, 500)}…` : value;
            }
        });
    } catch {
        return undefined;
    }
    return Object.keys(out).length ? out : undefined;
}

function responseHeadersToRecord(h: { forEach: (fn: (v: string, k: string) => void) => void }): Record<string, string> {
    const out: Record<string, string> = {};
    h.forEach((value, key) => {
        const lk = key.toLowerCase();
        if (lk === 'set-cookie' || lk === 'authorization') {
            out[key] = '[REDACTED]';
        } else {
            out[key] = value.length > 500 ? `${value.slice(0, 500)}…` : value;
        }
    });
    return out;
}

function bodyFromText(text: string): unknown {
    const max = maxTraceBodyChars();
    const t = truncateChars(text, max);
    try {
        return JSON.parse(t) as unknown;
    } catch {
        return t;
    }
}

function logYahooTraceLine(
    operation: string,
    outcome: 'ok' | 'error' | 'http_error',
    durationMs: number,
    payload: Record<string, unknown>
): void {
    const masked = maskSensitiveData(payload) as Record<string, unknown>;
    const msg = `[external] yahoo ${operation} ${outcome} ${durationMs}ms`;
    if (outcome === 'ok') {
        serverLogger.info(msg, masked);
    } else {
        serverLogger.warn(msg, masked);
    }
}

/**
 * Wraps `fetch` for `new YahooFinance({ fetch })` so every yahoo-finance2 request
 * (quotes, crumb, cookies, etc.) emits one trace line with outgoing + incoming.
 */
export function createYahooLoggingFetch(
    baseFetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis) as typeof fetch
): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (!isYahooHttpTraceEnabled()) {
            return baseFetch(input, init);
        }

        const urlStr =
            typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.href
                  : input instanceof Request
                    ? input.url
                    : String(input);
        const method = (
            init?.method ||
            (input instanceof Request ? input.method : undefined) ||
            'GET'
        ).toUpperCase();
        const outgoingHeaders = normalizeOutgoingHeaders(init?.headers);

        const t0 = Date.now();
        try {
            const res = await baseFetch(input, init);
            const durationMs = Date.now() - t0;
            let data: unknown;
            try {
                const text = await res.clone().text();
                data = bodyFromText(text);
            } catch {
                data = '<response body unreadable>';
            }

            const outcome = res.ok ? 'ok' : 'http_error';
            logYahooTraceLine(
                'yahoo_finance2_fetch',
                outcome,
                durationMs,
                {
                    kind: 'http',
                    external: true,
                    service: 'yahoo',
                    operation: 'yahoo_finance2_fetch',
                    outgoing: {
                        method,
                        url: redactYahooUrlForLog(urlStr),
                        headers: outgoingHeaders,
                    },
                    incoming: {
                        status: res.status,
                        statusText: res.statusText,
                        headers: responseHeadersToRecord(res.headers),
                        data,
                    },
                }
            );
            return res;
        } catch (e: unknown) {
            const durationMs = Date.now() - t0;
            logYahooTraceLine('yahoo_finance2_fetch', 'error', durationMs, {
                kind: 'http',
                external: true,
                service: 'yahoo',
                operation: 'yahoo_finance2_fetch',
                outgoing: {
                    method,
                    url: redactYahooUrlForLog(urlStr),
                    headers: outgoingHeaders,
                },
                incoming: null,
                errorMessage: e instanceof Error ? e.message : String(e),
            });
            throw e;
        }
    };
}

function flattenAxiosResponseHeaders(
    h: Record<string, unknown> | undefined
): Record<string, string> | undefined {
    if (!h || typeof h !== 'object') return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
        if (v == null) continue;
        const s = Array.isArray(v) ? v.join(',') : String(v);
        const lk = k.toLowerCase();
        out[k] =
            lk === 'set-cookie' || lk === 'authorization' ? '[REDACTED]' : s.length > 500 ? `${s.slice(0, 500)}…` : s;
    }
    return Object.keys(out).length ? out : undefined;
}

/** Trace line for direct axios Yahoo calls (e.g. chart v8). */
export function logYahooAxiosTrace(params: {
    operation: string;
    method: string;
    url: string;
    requestHeaders?: Record<string, string>;
    durationMs: number;
    /** HTTP response (any status), when axios returned a response. */
    incoming?: {
        status: number;
        statusText?: string;
        headers?: Record<string, string>;
        data?: unknown;
    };
    /** No HTTP response (timeout, DNS, etc.). */
    transportError?: string;
}): void {
    if (!isYahooHttpTraceEnabled()) return;

    const outgoing: Record<string, unknown> = {
        method: params.method,
        url: redactYahooUrlForLog(params.url),
    };
    if (params.requestHeaders && Object.keys(params.requestHeaders).length) {
        outgoing.headers = params.requestHeaders;
    }

    let outcome: 'ok' | 'error' | 'http_error';
    let incoming: unknown;
    if (params.transportError) {
        outcome = 'error';
        incoming = { error: params.transportError };
    } else if (params.incoming) {
        const st = params.incoming.status;
        outcome = st >= 200 && st < 300 ? 'ok' : 'http_error';
        incoming = {
            status: st,
            statusText: params.incoming.statusText,
            headers: params.incoming.headers,
            data: params.incoming.data,
        };
    } else {
        outcome = 'error';
        incoming = { error: 'no_response_details' };
    }

    logYahooTraceLine(params.operation, outcome, params.durationMs, {
        kind: 'http',
        external: true,
        service: 'yahoo',
        operation: params.operation,
        outgoing,
        incoming,
    });
}

/** Axios-only: normalize `response.headers` for {@link logYahooAxiosTrace}. */
export function axiosResponseHeadersForTrace(headers: unknown): Record<string, string> | undefined {
    if (!headers || typeof headers !== 'object') return undefined;
    const h = headers as { forEach?: (a: (v: string, k: string) => void) => void; toJSON?: () => Record<string, unknown> };
    if (typeof h.forEach === 'function') {
        const out: Record<string, string> = {};
        h.forEach((value, key) => {
            const lk = key.toLowerCase();
            out[key] =
                lk === 'set-cookie' || lk === 'authorization'
                    ? '[REDACTED]'
                    : value.length > 500
                      ? `${value.slice(0, 500)}…`
                      : value;
        });
        return Object.keys(out).length ? out : undefined;
    }
    if (typeof h.toJSON === 'function') {
        return flattenAxiosResponseHeaders(h.toJSON());
    }
    return flattenAxiosResponseHeaders(headers as Record<string, unknown>);
}
