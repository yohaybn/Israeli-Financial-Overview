import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(__dirname, 'AILogViewer.tsx'), 'utf8');

describe('AI log responsive list', () => {
  it('uses cards on mobile and confines the wide table to desktop', () => {
    expect(source).toMatch(/space-y-3 md:hidden/);
    expect(source).toMatch(/hidden overflow-hidden rounded-lg bg-white shadow md:block/);
    expect(source).toContain('truncateTableInput(tableInputLabel(log), 140)');
  });
});
