import type { Account, Transaction } from '@app/shared';
import { assignBatchContentIdsFromTransactions, parseTabularRows, type TabularImportProfileV1 } from '@app/shared';

export function parseTabularSpreadsheet(
    rows: any[][],
    profile: TabularImportProfileV1,
    logs: string[],
    defaultAccountNumber: string
): { transactions: Transaction[]; accounts: Account[] } {
    const { transactions, accounts } = parseTabularRows(rows, profile, logs, defaultAccountNumber, (txn) => {
        txn.sourceRef = 'tabular-import';
    });
    assignBatchContentIdsFromTransactions(transactions, {
        providerFallback: profile.provider ?? 'imported',
        accountFallback: defaultAccountNumber,
    });
    return { transactions, accounts };
}
