import type { Transaction } from './types.js';

/** Matches dashboard UI: excluded from budgets, projections, and analytics when either flag is set. */
export function isTransactionIgnored(txn: Transaction): boolean {
    return txn.status === 'ignored' || txn.isIgnored === true;
}
