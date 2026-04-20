import test from 'node:test';
import assert from 'node:assert/strict';
import {
    INSIGHT_RULE_AMOUNT_PLACEHOLDER,
    maskInsightRuleDefinitionForExport,
    stripInsightRuleDefinitionAmountPlaceholders,
} from './insightRuleExportMask.js';
import { parseInsightRuleDefinition, parseInsightRulesExportDocument } from './insightRules.js';

const sampleDef = {
    version: 1,
    scope: 'current_month' as const,
    condition: {
        op: 'sumExpensesGte' as const,
        amount: 3000,
        category: 'Food',
    },
    output: { kind: 'insight' as const, score: 50, message: { en: 'x', he: 'y' } },
};

test('mask replaces numeric thresholds with placeholder string', () => {
    const parsed = parseInsightRuleDefinition(sampleDef);
    assert.ok(parsed.ok);
    const masked = maskInsightRuleDefinitionForExport(parsed.value) as { condition: { amount: unknown } };
    assert.equal(masked.condition.amount, INSIGHT_RULE_AMOUNT_PLACEHOLDER);
});

test('strip then parse export document', () => {
    const def = parseInsightRuleDefinition(sampleDef);
    assert.ok(def.ok);
    const doc = {
        format: 'financial-overview-insight-rules' as const,
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        rules: [
            {
                id: 'a',
                name: 't',
                enabled: true,
                priority: 1,
                source: 'user' as const,
                definition: maskInsightRuleDefinitionForExport(def.value),
            },
        ],
    };
    const p = parseInsightRulesExportDocument(doc);
    assert.ok(p.ok);
    assert.ok(p.value.rules[0].maskedAmountSlotIds?.includes(JSON.stringify(['condition', 'amount'])));
});

test('stripInsightRuleDefinitionAmountPlaceholders collects paths', () => {
    const pv = parseInsightRuleDefinition(sampleDef);
    assert.ok(pv.ok);
    const masked = maskInsightRuleDefinitionForExport(pv.value);
    const s = stripInsightRuleDefinitionAmountPlaceholders(masked);
    assert.ok(s.ok);
    assert.ok(s.maskedSlotIds.some((id) => id.includes('amount')));
});
