import type { Account, Transaction } from './types.js';
import type { TabularImportProfileV1 } from './tabularImportProfile.js';
import { applyOptionalFieldMappings, parseLedgerRowsToTransactions, resolveColumnIndex } from './tabularLedgerEngine.js';
import { isLedgerStyleColumns } from './tabularImportProfile.js';
import { parseDateCell, parseNumberCell } from './tabularCells.js';

export function parseSimpleRowsToTransactions(
    rows: any[][],
    profile: TabularImportProfileV1,
    logs: string[],
    defaultAccountNumber: string,
    finalizeTransactionId: (txn: Transaction) => void
): { transactions: Transaction[]; accounts: Account[] } {
    const transactions: Transaction[] = [];
    const hi = profile.headerRowIndex;
    if (hi < 0 || hi >= rows.length) {
        logs.push(`Tabular profile: header row ${hi} is out of range`);
        return { transactions: [], accounts: [] };
    }

    const headerRow = rows[hi] || [];
    const maxCols = Math.max(
        headerRow.length,
        ...rows.slice(hi, hi + 50).map((r) => (r ? r.length : 0))
    );

    const colDate = resolveColumnIndex(profile.columns.date, headerRow, maxCols);
    const colDesc = resolveColumnIndex(profile.columns.description, headerRow, maxCols);
    if (colDate === null || colDesc === null) {
        logs.push(
            `Tabular profile: could not resolve columns (date→${colDate}, description→${colDesc})`
        );
        return { transactions: [], accounts: [] };
    }

    const mode = profile.amountMode ?? 'single';
    let colAmount: number | null = null;
    let colCredit: number | null = null;
    let colDebit: number | null = null;

    if (mode === 'single' && profile.columns.amount) {
        colAmount = resolveColumnIndex(profile.columns.amount, headerRow, maxCols);
        if (colAmount === null) {
            logs.push('Tabular profile: could not resolve amount column');
            return { transactions: [], accounts: [] };
        }
    } else if (mode === 'credit_debit') {
        if (!profile.columns.credit || !profile.columns.debit) {
            logs.push('Tabular profile: credit_debit mode requires credit and debit columns');
            return { transactions: [], accounts: [] };
        }
        colCredit = resolveColumnIndex(profile.columns.credit, headerRow, maxCols);
        colDebit = resolveColumnIndex(profile.columns.debit, headerRow, maxCols);
        if (colCredit === null || colDebit === null) {
            logs.push('Tabular profile: could not resolve credit/debit columns');
            return { transactions: [], accounts: [] };
        }
    }

    let colCategory: number | null = null;
    if (profile.columns.category) {
        colCategory = resolveColumnIndex(profile.columns.category, headerRow, maxCols);
    }

    const skip = Math.max(0, profile.skipDataRows ?? 0);
    const start = hi + 1 + skip;
    const provider = profile.provider ?? 'imported';
    const currency = profile.currency ?? 'ILS';
    const dateFmt = profile.dateFormat;
    const optMaps = profile.optionalFieldMappings;

    for (let i = start; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const dateRaw = row[colDate!];
        const date = parseDateCell(dateRaw, dateFmt);
        if (!date) continue;

        const description = String(row[colDesc!] ?? '').trim();
        if (!description) continue;

        let amount = 0;
        if (mode === 'single' && colAmount !== null) {
            amount = parseNumberCell(row[colAmount]);
        } else if (mode === 'credit_debit' && colCredit !== null && colDebit !== null) {
            const credit = parseNumberCell(row[colCredit]);
            const debit = parseNumberCell(row[colDebit]);
            amount = credit > 0 ? credit : debit > 0 ? -debit : credit - debit;
        }

        if (amount === 0) continue;

        const category =
            colCategory !== null ? String(row[colCategory] ?? '').trim() || undefined : undefined;

        const txn: Transaction = {
            id: '',
            date: date.toISOString(),
            processedDate: date.toISOString(),
            description,
            amount,
            chargedAmount: amount,
            originalAmount: amount,
            originalCurrency: currency,
            status: 'completed',
            provider,
            accountNumber: defaultAccountNumber,
            ...(category ? { category } : {}),
        };

        applyOptionalFieldMappings(txn, row, optMaps, headerRow, maxCols, dateFmt);

        finalizeTransactionId(txn);
        transactions.push(txn);
    }

    const accounts: Account[] =
        transactions.length > 0
            ? [{ accountNumber: defaultAccountNumber, provider, balance: 0, currency }]
            : [];

    logs.push(`Tabular profile: parsed ${transactions.length} transactions`);
    return { transactions, accounts };
}

/** Parse spreadsheet rows using the profile (ledger or simple). */
export function parseTabularRows(
    rows: any[][],
    profile: TabularImportProfileV1,
    logs: string[],
    defaultAccountNumber: string,
    finalizeTransactionId: (txn: Transaction) => void
): { transactions: Transaction[]; accounts: Account[] } {
    if (isLedgerStyleColumns(profile.columns)) {
        return parseLedgerRowsToTransactions(rows, profile, logs, defaultAccountNumber, finalizeTransactionId);
    }
    return parseSimpleRowsToTransactions(rows, profile, logs, defaultAccountNumber, finalizeTransactionId);
}
