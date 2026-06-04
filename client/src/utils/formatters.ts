const ILS_FORMATTER = new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 2,
});

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
