import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Transaction } from './types.js';
import {
    evaluateInsightRuleDefinition,
    evaluateInsightRuleCondition,
    parseInsightRuleDefinition,
    filterTransactionsForRuleScope,
    filterTransactionsForPriorRuleScope,
    computeRulePeriodKey,
    applyMessageTemplates,
    formatInsightRulePeriodLabel,
    formatInsightRulePlaceholdersForPrompt,
    formatCategoryLabelsForPrompt,
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

    it('sumExpensesBetween matches inside band', () => {
        const txns = [baseTxn({ id: '1', date: '2026-03-01', amount: -400 })];
        const cond = { op: 'sumExpensesBetween' as const, minAmount: 300, maxAmount: 500 };
        assert.equal(evaluateInsightRuleCondition(txns, cond), true);
    });

    it('shareOfCategoryGte uses share of all expenses', () => {
        const txns = [
            baseTxn({ id: 'a', date: '2026-03-01', category: 'מזון', amount: -600 }),
            baseTxn({ id: 'b', date: '2026-03-02', category: 'דלק', amount: -400 }),
        ];
        const cond = { op: 'shareOfCategoryGte' as const, category: 'מזון', share: 0.55 };
        assert.equal(evaluateInsightRuleCondition(txns, cond), true);
    });

    it('maxSingleExpenseGte fills largest txn placeholders', () => {
        const txns = [
            baseTxn({ id: '1', date: '2026-03-10', memo: 'Small', amount: -100 }),
            baseTxn({ id: '2', date: '2026-03-11', memo: 'Big buy', amount: -950 }),
        ];
        const def = {
            version: 1 as const,
            scope: 'all' as const,
            condition: { op: 'maxSingleExpenseGte' as const, amount: 500 },
            output: { kind: 'insight' as const, score: 50, message: { en: 'x', he: 'y' } },
        };
        const r = evaluateInsightRuleDefinition(txns, def);
        assert.equal(r.matched, true);
        assert.match(r.placeholders.largest_txn_memo, /Big/i);
        assert.equal(r.placeholders.largest_txn_date, '2026-03-11');
    });

    it('filterTransactionsForPriorRuleScope returns previous month', () => {
        const txns = [
            baseTxn({ id: 'p', date: '2026-02-15', amount: -10 }),
            baseTxn({ id: 'c', date: '2026-03-01', amount: -10 }),
        ];
        const prior = filterTransactionsForPriorRuleScope(txns, 'current_month', { referenceDate: new Date('2026-03-10') });
        assert.equal(prior.length, 1);
        assert.equal(prior[0].id, 'p');
    });

    it('formatInsightRulePeriodLabel differs by locale for month scope', () => {
        const def = {
            version: 1 as const,
            scope: 'current_month' as const,
            condition: { op: 'txnCountGte' as const, min: 0 },
            output: { kind: 'insight' as const, score: 1, message: { en: '', he: '' } },
        };
        const ref = new Date('2026-03-10');
        const en = formatInsightRulePeriodLabel(def, ref, 'en');
        const he = formatInsightRulePeriodLabel(def, ref, 'he');
        assert.ok(en.length > 0);
        assert.ok(he.length > 0);
    });

    it('formatInsightRulePlaceholdersForPrompt lists every key with braces', () => {
        const s = formatInsightRulePlaceholdersForPrompt();
        assert.ok(s.includes('{{period_label}}'));
        assert.ok(s.includes('{{sum}}'));
        assert.ok(!s.includes('{{unknown}}'));
    });

    it('formatCategoryLabelsForPrompt dedupes and trims', () => {
        const s = formatCategoryLabelsForPrompt(['  a  ', 'a', 'b']);
        assert.equal(s, '- a\n- b');
    });

    it('applyMessageTemplates merges period_label', () => {
        const def = {
            version: 1 as const,
            scope: 'last_n_days' as const,
            lastNDays: 7,
            condition: { op: 'txnCountGte' as const, min: 0 },
            output: {
                kind: 'insight' as const,
                score: 50,
                message: { en: 'Window: {{period_label}}', he: 'חלון: {{period_label}}' },
            },
        };
        const { en, he } = applyMessageTemplates(def.output, {}, { referenceDate: new Date('2026-04-16'), definition: def });
        assert.ok(!en.includes('{{period_label}}'));
        assert.ok(!he.includes('{{period_label}}'));
    });
});
