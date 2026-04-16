import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMMUNITY_DESCRIPTION_MAX_LEN, parseCommunityInsightRuleSubmission, parseCommunityInsightRulesIndex } from './communityInsightRules.js';

describe('parseCommunityInsightRuleSubmission', () => {
    it('accepts a minimal valid submission', () => {
        const r = parseCommunityInsightRuleSubmission({
            version: 1,
            author: 'tester',
            rule: {
                id: 'rule-id-1',
                name: 'My rule',
                enabled: true,
                priority: 0,
                source: 'user',
                definition: {
                    version: 1,
                    scope: 'all',
                    condition: { op: 'txnCountGte', min: 1 },
                    output: { kind: 'insight', score: 50, message: { en: 'Hello', he: 'שלום' } },
                },
            },
        });
        assert.equal(r.ok, true);
        if (r.ok) {
            assert.equal(r.value.author, 'tester');
            assert.equal(r.value.rule.id, 'rule-id-1');
        }
    });

    it('rejects missing author', () => {
        const r = parseCommunityInsightRuleSubmission({
            version: 1,
            author: '   ',
            rule: {
                id: 'x',
                name: 'n',
                enabled: true,
                priority: 0,
                source: 'user',
                definition: {
                    version: 1,
                    scope: 'all',
                    condition: { op: 'txnCountGte', min: 1 },
                    output: { kind: 'insight', score: 50, message: { en: 'a', he: 'ב' } },
                },
            },
        });
        assert.equal(r.ok, false);
    });
});

describe('parseCommunityInsightRulesIndex', () => {
    it('parses optional entry.description', () => {
        const r = parseCommunityInsightRulesIndex({
            version: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
            rules: [
                {
                    id: 'a',
                    name: 'Rule A',
                    author: 'alice',
                    description: '  hello note  ',
                    submittedAt: '2026-01-02T00:00:00.000Z',
                    path: 'community/rules/a.json',
                },
            ],
        });
        assert.equal(r.ok, true);
        if (r.ok) {
            assert.equal(r.value.rules[0].description, 'hello note');
        }
    });

    it('omits empty description after trim', () => {
        const r = parseCommunityInsightRulesIndex({
            version: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
            rules: [
                {
                    id: 'a',
                    name: 'Rule A',
                    author: 'alice',
                    description: '   ',
                    submittedAt: '2026-01-02T00:00:00.000Z',
                    path: 'community/rules/a.json',
                },
            ],
        });
        assert.equal(r.ok, true);
        if (r.ok) {
            assert.equal(r.value.rules[0].description, undefined);
        }
    });

    it('rejects non-string entry.description', () => {
        const r = parseCommunityInsightRulesIndex({
            version: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
            rules: [
                {
                    id: 'a',
                    name: 'Rule A',
                    author: 'alice',
                    description: 1,
                    submittedAt: '2026-01-02T00:00:00.000Z',
                    path: 'community/rules/a.json',
                },
            ],
        });
        assert.equal(r.ok, false);
    });

    it('rejects entry.description over max length', () => {
        const r = parseCommunityInsightRulesIndex({
            version: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
            rules: [
                {
                    id: 'a',
                    name: 'Rule A',
                    author: 'alice',
                    description: 'x'.repeat(COMMUNITY_DESCRIPTION_MAX_LEN + 1),
                    submittedAt: '2026-01-02T00:00:00.000Z',
                    path: 'community/rules/a.json',
                },
            ],
        });
        assert.equal(r.ok, false);
    });
});
