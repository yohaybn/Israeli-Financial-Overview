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

export function parseNumberCell(val: unknown): number {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    const clean = String(val).replace(/[^\d.-]/g, '');
    const parsed = parseFloat(clean);
    return Number.isFinite(parsed) ? parsed : 0;
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
