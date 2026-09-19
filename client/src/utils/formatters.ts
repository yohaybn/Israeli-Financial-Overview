const ILS_FORMATTER = new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 2,
});

function compactIlsFormatter(locale: string, maxFractionDigits: number): Intl.NumberFormat {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'ILS',
        notation: 'compact',
        maximumFractionDigits: maxFractionDigits,
    });
}

const COMPACT_ILS_FORMATTERS: Record<string, Intl.NumberFormat[]> = {
    'he-IL': [compactIlsFormatter('he-IL', 0), compactIlsFormatter('he-IL', 1)],
    'en-US': [compactIlsFormatter('en-US', 0), compactIlsFormatter('en-US', 1)],
};

/**
 * Compact ₪ formatter for recharts axis ticks (e.g. "₪10K" instead of "ILS 10k").
 * Keeps tick labels short so they do not collide on narrow charts, and matches
 * the ₪ symbol used everywhere else in the UI.
 */
export function formatCompactIlsTick(value: number, locale?: string): string {
    const n = Number.isFinite(value) ? Number(value) : 0;
    const pair = locale && locale.startsWith('he') ? COMPACT_ILS_FORMATTERS['he-IL'] : COMPACT_ILS_FORMATTERS['en-US'];
    // >= 10K rounds cleanly to whole K ("₪22K"); smaller K values keep one
    // fraction digit so adjacent ticks ("₪1.2K" vs "₪1.8K") stay distinct.
    return pair[Math.abs(n) >= 10000 ? 0 : 1].format(n);
}

const INSTITUTION_LABELS: Record<string, string> = {
    leumi: 'בנק לאומי',
    hapoalim: 'בנק הפועלים',
    discount: 'בנק דיסקונט',
    mizrahi: 'בנק מזרחי טפחות',
    beinleumi: 'הבינלאומי',
    massad: 'בנק מסד',
    mercantile: 'בנק מרכנתיל',
    onezero: 'בנק וואן זירו',
    oneZero: 'בנק וואן זירו',
    otsarhahayal: 'אוצר החייל',
    otsarHahayal: 'אוצר החייל',
    yahav: 'בנק יהב',
    pagi: 'פאגי',
    behatsdaa: 'בנק בהצדעה',
    beyahadbishvilha: 'ביחד בשבילך',
    beyahadBishvilha: 'ביחד בשבילך',
    isracard: 'ישראכרט',
    max: 'MAX',
    amex: 'אמריקן אקספרס',
    visacal: 'ויזה כאל',
    visaCal: 'ויזה כאל',
};

export function formatIsraeliCurrency(amount: number): { value: string; className: string } {
    const toneClass =
        amount < 0 ? 'text-rose-600' : amount > 0 ? 'text-emerald-600' : 'text-slate-600';
    return {
        value: ILS_FORMATTER.format(Number.isFinite(amount) ? amount : 0),
        className: `tabular-nums text-sm font-semibold ${toneClass}`,
    };
}

export function formatTransactionDate(dateString: string): string {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${day}/${month}/${year}`;
}

export function getInstitutionLabel(rawTag: string): string {
    const normalized = (rawTag || '').trim();
    if (!normalized) return '';
    return (
        INSTITUTION_LABELS[normalized] ||
        INSTITUTION_LABELS[normalized.toLowerCase()] ||
        normalized
    );
}
