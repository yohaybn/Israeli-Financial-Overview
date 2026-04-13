import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTabularSpreadsheet } from './tabularImportParse.js';
import type { TabularImportProfileV1 } from '@app/shared';
import {
    TABULAR_IMPORT_PROFILE_FORMAT,
    TABULAR_IMPORT_PROFILE_VERSION,
    parseTabularImportProfileJson,
} from '@app/shared';

test('parseTabularSpreadsheet maps rows with single amount column', () => {
    const rows: any[][] = [
        ['Date', 'Desc', 'Amount'],
        ['15/03/2026', 'Coffee', '50'],
        ['16/03/2026', 'Gas', '-120'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        amountMode: 'single',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            amount: { kind: 'index', index: 2 },
        },
        dateFormat: 'dmy_slash',
        provider: 'testbank',
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, '9999');
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].amount, 50);
    assert.equal(transactions[0].provider, 'testbank');
    assert.equal(transactions[1].amount, -120);
});

test('parseTabularSpreadsheet ledger columns (optional column → voucherNumber, installments)', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'מטבע מקור', 'חיוב', 'מטבע חיוב', 'פירוט'],
        ['26.12.25', 'Shop', '100', '₪', '100', '₪', ''],
        ['27.12.25', 'Web', '94.7', '$', '341.2', '₪', 'תשלום 3 מתוך 12'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        dateFormat: 'dmy_dot',
        negateParsedAmounts: true,
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            originalCurrency: { kind: 'index', index: 3 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
        },
        optionalFieldMappings: [{ field: 'voucherNumber', column: { kind: 'index', index: 6 } }],
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, '1254');
    assert.equal(transactions.length, 2);
    assert.ok(transactions[0].id.length > 0);
    assert.equal(transactions[0].amount, -100);
    assert.equal(transactions[0].originalCurrency, 'ILS');
    assert.equal(transactions[0].chargedCurrency, 'ILS');
    assert.equal(transactions[0].txnType, 'expense');
    assert.equal(transactions[1].installments?.number, 3);
    assert.equal(transactions[1].installments?.total, 12);
    assert.equal(transactions[1].originalCurrency, 'USD');
    assert.equal(transactions[1].voucherNumber, 'תשלום 3 מתוך 12');
    assert.equal(transactions[1].memo, undefined);
});

test('parseTabularSpreadsheet ledger: no chargedCurrency column defaults charged currency to ILS', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'מטבע מקור', 'חיוב'],
        ['26.12.25', 'Shop', '100', '₪', '100'],
        ['27.12.25', 'Web', '94.7', '$', '341.2'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        dateFormat: 'dmy_dot',
        negateParsedAmounts: true,
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            originalCurrency: { kind: 'index', index: 3 },
            chargedAmount: { kind: 'index', index: 4 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, '1254');
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].chargedCurrency, 'ILS');
    assert.equal(transactions[1].chargedCurrency, 'ILS');
});

test('parseTabularSpreadsheet ledger: no chargedCurrency uses profile.currency when set', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'חיוב'],
        ['26.12.25', 'Shop', '100', '100'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        currency: 'USD',
        dateFormat: 'dmy_dot',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            chargedAmount: { kind: 'index', index: 3 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, '1254');
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].chargedCurrency, 'USD');
});

test('parseTabularImportProfileJson accepts ledger without chargedCurrency', () => {
    const json = JSON.stringify({
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        dateFormat: 'dmy_dot',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            chargedAmount: { kind: 'index', index: 3 },
        },
    });
    const p = parseTabularImportProfileJson(json);
    assert.equal(p.columns.chargedCurrency, undefined);
});

test('parseTabularSpreadsheet ledger: legacy extraDetails + extraDetailsTargetField', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'מטבע מקור', 'חיוב', 'מטבע חיוב', 'פירוט'],
        ['27.12.25', 'Web', '94.7', '$', '341.2', '₪', 'V-99'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        dateFormat: 'dmy_dot',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            originalCurrency: { kind: 'index', index: 3 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
            extraDetails: { kind: 'index', index: 6 },
        },
        extraDetailsTargetField: 'voucherNumber',
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, '1254');
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].voucherNumber, 'V-99');
    assert.equal(transactions[0].memo, undefined);
});

test('parseTabularSpreadsheet ledger: legacy extraDetails without target → memo', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'מטבע מקור', 'חיוב', 'מטבע חיוב', 'פירוט'],
        ['27.12.25', 'Web', '94.7', '$', '341.2', '₪', 'note only'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        dateFormat: 'dmy_dot',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            originalCurrency: { kind: 'index', index: 3 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
            extraDetails: { kind: 'index', index: 6 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, '1254');
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].memo, 'note only');
});

test('parseTabularSpreadsheet ledger: negateParsedAmounts false keeps spreadsheet sign (income)', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'מטבע מקור', 'חיוב', 'מטבע חיוב'],
        ['26.12.25', 'Shop', '100', '₪', '100', '₪'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        dateFormat: 'dmy_dot',
        negateParsedAmounts: false,
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            originalCurrency: { kind: 'index', index: 3 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, 'x');
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].amount, 100);
    assert.equal(transactions[0].txnType, 'income');
});

