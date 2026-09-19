import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const modal = read('src/components/dashboard/CategoryDetailsModal.tsx');
const sidebar = read('src/components/dashboard/DashboardSidebar.tsx');

describe('date-fns locale for textual month names', () => {
    it('resolves the Hebrew locale from the i18n language in both components', () => {
        for (const source of [modal, sidebar]) {
            expect(source).toContain("import { enUS, he } from 'date-fns/locale';");
            expect(source).toContain("i18n.language === 'he' ? he : enUS");
        }
    });

    it('passes the locale to every month-name format call', () => {
        const textual = (source: string) =>
            source.match(/format\([^;]*'(MMMM|MMM)[^;]*\);/g) ?? [];
        for (const source of [modal, sidebar]) {
            for (const call of textual(source)) {
                if (call.includes("i18n.language === 'he' ? 'MM/yy'")) continue;
                expect(call).toContain('locale: dateLocale');
            }
        }
    });
});
