import type { Account, Transaction } from '@app/shared';
import { assignTransactionIdFromTxn, parseTabularRows, type TabularImportProfileV1 } from '@app/shared';

export function parseTabularSpreadsheet(
    rows: any[][],
    profile: TabularImportProfileV1,
    logs: string[],
    defaultAccountNumber: string
): { transactions: Transaction[]; accounts: Account[] } {
    return parseTabularRows(rows, profile, logs, defaultAccountNumber, (txn) => {
        const a = assignTransactionIdFromTxn(txn, { sourceRef: 'tabular-import' });
        txn.id = a.id;
        if (a.externalId) txn.externalId = a.externalId;
        if (a.sourceRef) txn.sourceRef = a.sourceRef;
    });
}
