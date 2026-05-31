import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalystSelectSql } from './analystSqlExecutor.js';
import { fillAnalystResponseTemplate } from './analystSqlTemplate.js';
import { evaluateSuperPrivacySufficient } from './analystSqlHybrid.js';

describe('validateAnalystSelectSql', () => {
    it('accepts SELECT', () => {
        assert.equal(validateAnalystSelectSql('SELECT 1').ok, true);
    });
    it('rejects INSERT', () => {
        assert.equal(validateAnalystSelectSql('INSERT INTO x VALUES (1)').ok, false);
    });
    it('rejects multiple statements', () => {
        assert.equal(validateAnalystSelectSql('SELECT 1; SELECT 2').ok, false);
    });
});

describe('fillAnalystResponseTemplate', () => {
    it('substitutes scalar placeholders', () => {
        const text = fillAnalystResponseTemplate('Total: {{q:total}}', {
            total: { rows: [{ s: -100 }], columns: ['s'] },
        });
        assert.equal(text, 'Total: -100');
    });

    it('renders .list as chat bullets not pipe tables', () => {
        const text = fillAnalystResponseTemplate('Top:\n{{q:top.list}}', {
            top: {
                rows: [
                    { category: 'Food', total: 500 },
                    { category: 'Fuel', total: 200 },
                ],
                columns: ['category', 'total'],
            },
        });
        assert.match(text, /\*\*Food\*\*: 500/);
        assert.match(text, /\*\*Fuel\*\*: 200/);
        assert.doesNotMatch(text, /\|/);
    });

    it('substitutes named column placeholders from first row', () => {
        const template =
            'סך **{{q:total.total_spend}}** ₪ ({{q:total.tx_count}} עסקאות)\n{{q:monthly.list}}';
        const text = fillAnalystResponseTemplate(template, {
            total: {
                rows: [{ total_spend: 1234.5, tx_count: 7 }],
                columns: ['total_spend', 'tx_count'],
            },
            monthly: {
                rows: [{ month: '2026-03', total: 400 }],
                columns: ['month', 'total'],
            },
        });
        assert.match(text, /1,234\.5/);
        assert.match(text, /7/);
        assert.match(text, /\*\*2026-03\*\*: 400/);
        assert.doesNotMatch(text, /\{\{q:/);
    });

    it('hybrid sufficiency passes for multi-column template', () => {
        const filled = fillAnalystResponseTemplate(
            '**{{q:total.total_spend}}** ({{q:total.tx_count}})\n{{q:recent.list}}',
            {
                total: {
                    rows: [{ total_spend: 100, tx_count: 3 }],
                    columns: ['total_spend', 'tx_count'],
                },
                recent: {
                    rows: [{ tx: 'a', price: 10 }],
                    columns: ['tx', 'price'],
                },
            }
        );
        const r = evaluateSuperPrivacySufficient({
            flags: {},
            queries: [
                { key: 'total', sql: 'SELECT 1' },
                { key: 'recent', sql: 'SELECT 1' },
            ],
            sqlResults: {
                total: { rows: [{ total_spend: 100, tx_count: 3 }], columns: ['total_spend', 'tx_count'] },
                recent: { rows: [{ tx: 'a', price: 10 }], columns: ['tx', 'price'] },
            },
            filledResponse: filled,
        });
        assert.equal(r.sufficient, true);
    });
});
