import { describe, it, expect } from 'vitest';
import { dedupeInsights, normalizeInsightText } from './TopInsightsCard';

const insight = (id: string, text: string, score = 1) => ({
    id,
    text,
    score,
    createdAt: '2026-01-01T00:00:00Z',
});

describe('normalizeInsightText', () => {
    it('trims, collapses whitespace and lowercases', () => {
        expect(normalizeInsightText('  הוצאות   המזון\nיציבות  ')).toBe('הוצאות המזון יציבות');
        expect(normalizeInsightText('Food  COSTS')).toBe('food costs');
    });
});

describe('dedupeInsights', () => {
    it('removes exact duplicates, keeping the first occurrence', () => {
        const a = insight('1', 'same text', 0.9);
        const b = insight('2', 'same text', 0.5);
        expect(dedupeInsights([a, b, insight('3', 'other')])).toEqual([a, insight('3', 'other')]);
    });

    it('treats whitespace and case variants as duplicates', () => {
        const list = [
            insight('1', 'הוצאות המזון יציבות ביחס לחודש הקודם'),
            insight('2', '  הוצאות   המזון\nיציבות ביחס לחודש הקודם  '),
        ];
        expect(dedupeInsights(list)).toHaveLength(1);
        expect(dedupeInsights(list)[0].id).toBe('1');
    });

    it('keeps distinct insights and drops empty text', () => {
        const list = [insight('1', 'a'), insight('2', ''), insight('3', '   '), insight('4', 'b')];
        expect(dedupeInsights(list).map((i) => i.id)).toEqual(['1', '4']);
    });
});
