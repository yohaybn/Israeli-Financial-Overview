import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const viewer = fs.readFileSync(path.join(__dirname, 'LogViewer.tsx'), 'utf8');
const hooks = fs.readFileSync(path.join(__dirname, '../hooks/useScraper.ts'), 'utf8');

describe('live log scrolling', () => {
  it('only follows new logs while the viewer was already near the bottom', () => {
    expect(viewer).toContain('shouldAutoScrollRef.current');
    expect(viewer).toContain('element.scrollHeight - element.scrollTop - element.clientHeight < 48');
    expect(viewer).toContain('onScroll={handleLogScroll}');
  });

  it('allows polling to be paused', () => {
    expect(viewer).toContain('setLive(value => !value)');
    expect(hooks).toContain("options.live === false ? false : 5000");
  });
});
