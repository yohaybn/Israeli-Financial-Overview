import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAnomalies } from './financial/financialPace.js';
import { MIN_DAYS_FOR_PACE_PROJECTION } from './financial/variableForecast.js';
import type { HistoricalBaseline } from './types.js';

const baseline: HistoricalBaseline = {
    categories: [
        {
            category: 'groceries',
            avgMonthly: 2000,
            stdDev: 100,
            avgDaily: 65.8,
            monthCount: 6,
            isFixed: false,
            expectedMonthlyTxnCount: 8,
            avgMonthlyTxnCount: 8,
            avgTxnValue: 250,
        },
    ],
    totalAvgMonthly: 2000,
    monthsAnalyzed: 6,
    totalAvgMonthlyTxnCount: 8,
};

test('detectAnomalies: single early-month purchase does not raise a false outlier', () => {
    const alerts = detectAnomalies(
        baseline,
        new Map([['groceries', 600]]),
        new Map([['groceries', 1]]),
        1, // day 1: naive projection would be 600*30 = 18,000 >> baseline
        30,
        []
    );
    assert.equal(alerts.some(a => a.type === 'outlier'), false);
});

test('detectAnomalies: genuine runaway spending still raises an outlier after the guard window', () => {
    const alerts = detectAnomalies(
        baseline,
        new Map([['groceries', 1500]]),
        new Map([['groceries', 6]]),
        MIN_DAYS_FOR_PACE_PROJECTION, // projected month-end 1500/5*30 = 9,000 >> 2,000 + 2*100
        30,
        []
    );
    assert.equal(alerts.some(a => a.type === 'outlier'), true);
});
