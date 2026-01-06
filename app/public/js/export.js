
export function convertToFirefly(transactions) {
    // Firefly III CSV Importer friendly format
    // Headers: Date, Description, Amount, Currency, Foreign Amount, Foreign Currency, Account, Identifier
    const headers = ['Date', 'Description', 'Amount', 'Currency', 'ForeignAmount', 'ForeignCurrency', 'Account', 'Identifier', 'Category'];
    const rows = [headers.join(',')];

    transactions.forEach(t => {
        const date = t.date ? (t.date.includes('T') ? t.date.split('T')[0] : t.date) : new Date().toISOString().split('T')[0];
        const desc = (t.description || '').replace(/"/g, '""');
        const amount = t.chargedAmount || 0;
        const currency = t.chargedCurrency || 'ILS'; // Default to ILS
        const foreignAmount = t.originalAmount;
        const foreignCurrency = t.originalCurrency;
        const account = t.accountNumber || '';
        const id = t.identifier || '';
        const category = (t.category || '').replace(/"/g, '""');

        const row = [
            `"${date}"`,
            `"${desc}"`,
            amount,
            `"${currency}"`,
            foreignAmount || '',
            foreignCurrency || '',
            `"${account}"`,
            `"${id}"`,
            `"${category}"`
        ];
        rows.push(row.join(','));
    });

    return rows.join('\n');
}

export function convertToYnab(transactions) {
    // YNAB CSV Format
    // Headers: Date, Payee, Memo, Outflow, Inflow
    const headers = ['Date', 'Payee', 'Memo', 'Outflow', 'Inflow'];
    const rows = [headers.join(',')];

    transactions.forEach(t => {
        // Date is expected to be YYYY-MM-DD already from utils.flattenMultiAccountData
        const date = t.date ? (t.date.includes('T') ? t.date.split('T')[0] : t.date) : new Date().toISOString().split('T')[0];
        const payee = (t.description || '').replace(/"/g, '""');
        const memo = (t.category || '').replace(/"/g, '""');
        const amount = t.chargedAmount || 0;

        let outflow = '';
        let inflow = '';

        if (amount < 0) {
            outflow = Math.abs(amount).toFixed(2);
        } else {
            inflow = amount.toFixed(2);
        }

        const row = [
            `"${date}"`,
            `"${payee}"`,
            `"${memo}"`,
            outflow,
            inflow
        ];
        rows.push(row.join(','));
    });

    return rows.join('\n');
}
