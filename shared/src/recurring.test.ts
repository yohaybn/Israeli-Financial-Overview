import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRecurring } from './financial/recurring.js';
import type { Transaction } from './types.js';

function txn(date: string, description: string, amount: number): Transaction {
    return {
        id: `${date}-${description}`,
        date,
        processedDate: date,
        description,
        amount,
        originalAmount: amount,
        originalCurrency: 'ILS',
        chargedAmount: amount,
        status: 'completed',
        provider: 'test',
        accountNumber: '000',
    };
}

test('detectRecurring: charges around a month boundary (31st / 1st / 2nd) cluster together', () => {
    // A bill that lands on the 31st one month and the 1st-2nd the next is the
    // same recurring item; plain |dayA - dayB| <= 3 clustering used to miss it.
    const transactions = [
        txn('2026-05-31', 'RENT PAYMENT', -5000),
        txn('2026-07-01', 'RENT PAYMENT', -5000),
        txn('2026-08-02', 'RENT PAYMENT', -5000),
    ];
    const { upcoming } = detectRecurring(transactions, '2026-09');
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0].type, 'bill');
    assert.equal(upcoming[0].amount, 5000);
    const expected = new Date(upcoming[0].expectedDate);
    assert.equal(expected.getMonth(), 8); // September (0-based)
    assert.ok([31, 1, 2].includes(expected.getDate()), `unexpected day ${expected.getDate()}`);
});

test('detectRecurring: far-apart days within a month still do not cluster', () => {
    const transactions = [
        txn('2026-05-05', 'SPORADIC', -500),
        txn('2026-06-20', 'SPORADIC', -500),
        txn('2026-07-11', 'SPORADIC', -500),
        txn('2026-08-26', 'SPORADIC', -500),
    ];
    const { upcoming } = detectRecurring(transactions, '2026-09');
    assert.equal(upcoming.length, 0);
});
