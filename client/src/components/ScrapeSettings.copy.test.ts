import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/ScrapeSettings.tsx'), 'utf8');

describe('scan settings controls', () => {
    it('uses the switch pattern for immediate boolean settings', () => {
        expect(source).toContain("checked={config.scraperOptions.ignorePendingTransactions !== false}");
        expect(source).toContain("onChange={(checked) => updateOption('ignorePendingTransactions', checked)}");
    });

    it('does not append a duplicate timeout unit', () => {
        expect(source).toContain("{t('scraper.timeout')}</label>");
        expect(source).not.toContain("{t('scraper.timeout')} (ms)");
    });
});
