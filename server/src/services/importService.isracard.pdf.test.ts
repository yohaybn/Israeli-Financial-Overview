import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'fs/promises';
import type { Transaction } from '@app/shared';
import { ImportService } from './importService.js';

function parseIsracardPdfTextFixture(svc: ImportService, text: string, logs: string[], account: string) {
    return (svc as unknown as { parseIsracardPdfText: (t: string, l: string[], a: string) => { transactions: Transaction[] } })
        .parseIsracardPdfText(text, logs, account);
}

const PDF_FIXTURE = `ישראכרט
פירוט עסקאות יולי 2025
1254 | זהב - קורפוריט
חיוב למועד עסקאות
נוסף פירוט שובר מס' חיוב סכום עסקה סכום עסק בית שם רכישה תאריך
573924222 ₪8.50 ₪8.50 ושפע ברכה סופר 27.06.25
קבע הוראת 559258598 ₪120.57 ₪120.57 בריאות הראל-ביטוח 26.06.25
חו"ל אתר
401728760 ₪341.20 $94.70 WWW.ALIEXPRESS.COM 25.05.25
חו"ל אתר
391338868 ₪486.08 $134.91 ALIEXPRESS 25.05.25
12 מתוך 9 תשלום 304076747 ₪30.00 ₪360.00 נפלאות 31.10.24
₪6,152.18 בכרטיס החודש לחיוב סה"כ
עתידי בחיוב עסקאות
999999999 ₪999.00 ₪999.00 לא ייבוא 01.01.99
`;

describe('ImportService Isracard PDF', () => {
    it('parses ILS, foreign, installment, stops at total and future section', () => {
        const svc = new ImportService();
        const logs: string[] = [];
        const r = parseIsracardPdfTextFixture(svc, PDF_FIXTURE, logs, '1254');

        assert.equal(r.transactions.length, 5);
        assert.equal(r.transactions[0].id, 'isracard-573924222');
        assert.equal(r.transactions[0].amount, -8.5);

        const harel = r.transactions.find(t => t.id === 'isracard-559258598');
        assert.ok(harel?.memo?.includes('קבע הוראת'));

        const ali = r.transactions.find(t => t.id === 'isracard-401728760');
        assert.equal(ali?.originalCurrency, 'USD');
        assert.equal(ali?.amount, -341.2);

        const inst = r.transactions.find(t => t.id === 'isracard-304076747');
        assert.equal(inst?.type, 'installments');
        assert.equal(inst?.installments?.total, 12);
        assert.equal(inst?.installments?.number, 9);
    });

    it('imports PDF file via importFile when sample exists', async () => {
        const samplePath = 'c:/Users/yocohen/Downloads/1254_07_2025.pdf';
        try {
            await readFile(samplePath);
        } catch {
            return;
        }
        const svc = new ImportService();
        const r = await svc.importFile(samplePath, undefined, false, undefined);
        assert.equal(r.success, true);
        assert.ok((r.transactions?.length ?? 0) >= 40);
        assert.equal(r.transactions?.[0].provider, 'isracard');
    });
});
