import { describe, it } from 'node:test';
import assert from 'node:assert';
import { localAccountKey } from './accountKey.js';
import { transactionsForBudgetExport } from './filterTransactions.js';
import type { Transaction } from '@app/shared';

function txn(p: Partial<Transaction>): Transaction {
  return {
    id: p.id || '1',
    date: p.date || '2024-01-01',
    processedDate: p.processedDate || '2024-01-01',
    description: p.description || 'x',
    amount: p.amount ?? -10,
    originalAmount: p.originalAmount ?? -10,
    originalCurrency: p.originalCurrency || 'ILS',
    chargedAmount: p.chargedAmount ?? p.amount ?? -10,
    status: p.status ?? 'completed',
    provider: p.provider || 'hapoalim',
    accountNumber: p.accountNumber || '123',
    ...p,
  } as Transaction;
}

describe('budgetExport accountKey', () => {
  it('builds provider:accountNumber', () => {
    assert.strictEqual(localAccountKey(txn({ provider: 'foo', accountNumber: 'bar' })), 'foo:bar');
  });
});

describe('budgetExport filterTransactions', () => {
  it('drops ignored and pending and internal transfers', () => {
    const out = transactionsForBudgetExport([
      txn({ id: 'a', status: 'completed' }),
      txn({ id: 'b', status: 'ignored' }),
      txn({ id: 'c', status: 'pending' }),
      txn({ id: 'd', isInternalTransfer: true }),
      txn({ id: 'e', txnType: 'internal_transfer' }),
    ]);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].id, 'a');
  });
});
