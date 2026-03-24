import type { Transaction } from './types.js';

const CSV_COLUMNS: (keyof Transaction)[] = [
    'id',
    'date',
    'processedDate',
    'description',
    'memo',
    'amount',
    'originalAmount',
    'originalCurrency',
    'chargedAmount',
    'chargedCurrency',
    'status',
    'type',
    'installments',
    'category',
    'provider',
    'accountNumber',
    'txnType',
    'isIgnored',
    'isInternalTransfer',
    'isSubscription',
    'subscriptionInterval',
    'excludeFromSubscriptions',
];

function csvEscapeCell(value: unknown): string {
    if (value === undefined || value === null) return '';
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/** CSV with UTF-8 BOM for Excel (Hebrew-friendly). */
export function transactionsToCsv(transactions: Transaction[]): string {
    const header = CSV_COLUMNS.join(',');
    const lines = transactions.map((t) =>
        CSV_COLUMNS.map((col) => csvEscapeCell((t as unknown as Record<string, unknown>)[col])).join(',')
    );
    return '\ufeff' + [header, ...lines].join('\r\n');
}

export function transactionsToJson(transactions: Transaction[]): string {
    return JSON.stringify(transactions, null, 2);
}
