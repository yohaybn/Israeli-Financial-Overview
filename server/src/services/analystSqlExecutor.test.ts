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
});
