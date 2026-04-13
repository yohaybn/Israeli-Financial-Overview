import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as xlsx from '@e965/xlsx';
import { ImportService } from './importService.js';

function headerRow(): string[] {
    return [
        'תאריך רכישה',
        'שם בית עסק',
        'סכום עסקה',
        'מטבע עסקה',
        'סכום חיוב',
        'מטבע חיוב',
        "מס' שובר",
        'פירוט נוסף',
    ];
}

async function withTempXlsx(
    sheetName: string,
    rows: any[][],
    filename: string
): Promise<{ dir: string; filePath: string }> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'isracard-import-'));
    const filePath = path.join(dir, filename);
    const ws = xlsx.utils.aoa_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    await writeFile(filePath, buf);
    return { dir, filePath };
}

describe('ImportService Isracard XLSX', () => {
    it('parses DD.MM.YY, comma amounts, USD row, installment memo, stops before future section', async () => {
        const rows: any[][] = [
            [''],
            ['קורפוריט - זהב - 1254'],
            ['**עסקאות למועד חיוב**'],
            headerRow(),
            ['26.12.25', 'Shop A', '1,000.00', '₪', '500.00', '₪', 'V1', ''],
            ['15.01.26', 'US Store', '100.00', '$', '350.00', '₪', 'V2', 'תשלום 2 מתוך 12'],
            ['**עסקאות בחיוב עתידי**'],
            ['01.02.26', 'Should not import', '10.00', '₪', '10.00', '₪', 'SKIP', ''],
        ];

        const { dir, filePath } = await withTempXlsx('פירוט עסקאות', rows, 'stmt.xlsx');
        try {
            const svc = new ImportService();
            const r = await svc.importFile(filePath, undefined, false, undefined);
            assert.equal(r.success, true);
            assert.equal(r.transactions?.length, 2);

            const t0 = r.transactions![0];
            assert.equal(t0.provider, 'isracard');
            assert.equal(t0.accountNumber, '1254');
            assert.equal(t0.voucherNumber, 'V1');
            assert.equal(t0.externalId, 'V1');
            assert.equal(t0.memo, undefined);
            assert.ok(/^[a-f0-9]{32}$/.test(t0.id));
            assert.equal(t0.amount, -500);
            assert.equal(t0.originalCurrency, 'ILS');
            assert.equal(t0.chargedCurrency, 'ILS');

            const t1 = r.transactions![1];
            assert.equal(t1.voucherNumber, 'V2');
            assert.equal(t1.externalId, 'V2');
            assert.equal(t1.amount, -350);
            assert.equal(t1.originalCurrency, 'USD');
            assert.equal(t1.type, 'installments');
            assert.ok(t1.memo?.includes('תשלום 2 מתוך 12'));
        } finally {
            await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
    });

    it('stops at monthly total footer row', async () => {
        const rows: any[][] = [
            [''],
            headerRow(),
            ['20.01.26', 'Before total', '50.00', '₪', '50.00', '₪', 'A1', ''],
            ['**סה"כ לחיוב החודש**', '', '', '', '', '', '', ''],
            ['21.01.26', 'After total', '99.00', '₪', '99.00', '₪', 'BAD', ''],
        ];

        const { dir, filePath } = await withTempXlsx('פירוט עסקאות', rows, 'footer.xlsx');
        try {
            const svc = new ImportService();
            const r = await svc.importFile(filePath, undefined, false, undefined);
            assert.equal(r.success, true);
            assert.equal(r.transactions?.length, 1);
            assert.equal(r.transactions![0].voucherNumber, 'A1');
        } finally {
            await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
    });

    it('uses filename 1254_MM_YYYY.xlsx for account when no override', async () => {
        const rows: any[][] = [headerRow(), ['20.01.26', 'X', '10.00', '₪', '10.00', '₪', 'F1', '']];
        const { dir, filePath } = await withTempXlsx('פירוט עסקאות', rows, '1254_01_2026.xlsx');
        try {
            const svc = new ImportService();
            const r = await svc.importFile(filePath, undefined, false, undefined);
            assert.equal(r.success, true);
            assert.equal(r.transactions![0].accountNumber, '1254');
        } finally {
            await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
    });

    it('relaxed Isracard path when providerTarget is isracard (חיוב בשקלים instead of סכום חיוב)', async () => {
        const relaxedHeader = [
            'תאריך רכישה',
            'שם בית עסק',
            'סכום עסקה',
            'מטבע עסקה',
            'חיוב בשקלים',
            'מטבע חיוב',
            "מס' שובר",
            'פירוט נוסף',
        ];
        const rows: any[][] = [relaxedHeader, ['20.01.26', 'Y', '10.00', '₪', '10.00', '₪', 'R1', '']];
        const { dir, filePath } = await withTempXlsx('Sheet1', rows, 'hint.xlsx');
        try {
            const svc = new ImportService();
            const auto = await svc.importFile(filePath, undefined, false, undefined);
            assert.equal(auto.success, false);

            const hinted = await svc.importFile(filePath, undefined, false, 'isracard');
            assert.equal(hinted.success, true);
            assert.equal(hinted.transactions?.length, 1);
            assert.equal(hinted.transactions![0].voucherNumber, 'R1');
            assert.equal(hinted.transactions![0].amount, -10);
        } finally {
            await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
    });

    it('flips negative cells like tabular negateParsedAmounts (×−1 on parsed)', async () => {
        const rows: any[][] = [
            headerRow(),
            ['25.05.25', 'WWW.ALIEXPRESS.COM', '-94.7', '$', '-341.2', '₪', 'AX99', ''],
        ];
        const { dir, filePath } = await withTempXlsx('פירוט עסקאות', rows, 'mixed-sign.xlsx');
        try {
            const svc = new ImportService();
            const r = await svc.importFile(filePath, undefined, false, undefined);
            assert.equal(r.success, true);
            assert.equal(r.transactions?.length, 1);
            const t = r.transactions![0];
            assert.equal(t.amount, 341.2);
            assert.equal(t.chargedAmount, 341.2);
            assert.equal(t.originalAmount, 94.7);
            assert.equal(t.txnType, 'income');
        } finally {
            await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
    });
});
