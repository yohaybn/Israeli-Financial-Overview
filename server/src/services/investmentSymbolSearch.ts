import { useEodhdPrimaryQuotes, getEodhdApiToken } from '../constants/marketData.js';
import { searchEodhdSymbols } from './eodhdClient.js';
import { searchYahooFinanceSymbols, type YahooSymbolSearchHit } from './yahooSymbolSearch.js';

export type InvestmentSymbolSearchHit = YahooSymbolSearchHit;

/**
 * EODHD hits first (when configured), then Yahoo hits not already present by symbol (case-insensitive).
 */
export async function searchInvestmentSymbols(query: string): Promise<InvestmentSymbolSearchHit[]> {
    const token = getEodhdApiToken();
    const eodhdFirst = useEodhdPrimaryQuotes() && token;
    const eodhdHits = eodhdFirst ? await searchEodhdSymbols(token, query) : [];
    const yahooHits = await searchYahooFinanceSymbols(query);

    const seen = new Set<string>();
    const out: InvestmentSymbolSearchHit[] = [];
    for (const h of eodhdHits) {
        const k = h.symbol.trim().toUpperCase();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(h);
    }
    for (const h of yahooHits) {
        const k = h.symbol.trim().toUpperCase();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(h);
    }
    return out;
}
