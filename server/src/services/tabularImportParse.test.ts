import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTabularSpreadsheet } from './tabularImportParse.js';
import type { TabularImportProfileV1 } from '@app/shared';
import { TABULAR_IMPORT_PROFILE_FORMAT, TABULAR_IMPORT_PROFILE_VERSION } from '@app/shared';

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

test('parseTabularSpreadsheet ledger columns (required + optional memo)', () => {
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
    assert.equal(transactions.length, 2);
    assert.ok(transactions[0].id.length > 0);
    assert.equal(transactions[0].amount, -100);
    assert.equal(transactions[0].originalCurrency, 'ILS');
    assert.equal(transactions[0].chargedCurrency, 'ILS');
    assert.equal(transactions[0].txnType, 'expense');
    assert.equal(transactions[1].installments?.number, 3);
    assert.equal(transactions[1].installments?.total, 12);
    assert.equal(transactions[1].originalCurrency, 'USD');
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
