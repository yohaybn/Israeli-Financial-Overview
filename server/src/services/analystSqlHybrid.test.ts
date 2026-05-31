import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    evaluateSuperPrivacySufficient,
    parseSuperPrivacyFlags,
} from './analystSqlHybrid.js';

describe('parseSuperPrivacyFlags', () => {
    it('reads sqlNotPossible', () => {
        const f = parseSuperPrivacyFlags({ sqlNotPossible: true, sqlNotPossibleReason: 'Needs memos' });
        assert.equal(f.sqlNotPossible, true);
        assert.equal(f.sqlNotPossibleReason, 'Needs memos');
    });
});

describe('evaluateSuperPrivacySufficient', () => {
    it('fails when sqlNotPossible', () => {
        const r = evaluateSuperPrivacySufficient({
            flags: { sqlNotPossible: true, sqlNotPossibleReason: 'Data not in schema' },
            queries: [],
            filledResponse: 'Data not in schema',
        });
        assert.equal(r.sufficient, false);
    });

    it('passes when queries and clean template', () => {
        const r = evaluateSuperPrivacySufficient({
            flags: {},
            queries: [{ key: 't', sql: 'SELECT 1' }],
            sqlResults: { t: { rows: [{ x: 1 }], columns: ['x'] } },
            filledResponse: 'Total: 1',
        });
        assert.equal(r.sufficient, true);
    });
});