test('parseTabularSpreadsheet ledger: without negate, negative cells stay negative (mixed export)', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'מטבע מקור', 'חיוב', 'מטבע חיוב'],
        ['26.12.25', 'WWW.ALIEXPRESS.COM', '-94.7', '$', '-341.2', '₪'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        dateFormat: 'dmy_dot',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            originalCurrency: { kind: 'index', index: 3 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, 'x');
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].amount, -341.2);
    assert.equal(transactions[0].chargedAmount, -341.2);
    assert.equal(transactions[0].originalAmount, -94.7);
    assert.equal(transactions[0].txnType, 'expense');
});

test('parseTabularSpreadsheet ledger: negateParsedAmounts true multiplies +100 by -1 (expense)', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'מטבע מקור', 'חיוב', 'מטבע חיוב'],
        ['26.12.25', 'Shop', '100', '₪', '100', '₪'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        dateFormat: 'dmy_dot',
        negateParsedAmounts: true,
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            originalCurrency: { kind: 'index', index: 3 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, 'x');
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].amount, -100);
    assert.equal(transactions[0].txnType, 'expense');
});

test('parseTabularSpreadsheet ledger: mixed signed column preserved when negateParsedAmounts false', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'מטבע מקור', 'חיוב', 'מטבע חיוב'],
        ['26.12.25', 'A', '50', '₪', '50', '₪'],
        ['27.12.25', 'B', '-30', '₪', '-30', '₪'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        dateFormat: 'dmy_dot',
        negateParsedAmounts: false,
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            originalCurrency: { kind: 'index', index: 3 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, 'x');
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].amount, 50);
    assert.equal(transactions[0].txnType, 'income');
    assert.equal(transactions[1].amount, -30);
    assert.equal(transactions[1].txnType, 'expense');
});

test('parseTabularSpreadsheet ledger: income_only drops expense rows', () => {
    const rows: any[][] = [
        ['תאריך', 'עסק', 'מקור', 'מטבע מקור', 'חיוב', 'מטבע חיוב'],
        ['26.12.25', 'Shop', '100', '₪', '100', '₪'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        provider: 'card',
        dateFormat: 'dmy_dot',
        negateParsedAmounts: true,
        tabularAmountPolarityFilter: 'income_only',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            originalCurrency: { kind: 'index', index: 3 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, 'x');
    assert.equal(transactions.length, 0);
});

test('parseTabularSpreadsheet ledger: charged amount column is currency text → log explains expected number', () => {
    const rows: any[][] = [
        ['Date', 'Desc', 'Orig', 'Cur', 'Charged', 'Cur2'],
        ['15/03/2026', 'Coffee', '100', '₪', '₪', '100'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        dateFormat: 'dmy_slash',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, 'x');
    assert.equal(transactions.length, 0);
    assert.ok(logs.some((l) => l.includes('expected a number') && l.includes('charged amount')));
});

test('parseTabularSpreadsheet credit/debit columns', () => {
    const rows: any[][] = [
        ['תאריך', 'פרטים', 'זכות', 'חובה'],
        ['01/01/2026', 'X', '100', ''],
        ['02/01/2026', 'Y', '', '40'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        amountMode: 'credit_debit',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            credit: { kind: 'index', index: 2 },
            debit: { kind: 'index', index: 3 },
        },
        dateFormat: 'dmy_slash',
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, 'imported');
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].amount, 100);
    assert.equal(transactions[1].amount, -40);
});

test('parseTabularSpreadsheet ledger: comma decimal amounts (IL/EU style)', () => {
    const rows: any[][] = [
        ['Date', 'Desc', 'Orig', 'Cur', 'Charged', 'Cur2'],
        ['15/03/2026', 'Coffee', '12,50', '₪', '12,50', '₪'],
    ];
    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        dateFormat: 'dmy_slash',
        negateParsedAmounts: true,
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
        },
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, 'x');
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].chargedAmount, -12.5);
});

test('parseTabularSpreadsheet ledger: wide rows only after header still resolve high column indices', () => {
    const narrow = ['26.12.25', 'Shop', '100', '₪', '100', '₪'];
    const pad = (row: any[], len: number) => {
        const r = row.slice();
        while (r.length < len) r.push('');
        return r;
    };
    const rows: any[][] = [narrow.map((_, i) => `h${i}`)];
    for (let i = 0; i < 60; i++) rows.push(pad([...narrow], 6));
    rows.push(pad([...narrow], 10));
    rows[rows.length - 1][9] = 'extra';

    const profile: TabularImportProfileV1 = {
        format: TABULAR_IMPORT_PROFILE_FORMAT,
        version: TABULAR_IMPORT_PROFILE_VERSION,
        headerRowIndex: 0,
        dateFormat: 'dmy_dot',
        columns: {
            date: { kind: 'index', index: 0 },
            description: { kind: 'index', index: 1 },
            originalAmount: { kind: 'index', index: 2 },
            chargedAmount: { kind: 'index', index: 4 },
            chargedCurrency: { kind: 'index', index: 5 },
        },
        optionalFieldMappings: [{ field: 'voucherNumber', column: { kind: 'index', index: 9 } }],
    };
    const logs: string[] = [];
    const { transactions } = parseTabularSpreadsheet(rows, profile, logs, 'x');
    assert.ok(transactions.length >= 1);
    assert.equal(transactions[transactions.length - 1].voucherNumber, 'extra');
    assert.equal(transactions[transactions.length - 1].memo, undefined);
});
