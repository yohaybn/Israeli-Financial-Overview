import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panelSource = readFileSync(resolve(process.cwd(), 'src/components/ConfigurationPanel.tsx'), 'utf8');
const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('configuration scrolling layout', () => {
    it('uses the application view as the only vertical scroll container', () => {
        expect(appSource).toContain('view === \'configuration\'');
        expect(appSource).toContain('className="h-full overflow-y-auto"');
        expect(panelSource).not.toContain('className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6"');
    });

    it('keeps the desktop settings navigation visible within the page scroll', () => {
        expect(panelSource).toContain('sticky top-0 max-h-screen');
        expect(panelSource).toContain('overflow-y-auto p-3');
    });
});
