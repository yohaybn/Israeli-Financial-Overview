import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Transaction } from './types.js';
import {
    evaluateInsightRuleDefinition,
    evaluateInsightRuleCondition,
    parseInsightRuleDefinition,
    filterTransactionsForRuleScope,
    computeRulePeriodKey,
} from './insightRules.js';

const baseTxn = (over: Partial<Transaction>): Transaction => {
    const merged: Partial<Transaction> = {
        id: '1',
        date: '2026-03-15',
        processedDate: '2026-03-15',
        description: 'test',
        amount: -100,
        originalAmount: -100,
        originalCurrency: 'ILS',
        chargedAmount: -100,
        status: 'completed',
        provider: 'x',
        accountNumber: '12',
        ...over,
    };
    if (over.amount !== undefined && over.chargedAmount === undefined) {
        merged.chargedAmount = over.amount;
    }
    return merged as Transaction;
};

describe('insightRules', () => {
    it('evaluateInsightRuleCondition sumExpensesGte direct', () => {
        const txns = [
            baseTxn({ id: 'a', date: '2026-03-01', category: 'מזון', amount: -500 }),
            baseTxn({ id: 'b', date: '2026-03-20', category: 'מזון', amount: -600 }),
        ];
        const cond = { op: 'sumExpensesGte' as const, amount: 1000, category: 'מזון' };
        assert.equal(evaluateInsightRuleCondition(txns, cond), true);
    });

    it('sumExpensesGte matches when total expenses in scope exceed threshold', () => {
        const txns = [
            baseTxn({ id: 'a', date: '2026-03-01', category: 'מזון', amount: -500 }),
            baseTxn({ id: 'b', date: '2026-03-20', category: 'מזון', amount: -600 }),
        ];
        const def = {
            version: 1 as const,
            scope: 'current_month' as const,
            condition: { op: 'sumExpensesGte' as const, amount: 1000, category: 'מזון' },
            output: {
                kind: 'insight' as const,
                score: 80,
                message: { en: 'Food {{sum}}', he: 'מזון {{sum}}' },
            },
        };
        const ref = new Date(2026, 2, 15);
        const r = evaluateInsightRuleDefinition(txns, def, { referenceDate: ref });
        assert.equal(r.matched, true);
        assert.ok(r.placeholders.sum);
    });

    it('existsTxn matches memo', () => {
        const txns = [baseTxn({ id: 'x', memo: 'NETFLIX', amount: -50 })];
        const def = {
            version: 1 as const,
            scope: 'all' as const,
            condition: {
                op: 'existsTxn' as const,
                where: { op: 'memoOrDescriptionContains' as const, value: 'netflix' },
            },
            output: {
                kind: 'insight' as const,
                score: 50,
                message: { en: 'Sub', he: 'מנוי' },
            },
        };
        const r = evaluateInsightRuleDefinition(txns, def);
        assert.equal(r.matched, true);
    });

    it('parseInsightRuleDefinition rejects invalid score', () => {
        const bad = {
            version: 1,
            scope: 'all',
            condition: { op: 'txnCountGte', min: 1 },
            output: { kind: 'insight', score: 0, message: { en: 'a', he: 'b' } },
        };
        const r = parseInsightRuleDefinition(bad);
        assert.equal(r.ok, false);
    });

    it('filterTransactionsForRuleScope current_month', () => {
        const txns = [
            baseTxn({ id: '1', date: '2026-03-01' }),
            baseTxn({ id: '2', date: '2026-02-28' }),
        ];
        const f = filterTransactionsForRuleScope(txns, 'current_month', { referenceDate: new Date('2026-03-15') });
        assert.equal(f.length, 1);
    });

    it('computeRulePeriodKey stable', () => {
        const def = {
            version: 1 as const,
            scope: 'current_month' as const,
            condition: { op: 'txnCountGte' as const, min: 0 },
            output: { kind: 'insight' as const, score: 50, message: { en: 'a', he: 'b' } },
        };
        assert.equal(computeRulePeriodKey(def, new Date('2026-03-01T12:00:00Z')), 'm:2026-03');
    });
});
