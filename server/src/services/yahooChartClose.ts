import axios from 'axios';
import { serviceLogger as logger } from '../utils/logger.js';
import { externalOutcomeFromAxiosError, logExternal, YAHOO_QUERY_HOST } from '../utils/externalServiceLog.js';
import { axiosResponseHeadersForTrace, logYahooAxiosTrace } from '../utils/yahooHttpTrace.js';

/**
 * Yahoo chart v8 API — used for historical closes when the bundled yahoo-finance2 build
 * only ships quote/autoc.
 */
export async function fetchYahooCloseOnDate(yahooSymbol: string, isoDate: string): Promise<number | null> {
    const parts = isoDate.split('-').map((x) => parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const [y, mo, d] = parts;
    const tTarget = Date.UTC(y, mo - 1, d, 12, 0, 0) / 1000;
    const period1 = Math.floor(tTarget - 21 * 86400);
    const period2 = Math.floor(tTarget + 7 * 86400);
    const enc = encodeURIComponent(yahooSymbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?period1=${period1}&period2=${period2}&interval=1d`;

    const requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (compatible; MabatKalkali/1.0)',
        Accept: 'application/json',
    };
    const t0 = Date.now();
    try {
        const res = await axios.get(url, {
            timeout: 15000,
            headers: requestHeaders,
            validateStatus: (s) => s >= 200 && s < 500,
        });
        const { data, status, statusText, headers } = res;
        const durationMs = Date.now() - t0;
        logYahooAxiosTrace({
            operation: 'chart_close',
            method: 'GET',
            url,
            requestHeaders,
            durationMs,
            incoming: {
                status,
                statusText,
                headers: axiosResponseHeadersForTrace(headers),
                data,
            },
        });
        if (data?.chart?.error) {
            logger.debug('Yahoo chart error', { symbol: yahooSymbol, err: data.chart.error });
            logExternal({
                service: 'yahoo',
                operation: 'chart_close',
                host: YAHOO_QUERY_HOST,
                method: 'GET',
                path: '/v8/finance/chart',
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: typeof data.chart.error === 'string' ? data.chart.error : JSON.stringify(data.chart.error).slice(0, 200),
                extra: { yahooSymbol, chartError: true },
            });
            return null;
        }
        const result = data?.chart?.result?.[0];
        if (!result?.timestamp?.length) {
            logExternal({
                service: 'yahoo',
                operation: 'chart_close',
                host: YAHOO_QUERY_HOST,
                method: 'GET',
                path: '/v8/finance/chart',
                outcome: 'ok',
                durationMs,
                httpStatus: status,
                extra: { yahooSymbol, closeResolved: false },
            });
            return null;
        }
        const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
        const ts: number[] = result.timestamp;
        let bestClose: number | null = null;
        let bestTs = -Infinity;
        for (let i = 0; i < ts.length; i++) {
            const c = closes[i];
            if (c == null || !Number.isFinite(c) || c <= 0) continue;
            const t = ts[i];
            if (t <= tTarget + 86400 && t >= bestTs) {
                bestTs = t;
                bestClose = c;
            }
        }
        logExternal({
            service: 'yahoo',
            operation: 'chart_close',
            host: YAHOO_QUERY_HOST,
            method: 'GET',
            path: '/v8/finance/chart',
            outcome: 'ok',
            durationMs,
            httpStatus: status,
            extra: { yahooSymbol, closeResolved: bestClose != null },
        });
        return bestClose;
    } catch (e) {
        const durationMs = Date.now() - t0;
        logger.debug('Yahoo chart request failed', {
            symbol: yahooSymbol,
            message: e instanceof Error ? e.message : String(e),
        });
        if (axios.isAxiosError(e) && e.response) {
            logYahooAxiosTrace({
                operation: 'chart_close',
                method: 'GET',
                url,
                requestHeaders,
                durationMs,
                incoming: {
                    status: e.response.status,
                    statusText: e.response.statusText,
                    headers: axiosResponseHeadersForTrace(e.response.headers),
                    data: e.response.data,
                },
            });
        } else {
            logYahooAxiosTrace({
                operation: 'chart_close',
                method: 'GET',
                url,
                requestHeaders,
                durationMs,
                transportError: e instanceof Error ? e.message : String(e),
            });
        }
        const { outcome, httpStatus, errorMessage } = externalOutcomeFromAxiosError(e);
        logExternal({
            service: 'yahoo',
            operation: 'chart_close',
            host: YAHOO_QUERY_HOST,
            method: 'GET',
            path: '/v8/finance/chart',
            outcome,
            durationMs,
            httpStatus,
            errorMessage,
            extra: { yahooSymbol },
        });
        return null;
    }
}
