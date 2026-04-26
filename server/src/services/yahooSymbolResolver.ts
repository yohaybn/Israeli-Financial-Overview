/**
 * Yahoo Finance: TASE listings commonly use `SYMBOL.TA`. Some symbols resolve with `TA.SYMBOL`.
 * User-entered symbol is stored as-is; these candidates are used only for Yahoo requests.
 */
export function buildYahooQuoteCandidates(
    portfolioSymbol: string,
    currency: string,
    useTelAvivListing: boolean
): string[] {
    const s = portfolioSymbol.trim().toUpperCase();
    const dedup: string[] = [];
    const add = (x: string) => {
        if (x && !dedup.includes(x)) dedup.push(x);
    };
    add(s);

    const cur = currency.toUpperCase();
    if (!useTelAvivListing || cur !== 'ILS') {
        return dedup;
    }

    if (s.endsWith('.TA') || s.startsWith('TA.')) {
        return dedup;
    }

    add(`TA.${s}`);
    add(`${s}.TA`);
    return dedup;
}
