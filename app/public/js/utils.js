export function arrayToCsv(data) {
    if (!data || data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(header => JSON.stringify(row[header] || '')).join(','));
    return [headers.join(','), ...rows].join('\n');
}

/**
 * Flattens multi-account data structure to a single array of transactions
 * Handles both formats:
 * - Flat: [{date, amount, ...}]
 * - Nested: [{accountNumber, txns: [{date, amount, ...}]}]
 */
export function flattenMultiAccountData(data) {
    if (!data || data.length === 0) return [];

    // Check if this is multi-account format (has accountNumber and txns fields)
    const firstItem = data[0];
    if (firstItem && firstItem.accountNumber !== undefined && Array.isArray(firstItem.txns)) {
        // Multi-account format - flatten it
        const flattened = [];
        data.forEach(account => {
            if (account.txns && Array.isArray(account.txns)) {
                account.txns.forEach(txn => {
                    // Standardize date to YYYY-MM-DD
                    const dateStr = txn.date ? (txn.date.includes('T') ? txn.date.split('T')[0] : txn.date) : '';

                    flattened.push({
                        accountNumber: account.accountNumber,
                        ...txn,
                        date: dateStr
                    });
                });
            }
        });
        return flattened;
    }

    // Already flat format
    return data;
}
