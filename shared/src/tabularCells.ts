import type { TabularDateFormat } from './tabularImportProfile.js';

export function normalizeCellText(cell: unknown): string {
    return String(cell ?? '')
        .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
        .trim();
}

export function currencySymbolToIso(raw: string): string {
    const s = raw.trim();
    if (!s) return 'ILS';
    if (s.includes('₪') || s === 'ש"ח' || /^ils$/i.test(s)) return 'ILS';
    if (s.includes('$') || /^usd$/i.test(s)) return 'USD';
    if (s.includes('€') || /^eur$/i.test(s)) return 'EUR';
    if (s.includes('£') || /^gbp$/i.test(s)) return 'GBP';
    if (s.includes('ლ')) return 'GEL';
    return s.length <= 3 ? s.toUpperCase() : 'ILS';
}

/**
 * True when the cell has visible content that parses to 0 as an amount and contains no digits
 * (e.g. currency symbol only, letters). Use to detect “expected number, got text” mapping mistakes.
 */
export function cellLooksLikeNonNumericAmount(val: unknown): boolean {
    if (val === undefined || val === null) return false;
    if (typeof val === 'number') return false;
    const t = normalizeCellText(val);
    if (!t) return false;
    if (/\d/.test(t)) return false;
    const n = parseNumberCell(val);
    return n === 0;
}

export function parseNumberCell(val: unknown): number {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    let s = String(val).trim();
    if (!s) return 0;

    let neg = false;
    if (/^\(.*\)$/.test(s)) {
        neg = true;
        s = s.slice(1, -1).trim();
    }

    const compact = s.replace(/\s/g, '');
    // European / IL: 1.234,56 → 1234.56
    if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(compact)) {
        s = compact.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d+,\d+$/.test(compact)) {
        // 12,50 → 12.50
        s = compact.replace(',', '.');
    }

    const clean = s.replace(/[^\d.-]/g, '');
    const parsed = parseFloat(clean);
    const n = Number.isFinite(parsed) ? parsed : 0;
    return neg ? -Math.abs(n) : n;
}

function excelSerialToDate(serial: number): Date | null {
    if (!Number.isFinite(serial)) return null;
    const whole = Math.floor(serial);
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + whole * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function parseDateCell(raw: unknown, format: TabularDateFormat | undefined): Date | null {
    const fmt = format ?? 'dmy_slash';

    if (raw === undefined || raw === null || raw === '') return null;

    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0));
    }

    if (fmt === 'excel_serial' && typeof raw === 'number') {
        return excelSerialToDate(raw);
    }

    const s = String(raw).trim();
    if (!s) return null;

    if (fmt === 'excel_serial') {
        const n = parseNumberCell(raw);
        if (n > 20000 && n < 80000) {
            return excelSerialToDate(n);
        }
    }

    if (fmt === 'iso') {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    if (/^\d{5,6}(\.\d+)?$/.test(s)) {
        const n = parseFloat(s);
        if (n > 20000 && n < 80000) {
            const d = excelSerialToDate(n);
            if (d) return d;
        }
    }

    const parts = s.split(/[\/\.\-]/).map((p) => p.trim());
    if (parts.length !== 3) return null;

    let day: number;
    let month: number;
    let year: number;

    if (fmt === 'ymd_dash') {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
    } else if (fmt === 'mdy_slash') {
        month = parseInt(parts[0], 10) - 1;
        day = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
    } else {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
    }

    if (year < 100) year += 2000;
    if (year < 1900 || year > 2100) return null;

    const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
    return Number.isNaN(date.getTime()) ? null : date;
}
