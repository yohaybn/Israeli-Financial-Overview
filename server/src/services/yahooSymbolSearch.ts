import axios from 'axios';
import { serviceLogger as logger } from '../utils/logger.js';
import { externalOutcomeFromAxiosError, logExternal, YAHOO_QUERY2_HOST } from '../utils/externalServiceLog.js';
import { axiosResponseHeadersForTrace, logYahooAxiosTrace } from '../utils/yahooHttpTrace.js';

export type YahooSymbolSearchHit = {
    symbol: string;
    name: string;
    exchange?: string;
    quoteType?: string;
};

type YahooSearchQuote = {
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
    quoteType?: string;
};

/**
 * Yahoo Finance v1 search (query2). The bundled `yahoo-finance2@2.x` only ships `quote` / broken `autoc`.
 */
export async function searchYahooFinanceSymbols(query: string): Promise<YahooSymbolSearchHit[]> {
    const q = query.trim();
    if (q.length < 1) return [];

    const params = new URLSearchParams({
        q,
        quotesCount: '15',
        newsCount: '0',
        listsCount: '0',
    });
    const url = `https://${YAHOO_QUERY2_HOST}/v1/finance/search?${params.toString()}`;

    const requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (compatible; MabatKalkali/1.0)',
        Accept: 'application/json',
    };
    const t0 = Date.now();
    try {
        const res = await axios.get(url, {
            timeout: 12000,
            headers: requestHeaders,
            validateStatus: (s) => s >= 200 && s < 500,
        });
        const { data, status, statusText, headers } = res;
        const durationMs = Date.now() - t0;
        logYahooAxiosTrace({
            operation: 'symbol_search',
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

        if (status < 200 || status >= 300) {
            logExternal({
                service: 'yahoo',
                operation: 'symbol_search',
                host: YAHOO_QUERY2_HOST,
                method: 'GET',
                path: '/v1/finance/search',
                outcome: 'error',
                durationMs,
                httpStatus: status,
                errorMessage: statusText,
                extra: { queryLen: q.length },
            });
            return [];
        }

        const quotes = Array.isArray(data?.quotes) ? (data.quotes as YahooSearchQuote[]) : [];
        const out: YahooSymbolSearchHit[] = [];
        for (const row of quotes) {
            const sym = typeof row?.symbol === 'string' ? row.symbol.trim() : '';
            if (!sym) continue;
            const name =
                (typeof row.longname === 'string' && row.longname.trim()) ||
                (typeof row.shortname === 'string' && row.shortname.trim()) ||
                sym;
            out.push({
                symbol: sym,
                name,
                exchange: typeof row.exchange === 'string' ? row.exchange : undefined,
                quoteType: typeof row.quoteType === 'string' ? row.quoteType : undefined,
            });
        }

        logExternal({
            service: 'yahoo',
            operation: 'symbol_search',
            host: YAHOO_QUERY2_HOST,
            method: 'GET',
            path: '/v1/finance/search',
            outcome: 'ok',
            durationMs,
            extra: { queryLen: q.length, hits: out.length },
        });
        return out;
    } catch (e: unknown) {
        const durationMs = Date.now() - t0;
        const { outcome, httpStatus, errorMessage } = externalOutcomeFromAxiosError(e);
        logger.warn('Yahoo symbol search failed', { message: errorMessage });
        logYahooAxiosTrace({
            operation: 'symbol_search',
            method: 'GET',
            url,
            requestHeaders,
            durationMs,
            transportError: errorMessage,
        });
        logExternal({
            service: 'yahoo',
            operation: 'symbol_search',
            host: YAHOO_QUERY2_HOST,
            method: 'GET',
            path: '/v1/finance/search',
            outcome,
            durationMs,
            httpStatus,
            errorMessage,
            extra: { queryLen: q.length },
        });
        return [];
    }
}
