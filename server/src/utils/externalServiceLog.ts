import axios from 'axios';
import { serverLogger } from './logger.js';

export type ExternalServiceId = 'yahoo' | 'telegram' | 'frankfurter' | 'eodhd';

export type ExternalHttpOutcome = 'ok' | 'error' | 'timeout';

export interface LogExternalOptions {
    service: ExternalServiceId;
    operation: string;
    /** Target hostname only (no scheme, no path). */
    host: string;
    method?: string;
    path?: string;
    outcome: ExternalHttpOutcome;
    durationMs?: number;
    httpStatus?: number;
    errorMessage?: string;
    extra?: Record<string, unknown>;
}

/**
 * Structured log line for outbound HTTP / third-party calls.
 * Grep for `[external]` or metadata `external:true` + `service`.
 */
export function logExternal(opts: LogExternalOptions): void {
    const { service, operation, host, method, path, outcome, durationMs, httpStatus, errorMessage, extra } = opts;

    const meta: Record<string, unknown> = {
        kind: 'http',
        external: true,
        service,
        operation,
        host,
        outcome,
    };
    if (method) meta.method = method;
    if (path) meta.path = path;
    if (durationMs != null) meta.durationMs = durationMs;
    if (httpStatus != null) meta.httpStatus = httpStatus;
    if (errorMessage) meta.errorMessage = String(errorMessage).slice(0, 400);
    if (extra && Object.keys(extra).length) Object.assign(meta, extra);

    const dur = durationMs != null ? ` ${durationMs}ms` : '';
    const msg = `[external] ${service} ${operation} ${outcome}${dur}`;

    if (outcome === 'ok') {
        serverLogger.info(msg, meta);
    } else {
        serverLogger.warn(msg, meta);
    }
}

export const TELEGRAM_API_HOST = 'api.telegram.org';

/** Primary Yahoo Finance HTTP host used by chart API and typical quote traffic. */
export const YAHOO_QUERY_HOST = 'query1.finance.yahoo.com';

/** Host for Yahoo symbol search (`/v1/finance/search`). */
export const YAHOO_QUERY2_HOST = 'query2.finance.yahoo.com';

/** EODHD REST API host (`/api/real-time`, `/api/eod`, `/api/search`, …). */
export const EODHD_API_HOST = 'eodhd.com';

export function externalOutcomeFromAxiosError(error: unknown): {
    outcome: ExternalHttpOutcome;
    httpStatus?: number;
    errorMessage?: string;
} {
    if (axios.isAxiosError(error)) {
        const code = error.code;
        if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
            return {
                outcome: 'timeout',
                httpStatus: error.response?.status,
                errorMessage: error.message,
            };
        }
        const data = error.response?.data as { description?: string; message?: string } | undefined;
        const msg = data?.description || data?.message || error.message;
        return { outcome: 'error', httpStatus: error.response?.status, errorMessage: msg };
    }
    return {
        outcome: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
    };
}
