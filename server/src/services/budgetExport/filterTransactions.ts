import type { Transaction } from '@app/shared';
import { isTransactionIgnored } from '@app/shared';

/** Transactions eligible for outbound budget export (current run). */
export function transactionsForBudgetExport(transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => {
    if (isTransactionIgnored(t)) return false;
    if (t.status !== 'completed') return false;
    if (t.isInternalTransfer || t.txnType === 'internal_transfer') return false;
    return true;
  });
}
