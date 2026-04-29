import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMonthlyNetFlowProjection } from './analytics/monthlyNetProjection.js';

test('computeMonthlyNetFlowProjection empty', () => {
    const r = computeMonthlyNetFlowProjection([]);
    assert.equal(r.showProjection, false);
    assert.equal(r.averageNet, null);
    assert.equal(r.cumulativeIfAverageContinues, null);
});

test('computeMonthlyNetFlowProjection single month — no strong projection', () => {
    const r = computeMonthlyNetFlowProjection([{ month: '2025-01', net: 1000 }]);
    assert.equal(r.showProjection, false);
    assert.equal(r.lookbackUsed, 1);
    assert.equal(r.averageNet, 1000);
    assert.equal(r.cumulativeIfAverageContinues, 6000);
});

test('computeMonthlyNetFlowProjection two months average and cumulative', () => {
    const r = computeMonthlyNetFlowProjection(
        [
            { month: '2025-01', net: 1000 },
            { month: '2025-02', net: 3000 },
        ],
        { horizonMonths: 6, lookbackMonths: 6 }
    );
    assert.equal(r.showProjection, true);
    assert.equal(r.lookbackUsed, 2);
    assert.equal(r.averageNet, 2000);
    assert.equal(r.cumulativeIfAverageContinues, 12000);
});

test('computeMonthlyNetFlowProjection deficit', () => {
    const r = computeMonthlyNetFlowProjection(
        [
            { month: '2025-01', net: -500 },
            { month: '2025-02', net: -1500 },
        ],
        { horizonMonths: 3 }
    );
    assert.equal(r.showProjection, true);
    assert.equal(r.averageNet, -1000);
    assert.equal(r.cumulativeIfAverageContinues, -3000);
});

test('computeMonthlyNetFlowProjection lookback caps at last N months', () => {
    const months = [100, 200, 300, 400, 500, 600, 700, 800].map((net, i) => ({
        month: `2025-${String(i + 1).padStart(2, '0')}`,
        net,
    }));
    const r = computeMonthlyNetFlowProjection(months, { lookbackMonths: 3, horizonMonths: 2 });
    assert.equal(r.lookbackUsed, 3);
    assert.equal(r.averageNet, 700);
    assert.equal(r.cumulativeIfAverageContinues, 1400);
});

test('computeMonthlyNetFlowProjection unsorted input is normalized', () => {
    const r = computeMonthlyNetFlowProjection([
        { month: '2025-03', net: 30 },
        { month: '2025-01', net: 10 },
        { month: '2025-02', net: 20 },
    ]);
    assert.equal(r.averageNet, 20);
});
