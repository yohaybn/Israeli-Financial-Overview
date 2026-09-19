import { describe, expect, it } from 'vitest';
import { CONFIG_GROUPS, visibleConfigGroups } from './configGroups';

describe('settings navigation groups', () => {
    it('assigns every settings tab exactly once', () => {
        const tabs = CONFIG_GROUPS.flatMap((group) => group.tabs);
        expect(new Set(tabs).size).toBe(12);
        expect(tabs).toHaveLength(12);
    });

    it('keeps task groups while hiding unavailable advanced tabs', () => {
        expect(visibleConfigGroups(['ai', 'categories', 'financial-report', 'scrape'])).toEqual([
            { id: 'ai_categorization', tabs: ['ai', 'categories'] },
            { id: 'automation_reports', tabs: ['scrape', 'financial-report'] },
        ]);
    });
});
