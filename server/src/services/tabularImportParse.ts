import { v4 as uuidv4 } from 'uuid';
import type { Account, Transaction } from '@app/shared';
import { parseTabularRows, type TabularImportProfileV1 } from '@app/shared';

export function parseTabularSpreadsheet(
    rows: any[][],
    profile: TabularImportProfileV1,
    logs: string[],
    defaultAccountNumber: string
): { transactions: Transaction[]; accounts: Account[] } {
    return parseTabularRows(rows, profile, logs, defaultAccountNumber, () => uuidv4());
}
