/**
 * EODHD tickers use `CODE.EXCHANGE` (e.g. `MSFT.US`, `TEVA.TA`).
 * User-entered symbols are stored as-is; these candidates are used only for EODHD requests.
 */
const EODHD_KNOWN_EXCHANGE_SUFFIX = /\.(US|TA|FOREX|CC|L|PA|AS|DE|MI|F|TSE|TO|V|SW|ST|BR|NW|OL|CO|IS|LS|MC|VI|WA|CN|HK|INDX)$/i;

function looksLikeEodhdExchangedSymbol(sym: string): boolean {
    return EODHD_KNOWN_EXCHANGE_SUFFIX.test(sym);
}

export function buildEodhdQuoteCandidates(
    portfolioSymbol: string,
    currency: string,
    useTelAvivListing: boolean
): string[] {
    const s = portfolioSymbol.trim().toUpperCase();
    const cur = currency.toUpperCase();
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (x: string) => {
        const u = x.trim().toUpperCase();
        if (!u || seen.has(u)) return;
        seen.add(u);
        out.push(u);
    };

    if (s.startsWith('TA.')) {
        const base = s.slice(3);
        if (base) add(`${base}.TA`);
    }

    if (cur === 'ILS' && useTelAvivListing) {
        if (s.endsWith('.TA')) add(s);
        else if (!s.startsWith('TA.')) add(`${s}.TA`);
        if (!s.startsWith('TA.')) {
            const base = s.replace(/\.TA$/, '');
            add(`TA.${base}`);
        }
        return out;
    }

    if (cur === 'USD') {
        if (!looksLikeEodhdExchangedSymbol(s)) add(`${s}.US`);
        add(s);
        return out;
    }

    add(s);
    return out;
}
