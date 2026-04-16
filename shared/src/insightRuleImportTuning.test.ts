import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInsightRuleImportTuningSlots, extractInsightRuleImportTuningSlots } from './insightRuleImportTuning.js';
import { parseInsightRuleDefinition } from './insightRules.js';

test('extract and apply tuning round-trip on shareOfCategory', () => {
    const def = parseInsightRuleDefinition({
        version: 1,
        scope: 'current_month',
        condition: {
            op: 'shareOfCategoryGte',
            category: 'Food',
            share: 0.25,
        },
        output: { kind: 'insight', score: 50, message: { en: 'x', he: 'y' } },
    });
    assert.ok(def.ok);
    const slots = extractInsightRuleImportTuningSlots(def.value);
    assert.ok(slots.length >= 2);
    const byPath = Object.fromEntries(slots.map((s) => [s.id, s.initialValue]));
    const applied = applyInsightRuleImportTuningSlots(def.value, slots, {
        ...byPath,
        [slots.find((s) => s.kind === 'category')!.id]: 'מזון',
        [slots.find((s) => s.kind === 'percent')!.id]: '40',
    });
    assert.ok(applied.ok);
    const c = applied.value.condition;
    assert.equal(c.op, 'shareOfCategoryGte');
    if (c.op === 'shareOfCategoryGte') {
        assert.equal(c.category, 'מזון');
        assert.ok(Math.abs(c.share - 0.4) < 1e-6);
    }
});
