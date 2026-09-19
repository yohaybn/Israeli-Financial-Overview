import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/dashboard/CategoryDetailsModal.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve(process.cwd(), 'src/locales/en/dashboard.json'), 'utf8'));
const he = JSON.parse(readFileSync(resolve(process.cwd(), 'src/locales/he/dashboard.json'), 'utf8'));

describe('category details month labels', () => {
    it('passes the label variable to interpolated strings instead of appending text', () => {
        expect(source).toContain("t('dashboard.spending_for', { label:");
        expect(source).toContain("t('dashboard.transactions_for', { label:");
        expect(source).not.toContain("{t('dashboard.spending_for')} {");
        expect(source).not.toContain("{t('dashboard.transactions_for')} {");
    });

    it('keeps the placeholder shape the call sites interpolate', () => {
        for (const res of [en, he]) {
            expect(res.dashboard.spending_for).toContain('{{label}}');
            expect(res.dashboard.transactions_for).toContain('{{label}}');
        }
    });
});
