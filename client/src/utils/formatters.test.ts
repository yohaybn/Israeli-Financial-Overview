import { describe, expect, it } from 'vitest';
import { formatCompactIlsTick } from './formatters';

describe('formatCompactIlsTick', () => {
    it('compacts thousands with the ₪ symbol', () => {
        const out = formatCompactIlsTick(10000, 'he');
        expect(out).toContain('₪');
        expect(out).not.toContain('ILS');
        const stripped = out.replace(/[₪\s,.\u200e\u200f]/g, '');
        expect(stripped).toBe('10K');
    });

    it('keeps small values readable', () => {
        expect(formatCompactIlsTick(500, 'he')).toContain('500');
    });

    it('renders the ₪ symbol for the en locale too', () => {
        expect(formatCompactIlsTick(18000, 'en')).toContain('₪');
    });

    it('tolerates non-finite input', () => {
        expect(formatCompactIlsTick(Number.NaN, 'he')).toContain('0');
    });
});
