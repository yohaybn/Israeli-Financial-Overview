
export function jsonToRows(jsonData) {
    const header = ['Account Number', 'Bank', 'Date', 'Amount', 'Description', 'Category', 'Memo', 'Status', 'Identifier'];
    const rows = [header];

    if (!jsonData || !Array.isArray(jsonData)) {
        return rows;
    }

    // Detect format: nested (has txns array) vs flat (individual transactions)
    const isNested = jsonData.some(item => item.txns && Array.isArray(item.txns));

    if (isNested) {
        // Nested format: each item is an account with txns array
        jsonData.forEach(account => {
            const accountNum = account.accountNumber || '';
            const bank = account.bank || '';

            if (account.txns && Array.isArray(account.txns)) {
                account.txns.forEach(txn => {
                    const date = txn.date ? new Date(txn.date).toISOString().split('T')[0] : '';
                    const amount = txn.chargedAmount || 0;
                    const description = (txn.description || '').trim();
                    const identifier = txn.identifier || `f_${date}_${amount}_${description.replace(/\s+/g, '_').toLowerCase()}`;

                    rows.push([
                        accountNum,
                        bank,
                        date,
                        amount,
                        description,
                        txn.category || '',
                        txn.memo || '',
                        txn.status || '',
                        identifier
                    ]);
                });
            }
        });
    } else {
        // Flat format: each item is an individual transaction
        jsonData.forEach(txn => {
            const date = txn.date ? new Date(txn.date).toISOString().split('T')[0] : '';
            const amount = txn.chargedAmount || 0;
            const description = (txn.description || '').trim();
            const identifier = txn.identifier || `f_${date}_${amount}_${description.replace(/\s+/g, '_').toLowerCase()}`;

            rows.push([
                txn.accountNumber || '',
                txn.bank || '',
                date,
                amount,
                description,
                txn.category || '',
                txn.memo || '',
                txn.status || '',
                identifier
            ]);
        });
    }

    return rows;
}


export function jsonToCsv(jsonData) {
    const rows = jsonToRows(jsonData);

    return rows.map(row =>
        row.map(val => {
            if (val === null || val === undefined) return '""';
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
    ).join('\n');
}
