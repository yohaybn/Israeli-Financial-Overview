import type { Transaction } from '@app/shared';

function parseAmountFromQuery(q: string): number | null {
    const stripped = q.replace(/[^0-9.,-]/g, '').replace(',', '.');
    if (!stripped || stripped === '-' || stripped === '.' || stripped === '-.') return null;
    const n = parseFloat(stripped);
    return Number.isFinite(n) ? n : null;
}

function amountMatchesQuery(t: Transaction, q: string): boolean {
    const num = parseAmountFromQuery(q);
    const charged = t.chargedAmount ?? t.amount ?? 0;
    const orig = t.originalAmount ?? 0;

    if (num !== null) {
        const eps = 0.005;
        if (Math.abs(charged - num) < eps) return true;
        if (Math.abs(charged + num) < eps) return true;
        if (Math.abs(Math.abs(charged) - Math.abs(num)) < eps) return true;
        if (Math.abs(orig - num) < eps) return true;
        if (Math.abs(orig + num) < eps) return true;
        if (Math.abs(Math.abs(orig) - Math.abs(num)) < eps) return true;
    }

    const digits = q.replace(/\D/g, '');
    if (digits.length < 2) return false;
    const chargedStr = Math.abs(charged).toFixed(2);
    const origStr = Math.abs(orig).toFixed(2);
    const norm = (s: string) => s.replace('.', '').replace(/^0+/, '') || '0';
    const hc = norm(chargedStr);
    const ho = norm(origStr);
    return hc.includes(digits) || ho.includes(digits);
}

/** Case-insensitive match on common text fields plus numeric / amount substring match. */
export function transactionMatchesSearchQuery(t: Transaction, raw: string): boolean {
    const q = raw.trim();
    if (!q) return true;
    const lower = q.toLowerCase();

    const textMatch =
        (t.description && t.description.toLowerCase().includes(lower)) ||
        (t.memo && t.memo.toLowerCase().includes(lower)) ||
        (t.category && t.category.toLowerCase().includes(lower)) ||
        (t.accountNumber && t.accountNumber.toLowerCase().includes(lower)) ||
        (t.provider && t.provider.toLowerCase().includes(lower)) ||
        (t.type && t.type.toLowerCase().includes(lower)) ||
        (t.date && t.date.toLowerCase().includes(lower)) ||
        (t.processedDate && t.processedDate.toLowerCase().includes(lower));

    if (textMatch) return true;

    return amountMatchesQuery(t, q);
}
