import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalystSelectSql } from './analystSqlExecutor.js';
import { fillAnalystResponseTemplate } from './analystSqlTemplate.js';

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
});
