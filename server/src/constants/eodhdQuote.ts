export const EODHD_QUOTE_MODES = ['realtime', 'eod', 'realtime_then_eod', 'eod_then_realtime'] as const;
export type EodhdQuoteMode = (typeof EODHD_QUOTE_MODES)[number];

export function parseEodhdQuoteMode(raw: string | null | undefined): EodhdQuoteMode {
    const s = String(raw || '').trim().toLowerCase();
    return (EODHD_QUOTE_MODES as readonly string[]).includes(s) ? (s as EodhdQuoteMode) : 'realtime';
}
