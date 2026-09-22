import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.join(__dirname, 'AILogViewer.tsx'), 'utf8');
describe('AI log privacy defaults', () => {
  it('keeps raw fields collapsed and warns before disclosure', () => {
    const sensitive = source.match(/<details className="group" open>/g) ?? [];
    expect(sensitive).toHaveLength(0);
    expect(source).toContain("t('ai_logs.sensitive_warning')");
  });
  it('states the retention behavior', () => {
    expect(source).toContain("t('ai_logs.retention_notice')");
  });
});
