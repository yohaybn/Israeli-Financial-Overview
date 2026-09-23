import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AiService,
    AI_TXN_INLINE_MAX_ROWS,
    AI_CATEGORIZATION_NO_API_KEY,
    normalizeScoredItems,
    normalizeFactReplacements,
} from './aiService.js';

test('AiService facade exposes the full public method surface', () => {
    const proto = AiService.prototype;
    const methods = [
        'hasApiKey',
        'getSettings',
        'updateSettings',
        'getAvailableModels',
        'categorizeTransactions',
        'analyzeData',
        'analyzeDataStructured',
        'analyzeDataSuperPrivacy',
        'generateFinancialReportNarrative',
        'generateFinancialMonthComparisonNarrative',
        'parseDocument',
        'updateCategoryInCache',
        'extractPersonaFromNarrative',
        'suggestInsightRuleDraft',
        'generateUserChart',
        'generateSqlAnalyticCard',
    ];
    for (const name of methods) {
        assert.equal(typeof (proto as any)[name], 'function', `AiService.${name} must be a function`);
    }
});

test('module-level constants keep their values', () => {
    assert.equal(AI_TXN_INLINE_MAX_ROWS, 100);
    assert.equal(AI_CATEGORIZATION_NO_API_KEY, 'GEMINI_API_KEY not configured');
});

test('normalizeScoredItems normalizes scores and filters invalid entries', () => {
    assert.deepEqual(normalizeScoredItems(null), []);
    assert.deepEqual(normalizeScoredItems([{ text: '  spends a lot on fuel ', score: '80' }]), [
        { text: 'spends a lot on fuel', score: 80 },
    ]);
    assert.deepEqual(normalizeScoredItems([{ text: 'x', score: 'not-a-number' }]), [{ text: 'x', score: 50 }]);
    assert.deepEqual(normalizeScoredItems([{ text: '' }, { noText: true }]), []);
});

test('normalizeFactReplacements keeps only meaningful replacements', () => {
    assert.deepEqual(normalizeFactReplacements(undefined), []);
    assert.deepEqual(
        normalizeFactReplacements([
            { oldText: 'a', newText: 'b' },
            { old: 'x', new: 'y' },
            { oldText: 'same', newText: 'SAME' },
            { oldText: '', newText: 'b' },
        ]),
        [
            { oldText: 'a', newText: 'b' },
            { oldText: 'x', newText: 'y' },
        ]
    );
});
