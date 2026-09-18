import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeTxnBaselineVariableForecast,
    computeCategoryVariableForecast,
    MIN_DAYS_FOR_PACE_PROJECTION,
} from './financial/variableForecast.js';

test('txn-baseline forecast caps remaining txns by the gap and time left', () => {
    const r = computeTxnBaselineVariableForecast({
        expectedMonthlyTxnCount: 10,
        avgTxnValue: 50,
        currentMonthTxnCount: 4,
        daysInMonth: 30,
        remainingDays: 15,
    });
    // min(gap=6, 10 * 15/30=5) = 5 txns -> 250
    assert.equal(r.forecastTxnCount, 5);
    assert.equal(r.amount, 250);
});

test('txn-baseline forecast returns zero for sub-monthly categories', () => {
    const r = computeTxnBaselineVariableForecast({
        expectedMonthlyTxnCount: 0.5,
        avgTxnValue: 100,
        currentMonthTxnCount: 0,
        daysInMonth: 30,
        remainingDays: 20,
    });
    assert.equal(r.amount, 0);
});

test('category forecast: not the current month -> zero', () => {
    const r = computeCategoryVariableForecast({
        isCurrentMonth: false,
        spent: 1000,
        currentMonthTxnCount: 3,
        daysPassed: 30,
        daysInMonth: 30,
        remainingDays: 0,
    });
    assert.equal(r.amount, 0);
    assert.equal(r.method, undefined);
});

test('category forecast: no baseline early in month -> no naive explosion', () => {
    // One 2,000 charge on the 1st used to extrapolate to ~58,000.
    const r = computeCategoryVariableForecast({
        isCurrentMonth: true,
        spent: 2000,
        currentMonthTxnCount: 1,
        daysPassed: 1,
        daysInMonth: 30,
        remainingDays: 29,
    });
    assert.equal(r.amount, 0);
    assert.equal(r.method, undefined);
});

test('category forecast: no-baseline extrapolation is capped at spend-to-date', () => {
    const r = computeCategoryVariableForecast({
        isCurrentMonth: true,
        spent: 1000,
        currentMonthTxnCount: 2,
        daysPassed: MIN_DAYS_FOR_PACE_PROJECTION,
        daysInMonth: 30,
        remainingDays: 25,
    });
    // naive: 1000/5 * 25 = 5000 -> capped at 1000 (month-end <= 2x spent)
    assert.equal(r.method, 'extrapolation');
    assert.equal(r.amount, 1000);
});

test('category forecast: no-baseline extrapolation under the cap stays naive', () => {
    const r = computeCategoryVariableForecast({
        isCurrentMonth: true,
        spent: 1000,
        currentMonthTxnCount: 5,
        daysPassed: 20,
        daysInMonth: 30,
        remainingDays: 10,
    });
    assert.equal(r.amount, 500); // 50/day * 10
});

test('category forecast: baseline category uses transaction-count method', () => {
    const r = computeCategoryVariableForecast({
        baseline: { isFixed: false, avgMonthlyTxnCount: 8, avgTxnValue: 40 },
        isCurrentMonth: true,
        spent: 120,
        currentMonthTxnCount: 3,
        daysPassed: 15,
        daysInMonth: 30,
        remainingDays: 15,
    });
    assert.equal(r.method, 'transaction_count');
    // min(gap=5, 8*15/30=4) = 4 txns -> 160
    assert.equal(r.amount, 160);
});

test('category forecast: fixed baseline category forecasts nothing variable', () => {
    const r = computeCategoryVariableForecast({
        baseline: { isFixed: true, avgMonthlyTxnCount: 8, avgTxnValue: 40 },
        isCurrentMonth: true,
        spent: 120,
        currentMonthTxnCount: 3,
        daysPassed: 15,
        daysInMonth: 30,
        remainingDays: 15,
    });
    assert.equal(r.amount, 0);
});
