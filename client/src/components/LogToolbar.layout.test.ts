import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const ai = fs.readFileSync(path.join(__dirname, 'AILogViewer.tsx'), 'utf8');
const scrape = fs.readFileSync(path.join(__dirname, 'ScrapeLogViewer.tsx'), 'utf8');
describe('log toolbar layout', () => {
  it('keeps filters visible and model detail collapsed', () => {
    expect(ai).toContain('sticky top-0 z-20');
    expect(ai).toMatch(/<details[^>]*>[\s\S]*model_breakdown/);
  });
  it('moves destructive actions into danger menus', () => {
    expect(ai).toContain("t('ai_logs.danger_zone')");
    expect(scrape).toContain("t('scrape_logs.danger_zone')");
  });
});
