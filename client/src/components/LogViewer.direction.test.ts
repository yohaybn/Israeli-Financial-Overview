import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (name: string) => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('log viewer directionality', () => {
  it('does not force the log screen chrome to LTR', () => {
    for (const name of ['LogViewer.tsx', 'AILogViewer.tsx', 'ScrapeLogViewer.tsx']) {
      const source = read(name);
      const outer = source.match(/return \(\s*<div[^>]*>/)?.[0] ?? '';
      expect(outer).not.toContain('dir="ltr"');
    }
  });

  it('keeps raw log content explicitly LTR', () => {
    expect(read('LogViewer.tsx')).toMatch(/dir="ltr"\s+className="flex-1 overflow-y-auto/);
    expect(read('AILogViewer.tsx')).toContain('<table dir="ltr"');
    expect(read('ScrapeLogViewer.tsx')).toContain('<table dir="ltr"');
  });
});
