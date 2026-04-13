import type { Transaction } from '@app/shared';

export function localAccountKey(txn: Pick<Transaction, 'provider' | 'accountNumber'>): string {
  return `${txn.provider || 'unknown'}:${txn.accountNumber || 'unknown'}`;
}
