import type { Account, Transaction } from './types.js';
import type {
    ColumnRef,
    TabularFieldMapping,
    TabularImportProfileV1,
    TabularDateFormat,
} from './tabularImportProfile.js';
import { DEFAULT_LEDGER_FOOTER_STOP_MARKERS } from './tabularImportProfile.js';
import {
    currencySymbolToIso,
    normalizeCellText,
    parseDateCell,
    parseNumberCell,
} from './tabularCells.js';

function normalizeHeader(s: string): string {
    return String(s ?? '')
        .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
        .trim()
        .toLowerCase();
}

export function resolveColumnIndex(ref: ColumnRef, headerRow: any[], maxCols: number): number | null {
    if (ref.kind === 'index') {
        if (ref.index < 0 || ref.index >= maxCols) return null;
        return ref.index;
    }
    const want = normalizeHeader(ref.match);
    if (!want) return null;
    for (let i = 0; i < headerRow.length; i++) {
        const h = normalizeHeader(String(headerRow[i] ?? ''));
        if (!h) continue;
        if (ref.exact) {
            if (h === want) return i;
        } else if (h.includes(want) || want.includes(h)) {
            return i;
        }
    }
    return null;
}

function ledgerStopMarkers(profile: TabularImportProfileV1): string[] {
    if (profile.stopWhenFirstColumnIncludes && profile.stopWhenFirstColumnIncludes.length > 0) {
        return profile.stopWhenFirstColumnIncludes;
    }
    if (profile.defaultLedgerFooterStops === true) {
        return [...DEFAULT_LEDGER_FOOTER_STOP_MARKERS];
    }
    return [];
}

export function applyOptionalFieldMappings(
    txn: Transaction,
    row: any[],
    mappings: TabularFieldMapping[] | undefined,
    headerRow: any[],
    maxCols: number,
    dateFmt: TabularDateFormat | undefined
): void {
    if (!mappings || mappings.length === 0) return;
    for (const m of mappings) {
        const idx = resolveColumnIndex(m.column, headerRow, maxCols);
        if (idx === null) continue;
        const raw = row[idx];
        switch (m.field) {
            case 'memo': {
                const s = normalizeCellText(raw);
                if (s) {
                    txn.memo = txn.memo ? `${txn.memo} · ${s}` : s;
                }
                break;
            }
            case 'category':
                txn.category = normalizeCellText(raw) || undefined;
                break;
            case 'type':
                txn.type = normalizeCellText(raw) || undefined;
                break;
            case 'txnType': {
                const tv = normalizeCellText(raw).toLowerCase();
                if (tv === 'expense' || tv === 'income' || tv === 'internal_transfer' || tv === 'normal') {
                    txn.txnType = tv;
                }
                break;
            }
            case 'processedDate': {
                const pd = parseDateCell(raw, dateFmt);
                if (pd) txn.processedDate = pd.toISOString();
                break;
            }
            default:
                break;
        }
    }
}

export function parseLedgerRowsToTransactions(
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

    const cols = profile.columns;
    const colDate = resolveColumnIndex(cols.date, headerRow, maxCols);
    const colDesc = resolveColumnIndex(cols.description, headerRow, maxCols);
    const colCharged = cols.chargedAmount ? resolveColumnIndex(cols.chargedAmount, headerRow, maxCols) : null;
    const colOrigAmt = cols.originalAmount ? resolveColumnIndex(cols.originalAmount, headerRow, maxCols) : null;
    const colChgCur = cols.chargedCurrency ? resolveColumnIndex(cols.chargedCurrency, headerRow, maxCols) : null;

    if (colDate === null || colDesc === null || colCharged === null || colOrigAmt === null || colChgCur === null) {
        logs.push(
            `Tabular profile (ledger): could not resolve required columns (date, description, originalAmount, chargedAmount, chargedCurrency)`
        );
        return { transactions: [], accounts: [] };
    }

    const colOrigCur = cols.originalCurrency ? resolveColumnIndex(cols.originalCurrency, headerRow, maxCols) : null;
    const colExtra = cols.extraDetails ? resolveColumnIndex(cols.extraDetails, headerRow, maxCols) : null;
    const colCategory = cols.category ? resolveColumnIndex(cols.category, headerRow, maxCols) : null;

    const skip = Math.max(0, profile.skipDataRows ?? 0);
    const start = hi + 1 + skip;
    const provider = profile.provider ?? 'imported';
    const defaultCur = profile.currency ?? 'ILS';
    const dateFmt = profile.dateFormat;
    const stops = ledgerStopMarkers(profile);
    const optMaps = profile.optionalFieldMappings;

    for (let i = start; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const first = normalizeCellText(row[0]);
        if (stops.some((m) => first.includes(m))) {
            break;
        }

        const dateRaw = row[colDate];
        const date = parseDateCell(dateRaw, dateFmt);
        if (!date) {
            if (first.includes('סה"כ') || first.includes('סה״כ')) {
                break;
            }
            continue;
        }

        const description = normalizeCellText(row[colDesc]);
        if (!description) continue;

        const chargedAbs = Math.abs(parseNumberCell(row[colCharged]));
        if (chargedAbs === 0) continue;

        const origCur =
            colOrigCur !== null
                ? currencySymbolToIso(normalizeCellText(row[colOrigCur]))
                : defaultCur;
        const chgCur = currencySymbolToIso(normalizeCellText(row[colChgCur]));

        let originalAbs = Math.abs(parseNumberCell(row[colOrigAmt]));
        if (originalAbs === 0) {
            originalAbs = chargedAbs;
        }

        const extra = colExtra !== null ? normalizeCellText(row[colExtra]) : '';
        const memo = extra || undefined;

        const chargedSigned = -chargedAbs;
        const originalSigned = -originalAbs;

        const instMatch = extra.match(/תשלום\s*(\d+)\s*מתוך\s*(\d+)/);
        const installments = instMatch
            ? { number: parseInt(instMatch[1], 10), total: parseInt(instMatch[2], 10) }
            : undefined;

        const category =
            colCategory !== null ? String(row[colCategory] ?? '').trim() || undefined : undefined;

        const txn: Transaction = {
            id: '',
            date: date.toISOString(),
            processedDate: date.toISOString(),
            description,
            memo,
            amount: chargedSigned,
            chargedAmount: chargedSigned,
            originalAmount: originalSigned,
            originalCurrency: origCur,
            chargedCurrency: chgCur,
            status: 'completed',
            provider,
            accountNumber: defaultAccountNumber,
            txnType: 'expense',
            type: installments ? 'installments' : 'normal',
            installments,
            ...(category ? { category } : {}),
        };

        applyOptionalFieldMappings(txn, row, optMaps, headerRow, maxCols, dateFmt);

        finalizeTransactionId(txn);
        transactions.push(txn);
    }

    logs.push(`Tabular profile (ledger): parsed ${transactions.length} transactions`);
    const accounts: Account[] =
        transactions.length > 0
            ? [{ accountNumber: defaultAccountNumber, provider, balance: 0, currency: 'ILS' }]
            : [];
    return { transactions, accounts };
}
