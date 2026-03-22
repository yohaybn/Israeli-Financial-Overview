import type { AnomalyAlert, BudgetHealth, BudgetHealthMessageKey } from '../types.js';

export type DigestLocale = 'en' | 'he';

const BUDGET: Record<DigestLocale, Record<BudgetHealthMessageKey, string>> = {
    en: {
        pace_good: 'Spending pace is good.',
        pace_slightly_fast: 'Spending slightly faster than usual.',
        pace_much_faster: 'Spending much faster than historical average.',
        projected_deficit: 'Projected deficit for this month.'
    },
    he: {
        pace_good: 'קצב ההוצאות תקין.',
        pace_slightly_fast: 'קצב ההוצאות מעט מהיר מהרגיל.',
        pace_much_faster: 'קצב ההוצאות מהיר משמעותית מהממוצע ההיסטורי.',
        projected_deficit: 'גירעון צפוי לחודש זה.'
    }
};

/** Format budget health line for Telegram digest (matches dashboard semantics). */
export function formatBudgetHealthDigestLine(
    health: BudgetHealth,
    locale: DigestLocale = 'en'
): string {
    const key = health.messageKey ?? 'pace_good';
    return BUDGET[locale][key] ?? health.message;
}

function n(v: number | undefined): string {
    if (v === undefined || Number.isNaN(v)) return '—';
    return String(Math.round(v * 100) / 100);
}

/** Single anomaly line for Telegram digest. */
export function formatAnomalyDigestLine(alert: AnomalyAlert, locale: DigestLocale = 'en'): string {
    const cat = alert.category ?? '';
    switch (alert.type) {
        case 'velocity':
            return locale === 'he'
                ? `פעילות בקטגוריה ${cat}: מעל הקצב הצפוי לנקודה זו בחודש.`
                : `${cat}: ahead of usual pace for this point in the month.`;
        case 'outlier':
            return locale === 'he'
                ? `${cat}: מגמה גבוהה מהרגיל לחודש.`
                : `${cat}: trending well above typical monthly level.`;
        case 'whale': {
            const max = alert.currentValue ?? 0;
            const avg = alert.expectedValue;
            if (avg != null && avg > 0) {
                return locale === 'he'
                    ? `עסקה בודדת (${n(max)} ₪) ב-${cat} גבולה מהרגיל (~${n(avg)} ₪).`
                    : `One large expense (${n(max)} ₪) in ${cat} vs typical ~${n(avg)} ₪.`;
            }
            return locale === 'he'
                ? `עסקה בולטת ב-${cat} (${n(max)} ₪).`
                : `One standout expense (${n(max)} ₪) in ${cat}.`;
        }
        case 'missing_expected': {
            const desc = alert.meta?.recurringDescription ?? '';
            const d = alert.meta?.expectedDateIso
                ? new Date(alert.meta.expectedDateIso).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')
                : '';
            return locale === 'he'
                ? `צפוי '${desc}' סביב ${d} — עדיין לא הופיע.`
                : `Expected '${desc}' around ${d} — not seen yet.`;
        }
        default:
            return alert.message;
    }
}
