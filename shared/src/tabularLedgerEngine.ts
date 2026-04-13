import type { Account, Transaction } from './types.js';
import type {
    ColumnRef,
    TabularFieldMapping,
    TabularImportProfileV1,
    TabularDateFormat,
    TabularMappableTxnField,
    TabularAmountPolarityFilter,
} from './tabularImportProfile.js';
import { DEFAULT_LEDGER_FOOTER_STOP_MARKERS } from './tabularImportProfile.js';
import {
    cellLooksLikeNonNumericAmount,
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

/** Widest row length from fromRow through end of rows (at least 1). Avoids rejecting valid column indices when early rows are ragged or short. */
export function maxColumnCountInRows(rows: any[][], fromRow: number): number {
    let m = 0;
    const start = Math.max(0, fromRow);
    for (let r = start; r < rows.length; r++) {
        const row = rows[r];
        if (row && row.length > m) m = row.length;
    }
    return Math.max(m, 1);
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

/**
 * Multiply amounts by -1 when `applyNegate`, then apply polarity filter.
 * Callers set `applyNegate` from {@link TabularImportProfileV1.negateParsedAmounts} === true only.
 * Returns null if the row should be skipped (income/expense filter).
 */
export function finalizeTabularAmounts(
    amount: number,
    chargedAmount: number,
    originalAmount: number,
    profile: Pick<TabularImportProfileV1, 'tabularAmountPolarityFilter'>,
    applyNegate: boolean
): { amount: number; chargedAmount: number; originalAmount: number } | null {
    let a = amount;
    let c = chargedAmount;
    let o = originalAmount;
    if (applyNegate) {
        a = -a;
        c = -c;
        o = -o;
    }
    const pol: TabularAmountPolarityFilter = profile.tabularAmountPolarityFilter ?? 'all';
    if (pol === 'expense_only' && a > 0) return null;
    if (pol === 'income_only' && a < 0) return null;
    return { amount: a, chargedAmount: c, originalAmount: o };
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

function detectLedgerInstallments(
    description: string,
    row: any[],
    headerRow: any[],
    maxCols: number,
    colExtra: number | null,
    optMaps: TabularFieldMapping[] | undefined
): { number: number; total: number } | undefined {
    const texts: string[] = [description];
    if (colExtra !== null) texts.push(normalizeCellText(row[colExtra]));
    for (const m of optMaps ?? []) {
        const idx = resolveColumnIndex(m.column, headerRow, maxCols);
        if (idx !== null) texts.push(normalizeCellText(row[idx]));
    }
    for (const text of texts) {
        const instMatch = text.match(/תשלום\s*(\d+)\s*מתוך\s*(\d+)/);
        if (instMatch) {
            return { number: parseInt(instMatch[1], 10), total: parseInt(instMatch[2], 10) };
        }
    }
    return undefined;
}

function applyOneMappedField(
    txn: Transaction,
    raw: unknown,
    field: TabularMappableTxnField,
    dateFmt: TabularDateFormat | undefined,
    opts?: { skipTypeIfInstallments?: boolean }
): void {
    switch (field) {
        case 'memo': {
            const s = normalizeCellText(raw);
            if (s) txn.memo = txn.memo ? `${txn.memo} · ${s}` : s;
            break;
        }
        case 'category':
            txn.category = normalizeCellText(raw) || undefined;
            break;
        case 'externalId': {
            const s = normalizeCellText(raw);
            if (s) txn.externalId = s;
            break;
        }
        case 'voucherNumber': {
            const s = normalizeCellText(raw);
            if (s) txn.voucherNumber = s;
            break;
        }
        case 'type': {
            if (opts?.skipTypeIfInstallments && txn.type === 'installments') break;
            txn.type = normalizeCellText(raw) || undefined;
            break;
        }
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
        case 'status': {
            const v = normalizeCellText(raw).toLowerCase();
            if (v === 'completed' || v === 'pending' || v === 'ignored') {
                txn.status = v;
            }
            break;
        }
        default:
            break;
    }
}

export function applyOptionalFieldMappings(
    txn: Transaction,
    row: any[],
    mappings: TabularFieldMapping[] | undefined,
    headerRow: any[],
    maxCols: number,
    dateFmt: TabularDateFormat | undefined,
    opts?: { skipTypeIfInstallments?: boolean }
): void {
    if (!mappings || mappings.length === 0) return;
    for (const m of mappings) {
        const idx = resolveColumnIndex(m.column, headerRow, maxCols);
        if (idx === null) continue;
        applyOneMappedField(txn, row[idx], m.field, dateFmt, opts);
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
    const maxCols = maxColumnCountInRows(rows, hi);

    const cols = profile.columns;
    const colDate = resolveColumnIndex(cols.date, headerRow, maxCols);
    const colDesc = resolveColumnIndex(cols.description, headerRow, maxCols);
    const colCharged = cols.chargedAmount ? resolveColumnIndex(cols.chargedAmount, headerRow, maxCols) : null;
    const colOrigAmt = cols.originalAmount ? resolveColumnIndex(cols.originalAmount, headerRow, maxCols) : null;
    const colChgCur = cols.chargedCurrency ? resolveColumnIndex(cols.chargedCurrency, headerRow, maxCols) : null;

    if (colDate === null || colDesc === null || colCharged === null || colOrigAmt === null) {
        logs.push(
            `Tabular profile (ledger): could not resolve required columns (date, description, originalAmount, chargedAmount)`
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
    const extraTarget = profile.extraDetailsTargetField;

    let loggedNonNumericCharged = false;

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

        const chargedRaw = row[colCharged];
        const chargedSigned = parseNumberCell(chargedRaw);
        if (chargedSigned === 0) {
            if (!loggedNonNumericCharged && cellLooksLikeNonNumericAmount(chargedRaw)) {
                const sample = normalizeCellText(chargedRaw).slice(0, 80);
                logs.push(
                    `Tabular profile (ledger): expected a number in the charged amount column, but the cell contains non-numeric text (e.g. "${sample}"). Map that column to the numeric charged-amount field.`
                );
                loggedNonNumericCharged = true;
            }
            continue;
        }

        const origCur =
            colOrigCur !== null
                ? currencySymbolToIso(normalizeCellText(row[colOrigCur]))
                : defaultCur;
        const chgCur =
            colChgCur !== null
                ? currencySymbolToIso(normalizeCellText(row[colChgCur]))
                : defaultCur;

        let originalSigned = parseNumberCell(row[colOrigAmt]);
        if (originalSigned === 0) {
            originalSigned = chargedSigned;
        }

        const extraRaw = colExtra !== null ? normalizeCellText(row[colExtra]) : '';

        const applyNegate = profile.negateParsedAmounts === true;
        const fin = finalizeTabularAmounts(
            chargedSigned,
            chargedSigned,
            originalSigned,
            profile,
            applyNegate
        );
        if (fin === null) continue;

        const installments = detectLedgerInstallments(
            description,
            row,
            headerRow,
            maxCols,
            colExtra,
            optMaps
        );

        const category =
            colCategory !== null ? String(row[colCategory] ?? '').trim() || undefined : undefined;

        const txn: Transaction = {
            id: '',
            date: date.toISOString(),
            processedDate: date.toISOString(),
            description,
            amount: fin.amount,
            chargedAmount: fin.chargedAmount,
            originalAmount: fin.originalAmount,
            originalCurrency: origCur,
            chargedCurrency: chgCur,
            status: 'completed',
            provider,
            accountNumber: defaultAccountNumber,
            txnType: fin.amount > 0 ? 'income' : 'expense',
            type: installments ? 'installments' : 'normal',
            installments,
            ...(category ? { category } : {}),
        };

        if (extraRaw && colExtra !== null) {
            if (extraTarget) {
                applyOneMappedField(txn, extraRaw, extraTarget, dateFmt, {
                    skipTypeIfInstallments: !!installments,
                });
            } else {
                txn.memo = extraRaw;
            }
        }

        applyOptionalFieldMappings(txn, row, optMaps, headerRow, maxCols, dateFmt, {
            skipTypeIfInstallments: !!installments,
        });

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
