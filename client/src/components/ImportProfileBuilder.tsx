import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { CloudUpload, Eye, FlaskConical, Save, Trash2 } from 'lucide-react';
import * as xlsx from '@e965/xlsx';
import type { Transaction } from '@app/shared';
import { useProviders, getProviderDisplayName } from '../hooks/useProviders';
import {
    TABULAR_IMPORT_PROFILE_FORMAT,
    TABULAR_IMPORT_PROFILE_VERSION,
    TABULAR_MAPPABLE_TXN_FIELDS,
    cellLooksLikeNonNumericAmount,
    normalizeCellText,
    parseDateCell,
    parseNumberCell,
    parseTabularRows,
    type TabularAmountPolarityFilter,
    type TabularDateFormat,
    type TabularImportProfileV1,
    type TabularMappableTxnField,
} from '@app/shared';

type OptionalFieldRow = { id: string; field: TabularMappableTxnField; col: number };

interface ImportProfileBuilderProps {
    isOpen: boolean;
    onClose: () => void;
    /** Persist profile (e.g. POST to server); failures reject so the UI can show an error. */
    onSave: (profileJson: string) => void | Promise<void>;
    /** Full-page layout (no modal overlay); used from import format route. */
    variant?: 'modal' | 'page';
}

function generateDefaultImportProfileName(sheetName: string): string {
    const d = new Date().toISOString().slice(0, 10);
    const sh = sheetName.trim().replace(/\s+/g, ' ').slice(0, 48);
    if (sh) return `Tabular · ${sh} · ${d}`;
    return `Tabular import · ${d}`;
}

/** Excel-style column letter (0 → A, 25 → Z, 26 → AA). */
function excelColLetter(idx: number): string {
    let n = idx + 1;
    let s = '';
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

function colLabel(idx: number, preview: string, style: 'compact' | 'excel' = 'compact'): string {
    const p = preview.replace(/\s+/g, ' ').trim().slice(0, 28);
    if (style === 'excel') {
        const L = excelColLetter(idx);
        return p ? `${L} — ${p}` : L;
    }
    return p ? `${idx}: ${p}` : `${idx}`;
}

/** Localized label for `Transaction` fields used in tabular optional column mapping. */
function transactionFieldLabel(t: TFunction, field: TabularMappableTxnField): string {
    return t(`transaction.fields.${field}`);
}

function errorMessageFromUnknown(e: unknown): string {
    if (e instanceof Error) return e.message || 'Error';
    if (typeof e === 'string') return e;
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}

/** Isracard-style export: title rows, then a table with תאריך רכישה / סכום חיוב / מטבע חיוב (row is often not row 1). */
function tryInferIsraeliCardLedgerMapping(rows: any[][]): {
    headerRowIndex0: number;
    dateCol: number;
    descCol: number;
    lOrigAmtCol: number;
    lOrigCurCol: number | '';
    lChargedCol: number;
    lChgCurCol: number | '';
} | null {
    const scanRows = Math.min(55, rows.length);
    for (let hi = 0; hi < scanRows; hi++) {
        const headerRow = rows[hi];
        if (!headerRow || headerRow.length < 5) continue;
        const cells = headerRow.map((c) => normalizeCellText(c ?? '').replace(/\s+/g, ' ').trim());
        const join = cells.join('|');
        if (!join.includes('תאריך') || !join.includes('חיוב')) continue;

        const find = (pred: (h: string) => boolean): number | null => {
            for (let j = 0; j < cells.length; j++) {
                if (pred(cells[j])) return j;
            }
            return null;
        };

        const dc = find((h) => /תאריך/.test(h) && /רכישה/.test(h));
        const dsc = find((h) => /שם/.test(h) && (/בית/.test(h) || /עסק/.test(h)));
        const oa = find((h) => /סכום/.test(h) && /עסקה/.test(h) && !/חיוב/.test(h));
        const oc = find((h) => /מטבע/.test(h) && /עסקה/.test(h));
        const ca = find((h) => /סכום/.test(h) && /חיוב/.test(h));
        const cc = find((h) => /מטבע/.test(h) && /חיוב/.test(h));

        if (dc === null || dsc === null || oa === null || ca === null) continue;

        return {
            headerRowIndex0: hi,
            dateCol: dc,
            descCol: dsc,
            lOrigAmtCol: oa,
            lOrigCurCol: oc !== null ? oc : '',
            lChargedCol: ca,
            lChgCurCol: cc !== null ? cc : '',
        };
    }
    return null;
}

function applyWorkbookSheetInference(
    wb: xlsx.WorkBook,
    sheet: string,
    setters: {
        setHeaderRowOneBased: (n: number) => void;
        setDateCol: (n: number) => void;
        setDescCol: (n: number) => void;
        setLOrigAmtCol: (n: number) => void;
        setLOrigCurCol: (n: number | '') => void;
        setLChargedCol: (n: number) => void;
        setLChgCurCol: (n: number | '') => void;
    }
) {
    const sh = wb.Sheets[sheet];
    if (!sh) return;
    const r = xlsx.utils.sheet_to_json(sh, { header: 1, raw: false }) as any[][];
    const inferred = tryInferIsraeliCardLedgerMapping(r);
    if (inferred) {
        setters.setHeaderRowOneBased(inferred.headerRowIndex0 + 1);
        setters.setDateCol(inferred.dateCol);
        setters.setDescCol(inferred.descCol);
        setters.setLOrigAmtCol(inferred.lOrigAmtCol);
        setters.setLOrigCurCol(inferred.lOrigCurCol);
        setters.setLChargedCol(inferred.lChargedCol);
        setters.setLChgCurCol(inferred.lChgCurCol);
    } else {
        setters.setHeaderRowOneBased(1);
        setters.setDateCol(0);
        setters.setDescCol(1);
        setters.setLOrigAmtCol(2);
        setters.setLOrigCurCol('');
        setters.setLChargedCol(3);
        setters.setLChgCurCol('');
    }
}

function ProfileSection({ index, title, children }: { index: number; title: string; children: ReactNode }) {
    return (
        <section className="rounded-2xl bg-[#F4F7F6] p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#006837] text-sm font-bold text-white"
                    aria-hidden
                >
                    {index}
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                    <h2 className="text-base font-bold text-gray-900">{title}</h2>
                    {children}
                </div>
            </div>
        </section>
    );
}

const MAX_IMPORT_PROFILE_FILE_BYTES = 10 * 1024 * 1024;

export function ImportProfileBuilder({ isOpen, onClose, onSave, variant = 'modal' }: ImportProfileBuilderProps) {
    const { t, i18n } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [workbook, setWorkbook] = useState<xlsx.WorkBook | null>(null);
    const [sheetName, setSheetName] = useState('');
    const [headerRowOneBased, setHeaderRowOneBased] = useState(1);
    const [dateCol, setDateCol] = useState(0);
    const [descCol, setDescCol] = useState(1);
    const [dateFormat, setDateFormat] = useState<TabularDateFormat>('dmy_dot');
    const [skipDataRows, setSkipDataRows] = useState(0);
    const [negateParsedAmounts, setNegateParsedAmounts] = useState(false);
    const [amountPolarityFilter, setAmountPolarityFilter] = useState<TabularAmountPolarityFilter>('all');
    const [provider, setProvider] = useState('imported');
    const [profileName, setProfileName] = useState('');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const didAutoFillProfileName = useRef(false);
    const [sheetFilter, setSheetFilter] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [lOrigAmtCol, setLOrigAmtCol] = useState(2);
    const [lChargedCol, setLChargedCol] = useState(3);
    const [lChgCurCol, setLChgCurCol] = useState<number | ''>('');
    const [lOrigCurCol, setLOrigCurCol] = useState<number | ''>('');
    const [includeDefaultFooterStops, setIncludeDefaultFooterStops] = useState(true);
    const [optionalFieldRows, setOptionalFieldRows] = useState<OptionalFieldRow[]>([]);
    const [txnTestResults, setTxnTestResults] = useState<Transaction[] | null>(null);
    const [txnTestError, setTxnTestError] = useState<string | null>(null);
    const [txnTestErrorDetail, setTxnTestErrorDetail] = useState<string | null>(null);
    const [txnTestHint, setTxnTestHint] = useState<string | null>(null);
    const [txnTestRunning, setTxnTestRunning] = useState(false);
    const [txnTestLogs, setTxnTestLogs] = useState<string[]>([]);

    const { data: providers = [] } = useProviders();
    const unknownLegacyProviderId = useMemo(() => {
        if (provider === 'imported') return null;
        if (providers.some((p) => p.id === provider)) return null;
        return provider;
    }, [provider, providers]);

    const providerIdSelectOptions = useMemo(
        () => (
            <>
                <option value="imported">{t('explorer.import_profile_provider_generic')}</option>
                {unknownLegacyProviderId ? (
                    <option value={unknownLegacyProviderId}>{unknownLegacyProviderId}</option>
                ) : null}
                {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                        {getProviderDisplayName(p.id, providers, i18n.language)}
                    </option>
                ))}
            </>
        ),
        [t, providers, i18n.language, unknownLegacyProviderId]
    );

    useEffect(() => {
        if (!workbook) {
            didAutoFillProfileName.current = false;
            return;
        }
        if (!sheetName || didAutoFillProfileName.current) return;
        didAutoFillProfileName.current = true;
        setProfileName(generateDefaultImportProfileName(sheetName));
    }, [workbook, sheetName]);

    const readFile = useCallback((file: File | null) => {
        setParseError(null);
        setTxnTestResults(null);
        setTxnTestError(null);
        setTxnTestErrorDetail(null);
        setTxnTestLogs([]);
        setTxnTestHint(null);
        setTxnTestRunning(false);
        setSaveError(null);
        setWorkbook(null);
        if (!file) return;
        if (file.size > MAX_IMPORT_PROFILE_FILE_BYTES) {
            setParseError(t('explorer.import_profile_file_too_large'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const wb = xlsx.read(data, { type: 'array' });
                setWorkbook(wb);
                const first = wb.SheetNames[0] || '';
                setSheetName(first);
                applyWorkbookSheetInference(wb, first, {
                    setHeaderRowOneBased,
                    setDateCol,
                    setDescCol,
                    setLOrigAmtCol,
                    setLOrigCurCol,
                    setLChargedCol,
                    setLChgCurCol,
                });
            } catch (err: unknown) {
                setParseError(err instanceof Error ? err.message : String(err));
            }
        };
        reader.readAsArrayBuffer(file);
    }, [t]);

    const onSheetPick = useCallback((name: string) => {
        setSheetName(name);
        if (!workbook) return;
        applyWorkbookSheetInference(workbook, name, {
            setHeaderRowOneBased,
            setDateCol,
            setDescCol,
            setLOrigAmtCol,
            setLOrigCurCol,
            setLChargedCol,
            setLChgCurCol,
        });
    }, [workbook]);

    const rows = useMemo(() => {
        if (!workbook || !sheetName) return [] as any[][];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        // `raw: false` = formatted values like Excel UI. Default raw:true uses cell.v (often negative for charges)
        // while the sheet shows positive amounts — mapped preview vs parse then disagree.
        return xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false }) as any[][];
    }, [workbook, sheetName]);

    const maxCols = useMemo(() => {
        let m = 0;
        const hi = Math.max(0, headerRowOneBased - 1);
        for (let r = hi; r < rows.length; r++) {
            const row = rows[r];
            if (row && row.length > m) m = row.length;
        }
        return Math.max(m, 1);
    }, [rows, headerRowOneBased]);

    const headerRow = useMemo(() => {
        const hi = headerRowOneBased - 1;
        if (hi < 0 || hi >= rows.length) return [] as any[];
        return rows[hi] || [];
    }, [rows, headerRowOneBased]);

    const colLabelStyle = variant === 'page' ? 'excel' : 'compact';
    const colOptions = useMemo(() => {
        const opts: { value: number; label: string }[] = [];
        for (let j = 0; j < maxCols; j++) {
            opts.push({
                value: j,
                label: colLabel(j, String(headerRow[j] ?? ''), colLabelStyle),
            });
        }
        return opts;
    }, [maxCols, headerRow, colLabelStyle]);

    /** Rows after header + skip (data sample). */
    const previewDataRows = useMemo(() => {
        const hi = headerRowOneBased - 1;
        const start = hi + 1 + skipDataRows;
        const n = variant === 'page' ? 10 : 8;
        return rows.slice(start, start + n);
    }, [rows, headerRowOneBased, skipDataRows, variant]);

    const headerPreviewIndex = headerRowOneBased - 1;
    const headerPreviewCells =
        headerPreviewIndex >= 0 && headerPreviewIndex < rows.length ? rows[headerPreviewIndex] || [] : null;
    const dataPreviewStartIndex = headerPreviewIndex + 1 + skipDataRows;

    /** Sheet sample columns for “Mapped data preview” (page): every mapped ledger + optional column. */
    const mappedDataPreviewColumns = useMemo(() => {
        const mapped = (label: string) => `${label} (${t('explorer.import_profile_mapped_short')})`;
        const out: { id: string; label: string; col: number }[] = [
            { id: 'date', label: mapped(t('table.date')), col: dateCol },
            { id: 'description', label: mapped(t('table.description')), col: descCol },
            {
                id: 'originalAmount',
                label: mapped(t('explorer.import_profile_col_original_amount')),
                col: lOrigAmtCol,
            },
        ];
        if (lOrigCurCol !== '') {
            out.push({
                id: 'originalCurrency',
                label: mapped(t('explorer.import_profile_col_original_currency_opt')),
                col: lOrigCurCol,
            });
        }
        out.push({
            id: 'chargedAmount',
            label: mapped(t('explorer.import_profile_amount_expense_income')),
            col: lChargedCol,
        });
        if (lChgCurCol !== '') {
            out.push({
                id: 'chargedCurrency',
                label: mapped(t('explorer.import_profile_col_charged_currency_opt')),
                col: lChgCurCol,
            });
        }
        for (const row of optionalFieldRows) {
            out.push({
                id: `opt-${row.id}`,
                label: mapped(transactionFieldLabel(t, row.field)),
                col: row.col,
            });
        }
        return out;
    }, [t, dateCol, descCol, lOrigAmtCol, lOrigCurCol, lChargedCol, lChgCurCol, optionalFieldRows]);

    const buildLedgerProfile = useCallback((): TabularImportProfileV1 => {
        const headerRowIndex = Math.max(0, headerRowOneBased - 1);
        const optionalFieldMappings =
            optionalFieldRows.length > 0
                ? optionalFieldRows.map((r) => ({
                      field: r.field,
                      column: { kind: 'index' as const, index: r.col },
                  }))
                : undefined;
        return {
            format: TABULAR_IMPORT_PROFILE_FORMAT,
            version: TABULAR_IMPORT_PROFILE_VERSION,
            headerRowIndex,
            dateFormat,
            provider: provider.trim() || 'imported',
            skipDataRows: Math.max(0, skipDataRows),
            columns: {
                date: { kind: 'index', index: dateCol },
                description: { kind: 'index', index: descCol },
                originalAmount: { kind: 'index', index: lOrigAmtCol },
                chargedAmount: { kind: 'index', index: lChargedCol },
                ...(lChgCurCol !== ''
                    ? { chargedCurrency: { kind: 'index' as const, index: lChgCurCol } }
                    : {}),
                ...(lOrigCurCol !== '' ? { originalCurrency: { kind: 'index', index: lOrigCurCol } } : {}),
            },
            ...(optionalFieldMappings ? { optionalFieldMappings } : {}),
            ...(includeDefaultFooterStops ? { defaultLedgerFooterStops: true } : {}),
            negateParsedAmounts,
            tabularAmountPolarityFilter: amountPolarityFilter,
        };
    }, [
        headerRowOneBased,
        dateFormat,
        provider,
        skipDataRows,
        negateParsedAmounts,
        amountPolarityFilter,
        dateCol,
        descCol,
        lOrigAmtCol,
        lChargedCol,
        lChgCurCol,
        lOrigCurCol,
        optionalFieldRows,
        includeDefaultFooterStops,
    ]);

    const runTxnTest = useCallback(() => {
        setTxnTestError(null);
        setTxnTestErrorDetail(null);
        setTxnTestLogs([]);
        setTxnTestHint(null);
        setTxnTestResults(null);
        setTxnTestRunning(true);

        try {
            if (!workbook) {
                setTxnTestError(t('explorer.import_profile_test_need_file'));
                return;
            }
            const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
            if (!sheetName || !sheet) {
                setTxnTestError(t('explorer.import_profile_test_sheet_missing'));
                return;
            }
            if (rows.length === 0) {
                setTxnTestError(t('explorer.import_profile_test_sheet_empty'));
                return;
            }

            const hi = headerRowOneBased - 1;
            if (hi < 0 || hi >= rows.length) {
                setTxnTestError(
                    t('explorer.import_profile_test_header_out_of_range', {
                        row: headerRowOneBased,
                        total: rows.length,
                    })
                );
                return;
            }

            const maxIndex = Math.max(0, maxCols - 1);
            const badCols: string[] = [];
            const checkCol = (idx: number, label: string) => {
                if (idx < 0 || idx >= maxCols) {
                    badCols.push(
                        t('explorer.import_profile_test_column_invalid', {
                            label,
                            index: idx,
                            maxIndex,
                        })
                    );
                }
            };

            checkCol(dateCol, t('explorer.import_profile_col_date'));
            checkCol(descCol, t('explorer.import_profile_col_desc'));
            checkCol(lOrigAmtCol, t('explorer.import_profile_col_original_amount'));
            checkCol(lChargedCol, t('explorer.import_profile_amount_expense_income'));
            if (lChgCurCol !== '') {
                checkCol(lChgCurCol, t('explorer.import_profile_col_charged_currency_opt'));
            }
            if (lOrigCurCol !== '') {
                checkCol(lOrigCurCol, t('explorer.import_profile_col_original_currency_opt'));
            }
            for (const row of optionalFieldRows) {
                checkCol(row.col, transactionFieldLabel(t, row.field));
            }

            if (badCols.length > 0) {
                setTxnTestError(badCols.join('\n'));
                return;
            }

        const profile = buildLedgerProfile();
        const logs: string[] = [];
        let n = 0;
        try {
            const { transactions } = parseTabularRows(rows, profile, logs, '0000', () => `test-${n++}`);
            setTxnTestResults(transactions.slice(0, 20));
                setTxnTestLogs([...logs]);

                if (transactions.length === 0) {
                    const skip = Math.max(0, profile.skipDataRows ?? 0);
                    const start = hi + 1 + skip;
                    let numericMsg: string | null = null;
                    for (let i = start; i < Math.min(start + 40, rows.length); i++) {
                        const row = rows[i];
                        if (!row) continue;
                        if (!parseDateCell(row[dateCol], profile.dateFormat)) continue;
                        if (!normalizeCellText(row[descCol])) continue;
                        if (cellLooksLikeNonNumericAmount(row[lChargedCol])) {
                            let sample = normalizeCellText(row[lChargedCol]);
                            if (sample.length > 48) sample = `${sample.slice(0, 45)}…`;
                            numericMsg = t('explorer.import_profile_test_expected_number_got_text', {
                                label: t('explorer.import_profile_amount_expense_income'),
                                sample,
                            });
                            break;
                        }
                    }

                    if (numericMsg) {
                        setTxnTestError(numericMsg);
                        setTxnTestHint(null);
                    } else {
                        let hint: string | null = null;
                        for (let i = start; i < Math.min(start + 25, rows.length); i++) {
                            const row = rows[i];
                            if (!row) continue;
                            if (!parseDateCell(row[dateCol], profile.dateFormat)) continue;
                            if (!normalizeCellText(row[descCol])) continue;
                            const rawCharged = row[lChargedCol];
                            const rawOrig = row[lOrigAmtCol];
                            const nCharged = parseNumberCell(rawCharged);
                            const nOrig = parseNumberCell(rawOrig);
                            const rc = normalizeCellText(rawCharged);
                            if (lChgCurCol !== '') {
                                const rawChgCur = row[lChgCurCol];
                                const nChgCur = parseNumberCell(rawChgCur);
                                if (
                                    nCharged === 0 &&
                                    nOrig > 0 &&
                                    nChgCur > 0 &&
                                    rc.length > 0 &&
                                    rc.length <= 8 &&
                                    /[₪$€£]/.test(rc)
                                ) {
                                    hint = t('explorer.import_profile_test_hint_swap_charged');
                                    break;
                                }
                            }
                        }
                        setTxnTestHint(hint);
                    }
                } else {
                    setTxnTestHint(null);
                }
        } catch (e: unknown) {
                setTxnTestError(errorMessageFromUnknown(e));
            setTxnTestResults(null);
                setTxnTestLogs([...logs]);
                setTxnTestErrorDetail(e instanceof Error && e.stack ? e.stack : null);
            }
        } finally {
            setTxnTestRunning(false);
        }
    }, [
        workbook,
        sheetName,
        rows,
        headerRowOneBased,
        maxCols,
        t,
        buildLedgerProfile,
        dateCol,
        descCol,
        lOrigAmtCol,
        lChargedCol,
        lChgCurCol,
        lOrigCurCol,
        optionalFieldRows,
        skipDataRows,
        negateParsedAmounts,
        amountPolarityFilter,
        includeDefaultFooterStops,
    ]);

    const handleSave = async () => {
        const sheetNames = sheetFilter
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

        const base = buildLedgerProfile();
        const name =
            profileName.trim() || generateDefaultImportProfileName(sheetName || '');
        const profile: TabularImportProfileV1 = {
            ...base,
            name,
            ...(sheetNames.length > 0 ? { sheetNames } : {}),
        };

        const json = JSON.stringify(profile);
        setSaveError(null);
        setIsSaving(true);
        try {
            await onSave(json);
            if (variant === 'modal') onClose();
        } catch (e: unknown) {
            setSaveError(errorMessageFromUnknown(e));
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const selectCls =
        'w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none';
    const selectPageCls =
        'w-full rounded-xl border border-gray-200/90 bg-white px-3 py-2.5 text-sm text-gray-800 shadow-sm outline-none ring-[#006837]/15 focus:ring-2 focus:ring-[#006837]/35';

    const dateFormatOptions = (
        <>
            <option value="dmy_slash">DD/MM/YYYY (slash)</option>
            <option value="dmy_dot">DD.MM.YYYY (dot)</option>
            <option value="mdy_slash">MM/DD/YYYY</option>
            <option value="ymd_dash">YYYY-MM-DD</option>
            <option value="excel_serial">Excel serial number</option>
            <option value="iso">ISO / auto</option>
        </>
    );

    if (variant === 'page') {
    return (
            <div className="min-h-full bg-[#F4F7F6] pb-28" dir={i18n.dir()}>
                <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
                    <header className="space-y-2 text-start">
                        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                            {t('explorer.import_profile_builder_title')}
                        </h1>
                        <p className="max-w-xl text-sm leading-relaxed text-gray-600">
                            {t('explorer.import_profile_builder_intro')}
                        </p>
                    </header>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xls,.xlsx,.csv,text/csv"
                        className="hidden"
                        onChange={(e) => readFile(e.target.files?.[0] ?? null)}
                    />

                    <ProfileSection index={1} title={t('explorer.import_profile_section_1')}>
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDragging(true);
                                }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDragging(false);
                                    const f = e.dataTransfer.files?.[0];
                                    if (f) readFile(f);
                                }}
                                className={`flex min-h-[160px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 transition-colors ${
                                    isDragging
                                        ? 'border-[#006837] bg-white shadow-inner'
                                        : 'border-gray-300 bg-white/60 hover:border-[#006837]/50'
                                }`}
                            >
                                <CloudUpload className="h-10 w-10 text-[#006837]" strokeWidth={1.5} aria-hidden />
                                <span className="text-center text-sm font-medium text-gray-700">{t('explorer.drop_files')}</span>
                                <span className="text-center text-xs text-gray-500">{t('explorer.import_profile_drop_formats')}</span>
                            </button>
                            <div className="flex w-full shrink-0 flex-col gap-4 lg:w-56">
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                        {t('explorer.import_profile_header_row_short')}
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        className={selectPageCls}
                                        value={headerRowOneBased}
                                        onChange={(e) =>
                                            setHeaderRowOneBased(Math.max(1, parseInt(e.target.value, 10) || 1))
                                        }
                                        disabled={!workbook}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                        {t('explorer.import_profile_sheet_pick')}
                                    </label>
                                    <select
                                        className={selectPageCls}
                                        value={sheetName}
                                        onChange={(e) => onSheetPick(e.target.value)}
                                        disabled={!workbook}
                                    >
                                        {workbook &&
                                            workbook.SheetNames.map((n) => (
                                                <option key={n} value={n}>
                                                    {n}
                                                </option>
                                            ))}
                                        {!workbook && <option value="">{t('explorer.import_profile_none')}</option>}
                                    </select>
                                </div>
                            </div>
                        </div>
                        {parseError && <p className="text-sm text-red-600">{parseError}</p>}
                    </ProfileSection>

                    {workbook && (
                        <section className="rounded-2xl bg-[#F4F7F6] p-5 shadow-sm sm:p-6">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-base font-bold text-gray-900">
                                    <Eye className="h-5 w-5 text-[#006837]" aria-hidden />
                                    {t('explorer.import_profile_mapped_data_preview')}
                                </div>
                                <span className="rounded-full bg-[#56FF91]/40 px-3 py-1 text-xs font-semibold text-gray-800">
                                    {t('explorer.import_profile_showing_first_rows', { n: 10 })}
                                </span>
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-gray-200/80 bg-white" dir="ltr">
                                <table className="min-w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-[#006837] text-white">
                                            {mappedDataPreviewColumns.map((c) => (
                                                <th key={c.id} className="px-3 py-2.5 text-start font-semibold">
                                                    {c.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewDataRows.map((r, i) => (
                                            <tr
                                                key={i}
                                                className={i % 2 === 0 ? 'bg-gray-50/90' : 'bg-white'}
                                            >
                                                {mappedDataPreviewColumns.map((c) => (
                                                    <td
                                                        key={c.id}
                                                        className="max-w-[200px] truncate border-t border-gray-100 px-3 py-2 text-gray-800"
                                                    >
                                                        {String((r || [])[c.col] ?? '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {workbook && (
                        <>
                            <ProfileSection index={2} title={t('explorer.import_profile_section_2')}>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_col_date')}
                                        </label>
                                        <select
                                            className={selectPageCls}
                                            value={dateCol}
                                            onChange={(e) => setDateCol(parseInt(e.target.value, 10))}
                                        >
                                            {colOptions.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_col_desc')}
                                        </label>
                                        <select
                                            className={selectPageCls}
                                            value={descCol}
                                            onChange={(e) => setDescCol(parseInt(e.target.value, 10))}
                                        >
                                            {colOptions.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_col_original_amount')}
                                        </label>
                                        <select
                                            className={selectPageCls}
                                            value={lOrigAmtCol}
                                            onChange={(e) => setLOrigAmtCol(parseInt(e.target.value, 10))}
                                        >
                                            {colOptions.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_col_charged_amount')}
                                        </label>
                                        <select
                                            className={selectPageCls}
                                            value={lChargedCol}
                                            onChange={(e) => setLChargedCol(parseInt(e.target.value, 10))}
                                        >
                                            {colOptions.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_col_charged_currency_opt')}
                                        </label>
                                        <select
                                            className={selectPageCls}
                                            value={lChgCurCol === '' ? '' : String(lChgCurCol)}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLChgCurCol(v === '' ? '' : parseInt(v, 10));
                                            }}
                                        >
                                            <option value="">{t('explorer.import_profile_none')}</option>
                                            {colOptions.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_col_original_currency_opt')}
                                        </label>
                                        <select
                                            className={selectPageCls}
                                            value={lOrigCurCol === '' ? '' : String(lOrigCurCol)}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLOrigCurCol(v === '' ? '' : parseInt(v, 10));
                                            }}
                                        >
                                            <option value="">{t('explorer.import_profile_none')}</option>
                                            {colOptions.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-4 border-t border-gray-200/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                    <button
                                        type="button"
                                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                                        onClick={() =>
                                            setOptionalFieldRows((prev) => [
                                                ...prev,
                                                { id: crypto.randomUUID(), field: 'externalId', col: 0 },
                                            ])
                                        }
                                    >
                                        {t('explorer.import_profile_add_optional_column')}
                                    </button>
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-[#006837] focus:ring-[#006837]"
                                            checked={includeDefaultFooterStops}
                                            onChange={(e) => setIncludeDefaultFooterStops(e.target.checked)}
                                        />
                                        <span>{t('explorer.import_profile_footer_stops')}</span>
                                    </label>
                                </div>

                                {optionalFieldRows.length > 0 && (
                                    <div className="space-y-2 rounded-xl border border-gray-200/80 bg-white/80 p-4">
                                        <div className="text-xs font-semibold text-gray-700">
                                            {t('explorer.import_profile_optional_mappings')}
                                        </div>
                                        <p className="text-[11px] text-gray-500">{t('explorer.import_profile_optional_mappings_hint')}</p>
                                        {optionalFieldRows.map((row) => (
                                            <div key={row.id} className="flex flex-wrap items-center gap-2">
                                                <select
                                                    className={selectPageCls + ' min-w-[120px] flex-1'}
                                                    value={row.field}
                                                    onChange={(e) => {
                                                        const v = e.target.value as TabularMappableTxnField;
                                                        setOptionalFieldRows((prev) =>
                                                            prev.map((r) => (r.id === row.id ? { ...r, field: v } : r))
                                                        );
                                                    }}
                                                >
                                                    {TABULAR_MAPPABLE_TXN_FIELDS.map((f) => (
                                                        <option key={f} value={f}>
                                                            {transactionFieldLabel(t, f)}
                                                        </option>
                                                    ))}
                                                </select>
                                                <select
                                                    className={selectPageCls + ' min-w-[140px] flex-1'}
                                                    value={row.col}
                                                    onChange={(e) => {
                                                        const c = parseInt(e.target.value, 10);
                                                        setOptionalFieldRows((prev) =>
                                                            prev.map((r) => (r.id === row.id ? { ...r, col: c } : r))
                                                        );
                                                    }}
                                                >
                                                    {colOptions.map((o) => (
                                                        <option key={o.value} value={o.value}>
                                                            {o.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                                                    aria-label={t('explorer.import_profile_mapping_remove')}
                                                    onClick={() =>
                                                        setOptionalFieldRows((prev) => prev.filter((r) => r.id !== row.id))
                                                    }
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ProfileSection>

                            <ProfileSection index={3} title={t('explorer.import_profile_section_3')}>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="min-w-0">
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_date_format')}
                                        </label>
                                        <select
                                            className={selectPageCls}
                                            value={dateFormat}
                                            onChange={(e) => setDateFormat(e.target.value as TabularDateFormat)}
                                        >
                                            {dateFormatOptions}
                                        </select>
                                    </div>
                                    <div className="min-w-0">
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_name_required')}
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            className={selectPageCls}
                                            value={profileName}
                                            onChange={(e) => setProfileName(e.target.value)}
                                            placeholder={t('explorer.import_profile_name_ph')}
                                        />
                                        <p className="mt-1 text-[11px] text-gray-500">{t('explorer.import_profile_name_hint')}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_provider_id')}
                                        </label>
                                        <select
                                            className={selectPageCls}
                                            value={provider}
                                            onChange={(e) => setProvider(e.target.value)}
                                        >
                                            {providerIdSelectOptions}
                                        </select>
                                    </div>
                                    <div className="min-w-0">
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_skip_rows')}
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            className={selectPageCls}
                                            value={skipDataRows}
                                            onChange={(e) =>
                                                setSkipDataRows(Math.max(0, parseInt(e.target.value, 10) || 0))
                                            }
                                        />
                                    </div>
                                    <div className="min-w-0 sm:col-span-2">
                                        <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-gray-300 text-[#006837] focus:ring-[#006837]"
                                                checked={negateParsedAmounts}
                                                onChange={(e) => setNegateParsedAmounts(e.target.checked)}
                                            />
                                            <span>{t('explorer.import_profile_negate_amounts')}</span>
                                        </label>
                                        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                                            {t('explorer.import_profile_negate_amounts_hint')}
                                        </p>
                                    </div>
                                    <div className="min-w-0 sm:col-span-2">
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                                            {t('explorer.import_profile_amount_filter')}
                                        </label>
                                        <select
                                            className={selectPageCls}
                                            value={amountPolarityFilter}
                                            onChange={(e) =>
                                                setAmountPolarityFilter(e.target.value as TabularAmountPolarityFilter)
                                            }
                                        >
                                            <option value="all">{t('explorer.import_profile_amount_filter_all')}</option>
                                            <option value="expense_only">
                                                {t('explorer.import_profile_amount_filter_expense_only')}
                                            </option>
                                            <option value="income_only">
                                                {t('explorer.import_profile_amount_filter_income_only')}
                                            </option>
                                        </select>
                                        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                                            {t('explorer.import_profile_amount_filter_hint')}
                                        </p>
                                    </div>
                                </div>
                            </ProfileSection>

                            <div className="rounded-2xl border border-emerald-200/80 bg-white shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100/80 bg-emerald-50/50 px-4 py-3">
                                    <div>
                                        <span className="text-sm font-semibold text-emerald-950">
                                            {t('explorer.import_profile_txn_preview')}
                                        </span>
                                        <p className="mt-0.5 text-xs text-emerald-900/70">{t('explorer.import_profile_test_hint')}</p>
                                    </div>
                                </div>
                                {txnTestRunning && (
                                    <div className="border-t border-emerald-100/80 px-4 py-10 text-center text-sm text-gray-500">
                                        {t('explorer.import_profile_test_running')}
                                    </div>
                                )}
                                {!txnTestRunning && txnTestError && (
                                    <div className="space-y-2 border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
                                        <p className="whitespace-pre-wrap font-medium">{txnTestError}</p>
                                        {txnTestErrorDetail && (
                                            <details className="rounded-lg border border-red-100 bg-white/90 p-2 text-xs text-red-900">
                                                <summary className="cursor-pointer font-semibold">
                                                    {t('explorer.import_profile_test_technical_details')}
                                                </summary>
                                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono">
                                                    {txnTestErrorDetail}
                                                </pre>
                                            </details>
                                        )}
                                        {txnTestLogs.length > 0 && (
                                            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-red-100 bg-white/90 p-2 font-mono text-xs text-red-900">
                                                {txnTestLogs.join('\n')}
                                            </pre>
                                        )}
                                    </div>
                                )}
                                {!txnTestRunning &&
                                    txnTestResults &&
                                    txnTestResults.length === 0 &&
                                    !txnTestError && (
                                    <div
                                        className={`space-y-2 px-4 py-4 text-sm ${
                                            txnTestLogs.length > 0 || txnTestHint
                                                ? 'border-t border-amber-100 bg-amber-50/90 text-amber-950'
                                                : 'text-gray-600'
                                        }`}
                                    >
                                        <p className="font-medium">{t('explorer.import_profile_test_empty')}</p>
                                        {txnTestHint && (
                                            <p className="rounded-lg border border-amber-200 bg-amber-100/90 px-3 py-2 text-sm font-medium leading-snug text-amber-950">
                                                {txnTestHint}
                                            </p>
                                        )}
                                        {txnTestLogs.length > 0 && (
                                            <div>
                                                <div className="mb-1 font-medium text-amber-900">
                                                    {t('explorer.import_profile_test_logs')}
                                                </div>
                                                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-amber-100 bg-white/80 p-2 font-mono text-xs text-amber-950">
                                                    {txnTestLogs.join('\n')}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!txnTestRunning && txnTestResults && txnTestResults.length > 0 && (
                                    <div className="max-h-64 overflow-x-auto overflow-y-auto p-3 text-sm" dir="ltr">
                                        <table className="min-w-full border-collapse text-start">
                                            <thead>
                                                <tr className="border-b border-emerald-100 text-gray-500">
                                                    <th className="px-2 py-2 font-medium">{t('table.date')}</th>
                                                    <th className="px-2 py-2 font-medium">{t('table.description')}</th>
                                                    <th className="px-2 py-2 font-medium">{t('explorer.import_profile_preview_amt')}</th>
                                                    <th className="px-2 py-2 font-medium">{t('explorer.import_profile_preview_orig')}</th>
                                                    <th className="px-2 py-2 font-medium">{t('explorer.import_profile_preview_chg_cur')}</th>
                                                    <th className="px-2 py-2 font-medium">{t('table.memo')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {txnTestResults.map((tx) => (
                                                    <tr key={tx.id} className="border-t border-emerald-50">
                                                        <td className="whitespace-nowrap px-2 py-1.5">{tx.date?.slice(0, 10)}</td>
                                                        <td className="max-w-[160px] truncate px-2 py-1.5">{tx.description}</td>
                                                        <td
                                                            className={`whitespace-nowrap px-2 py-1.5 font-medium ${
                                                                tx.amount < 0 ? 'text-red-600' : 'text-emerald-700'
                                                            }`}
                                                        >
                                                            {tx.amount}
                                                        </td>
                                                        <td className="whitespace-nowrap px-2 py-1.5">{tx.originalAmount}</td>
                                                        <td className="whitespace-nowrap px-2 py-1.5">{tx.chargedCurrency}</td>
                                                        <td className="max-w-[120px] truncate px-2 py-1.5">{tx.memo ?? '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <footer className="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-200/80 bg-white/95 px-4 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-sm sm:px-6">
                    <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {saveError && (
                            <p className="w-full text-sm text-red-600 sm:order-first sm:w-auto sm:flex-1" role="alert">
                                {saveError}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <button
                                type="button"
                                disabled={!workbook || isSaving}
                                onClick={() => void handleSave()}
                                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition ${
                                    !workbook || isSaving
                                        ? 'cursor-not-allowed bg-gray-300'
                                        : 'bg-[#006837] hover:bg-[#005529]'
                                }`}
                            >
                                <Save className="h-4 w-4" aria-hidden />
                                {isSaving ? t('explorer.import_profile_saving') : t('explorer.import_profile_save_profile')}
                            </button>
                            <button
                                type="button"
                                disabled={txnTestRunning}
                                onClick={runTxnTest}
                                title={!workbook ? t('explorer.import_profile_test_need_file') : undefined}
                                className={`inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold ${
                                    txnTestRunning
                                        ? 'cursor-wait bg-gray-100 text-gray-400'
                                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                }`}
                            >
                                <FlaskConical className="h-4 w-4" aria-hidden />
                                {t('explorer.import_profile_run_test')}
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-sm font-medium text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline"
                        >
                            {t('explorer.import_profile_cancel_close')}
                        </button>
                    </div>
                </footer>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 p-4">
                    <h3 className="text-lg font-semibold text-gray-800">{t('explorer.import_profile_builder_title')}</h3>
                    <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label={t('common.close')}>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
                    <p className="text-gray-600">{t('explorer.import_profile_builder_intro')}</p>

                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                            {t('explorer.import_profile_sample_file')}
                        </label>
                        <input
                            type="file"
                            accept=".xls,.xlsx,.csv,text/csv"
                            onChange={(e) => readFile(e.target.files?.[0] ?? null)}
                            className="w-full text-sm"
                        />
                        {parseError && <p className="mt-1 text-xs text-red-600">{parseError}</p>}
                    </div>

                    {workbook && (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_sheet')}
                                    </label>
                                    <select
                                        className={selectCls}
                                        value={sheetName}
                                        onChange={(e) => onSheetPick(e.target.value)}
                                    >
                                        {workbook.SheetNames.map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_header_row')}
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        className={selectCls}
                                        value={headerRowOneBased}
                                        onChange={(e) => setHeaderRowOneBased(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_col_date')}
                                    </label>
                                    <select className={selectCls} value={dateCol} onChange={(e) => setDateCol(parseInt(e.target.value, 10))}>
                                        {colOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_col_desc')}
                                    </label>
                                    <select className={selectCls} value={descCol} onChange={(e) => setDescCol(parseInt(e.target.value, 10))}>
                                        {colOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_col_original_amount')}
                                    </label>
                                    <select
                                        className={selectCls}
                                        value={lOrigAmtCol}
                                        onChange={(e) => setLOrigAmtCol(parseInt(e.target.value, 10))}
                                    >
                                        {colOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_col_charged_amount')}
                                    </label>
                                    <select
                                        className={selectCls}
                                        value={lChargedCol}
                                        onChange={(e) => setLChargedCol(parseInt(e.target.value, 10))}
                                    >
                                        {colOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_col_charged_currency_opt')}
                                    </label>
                                    <select
                                        className={selectCls}
                                        value={lChgCurCol === '' ? '' : String(lChgCurCol)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setLChgCurCol(v === '' ? '' : parseInt(v, 10));
                                        }}
                                    >
                                        <option value="">{t('explorer.import_profile_none')}</option>
                                        {colOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_col_original_currency_opt')}
                                    </label>
                                    <select
                                        className={selectCls}
                                        value={lOrigCurCol === '' ? '' : String(lOrigCurCol)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setLOrigCurCol(v === '' ? '' : parseInt(v, 10));
                                        }}
                                    >
                                        <option value="">{t('explorer.import_profile_none')}</option>
                                        {colOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={includeDefaultFooterStops}
                                    onChange={(e) => setIncludeDefaultFooterStops(e.target.checked)}
                                />
                                {t('explorer.import_profile_footer_stops')}
                            </label>

                            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                                <div className="text-xs font-semibold text-gray-600">{t('explorer.import_profile_optional_mappings')}</div>
                                <p className="text-[10px] text-gray-500">{t('explorer.import_profile_optional_mappings_hint')}</p>
                                {optionalFieldRows.map((row) => (
                                    <div key={row.id} className="flex flex-wrap gap-2 items-center">
                                        <select
                                            className={selectCls + ' flex-1 min-w-[140px]'}
                                            value={row.field}
                                            onChange={(e) => {
                                                const v = e.target.value as TabularMappableTxnField;
                                                setOptionalFieldRows((prev) =>
                                                    prev.map((r) => (r.id === row.id ? { ...r, field: v } : r))
                                                );
                                            }}
                                        >
                                            {TABULAR_MAPPABLE_TXN_FIELDS.map((f) => (
                                                <option key={f} value={f}>
                                                    {transactionFieldLabel(t, f)}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            className={selectCls + ' flex-1 min-w-[160px]'}
                                            value={row.col}
                                            onChange={(e) => {
                                                const c = parseInt(e.target.value, 10);
                                                setOptionalFieldRows((prev) =>
                                                    prev.map((r) => (r.id === row.id ? { ...r, col: c } : r))
                                                );
                                            }}
                                        >
                                            {colOptions.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="text-xs text-red-600 hover:underline"
                                            onClick={() =>
                                                setOptionalFieldRows((prev) => prev.filter((r) => r.id !== row.id))
                                            }
                                        >
                                            {t('explorer.import_profile_mapping_remove')}
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    className="text-xs font-medium text-blue-600 hover:underline"
                                    onClick={() =>
                                        setOptionalFieldRows((prev) => [
                                            ...prev,
                                            {
                                                id: crypto.randomUUID(),
                                                field: 'externalId',
                                                col: 0,
                                            },
                                        ])
                                    }
                                >
                                    + {t('explorer.import_profile_mapping_add')}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_date_format')}
                                    </label>
                                    <select
                                        className={selectCls}
                                        value={dateFormat}
                                        onChange={(e) => setDateFormat(e.target.value as TabularDateFormat)}
                                    >
                                        {dateFormatOptions}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_skip_rows')}
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        className={selectCls}
                                        value={skipDataRows}
                                        onChange={(e) => setSkipDataRows(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                        checked={negateParsedAmounts}
                                        onChange={(e) => setNegateParsedAmounts(e.target.checked)}
                                    />
                                    <span>{t('explorer.import_profile_negate_amounts')}</span>
                                </label>
                                <p className="text-[11px] text-gray-500">{t('explorer.import_profile_negate_amounts_hint')}</p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                    {t('explorer.import_profile_amount_filter')}
                                </label>
                                <select
                                    className={selectCls}
                                    value={amountPolarityFilter}
                                    onChange={(e) =>
                                        setAmountPolarityFilter(e.target.value as TabularAmountPolarityFilter)
                                    }
                                >
                                    <option value="all">{t('explorer.import_profile_amount_filter_all')}</option>
                                    <option value="expense_only">
                                        {t('explorer.import_profile_amount_filter_expense_only')}
                                    </option>
                                    <option value="income_only">{t('explorer.import_profile_amount_filter_income_only')}</option>
                                </select>
                                <p className="mt-1 text-[11px] text-gray-500">{t('explorer.import_profile_amount_filter_hint')}</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_provider_id')}
                                    </label>
                                    <select
                                        className={selectCls}
                                        value={provider}
                                        onChange={(e) => setProvider(e.target.value)}
                                    >
                                        {providerIdSelectOptions}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_name_required')}
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        className={selectCls}
                                        value={profileName}
                                        onChange={(e) => setProfileName(e.target.value)}
                                        placeholder={t('explorer.import_profile_name_ph')}
                                    />
                                    <p className="mt-0.5 text-[10px] text-gray-500">{t('explorer.import_profile_name_hint')}</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                    {t('explorer.import_profile_sheet_filter')}
                                </label>
                                <input
                                    type="text"
                                    className={selectCls}
                                    value={sheetFilter}
                                    onChange={(e) => setSheetFilter(e.target.value)}
                                    placeholder={t('explorer.import_profile_sheet_filter_ph')}
                                />
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 flex flex-wrap items-center justify-between gap-2">
                                    <span>{t('explorer.import_profile_preview')}</span>
                                    <span className="text-[10px] font-normal text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded">
                                        {t('explorer.import_profile_preview_header_hint', { n: headerRowOneBased })}
                                    </span>
                                </div>
                                <div className="overflow-x-auto max-h-48 text-xs" dir="ltr">
                                    <table className="min-w-full border-collapse">
                                        <tbody>
                                            {headerPreviewCells !== null && (
                                                <tr className="border-t-2 border-amber-400 bg-amber-50">
                                                    <td className="border-r border-amber-200 bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-900 whitespace-nowrap w-8 text-center">
                                                        {headerRowOneBased}
                                                    </td>
                                                    {headerPreviewCells.slice(0, maxCols).map((cell, j) => (
                                                        <td
                                                            key={j}
                                                            className="border-r border-amber-200 px-1 py-0.5 whitespace-nowrap max-w-[140px] truncate font-medium text-amber-950"
                                                        >
                                                            {String(cell ?? '')}
                                                        </td>
                                                    ))}
                                                </tr>
                                            )}
                                            {previewDataRows.map((r, i) => (
                                                <tr key={i} className="border-t border-gray-100 bg-white">
                                                    <td className="border-r border-gray-200 bg-gray-50 px-1 py-0.5 text-[10px] text-gray-500 whitespace-nowrap w-8 text-center">
                                                        {dataPreviewStartIndex + i + 1}
                                                    </td>
                                                    {(r || []).slice(0, maxCols).map((cell, j) => (
                                                        <td key={j} className="border-r border-gray-100 px-1 py-0.5 whitespace-nowrap max-w-[140px] truncate">
                                                            {String(cell ?? '')}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="border rounded-lg overflow-hidden border-emerald-200">
                                <div className="bg-emerald-50 px-2 py-1.5 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <span className="text-xs font-medium text-emerald-900">{t('explorer.import_profile_txn_preview')}</span>
                                        <p className="text-[10px] text-emerald-800/80 mt-0.5">{t('explorer.import_profile_test_hint')}</p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={txnTestRunning}
                                        onClick={runTxnTest}
                                        title={!workbook ? t('explorer.import_profile_test_need_file') : undefined}
                                        className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-lg border border-emerald-300 ${
                                            txnTestRunning
                                                ? 'cursor-wait bg-emerald-50/80 text-emerald-600'
                                                : 'bg-white text-emerald-900 hover:bg-emerald-100'
                                        }`}
                                    >
                                        {t('explorer.import_profile_test_btn')}
                                    </button>
                                </div>
                                {txnTestRunning && (
                                    <div className="border-t border-emerald-100 px-2 py-8 text-center text-xs text-gray-500">
                                        {t('explorer.import_profile_test_running')}
                                    </div>
                                )}
                                {!txnTestRunning && txnTestError && (
                                    <div className="px-2 py-2 space-y-2 text-xs text-red-700 bg-red-50 border-t border-red-100">
                                        <p className="whitespace-pre-wrap font-medium">{txnTestError}</p>
                                        {txnTestErrorDetail && (
                                            <details className="rounded border border-red-100 bg-white/80 p-2 text-[11px] text-red-900">
                                                <summary className="cursor-pointer font-semibold">
                                                    {t('explorer.import_profile_test_technical_details')}
                                                </summary>
                                                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono">
                                                    {txnTestErrorDetail}
                                                </pre>
                                            </details>
                                        )}
                                        {txnTestLogs.length > 0 && (
                                            <pre className="text-[11px] bg-white/80 border border-red-100 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono text-red-900">
                                                {txnTestLogs.join('\n')}
                                            </pre>
                                        )}
                                    </div>
                                )}
                                {!txnTestRunning &&
                                    txnTestResults &&
                                    txnTestResults.length === 0 &&
                                    !txnTestError && (
                                    <div
                                        className={`px-2 py-3 space-y-2 text-xs ${
                                            txnTestLogs.length > 0 || txnTestHint
                                                ? 'border-t border-amber-100 bg-amber-50/90 text-amber-950'
                                                : 'text-gray-600'
                                        }`}
                                    >
                                        <p className="font-medium">{t('explorer.import_profile_test_empty')}</p>
                                        {txnTestHint && (
                                            <p className="rounded border border-amber-200 bg-amber-100/90 px-2 py-1.5 font-medium leading-snug text-amber-950">
                                                {txnTestHint}
                                            </p>
                                        )}
                                        {txnTestLogs.length > 0 && (
                                            <div>
                                                <div className="font-medium text-amber-900 mb-1">
                                                    {t('explorer.import_profile_test_logs')}
                                                </div>
                                                <pre className="text-[11px] bg-white/80 border border-amber-100 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono text-amber-950">
                                                    {txnTestLogs.join('\n')}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!txnTestRunning && txnTestResults && txnTestResults.length > 0 && (
                                    <div className="overflow-x-auto max-h-56 text-xs p-2">
                                        <table className="min-w-full border-collapse text-left">
                                            <thead>
                                                <tr className="border-b border-emerald-100 text-gray-500">
                                                    <th className="pr-2 py-1 font-medium">{t('table.date')}</th>
                                                    <th className="pr-2 py-1 font-medium">{t('table.description')}</th>
                                                    <th className="pr-2 py-1 font-medium">{t('explorer.import_profile_preview_amt')}</th>
                                                    <th className="pr-2 py-1 font-medium">{t('explorer.import_profile_preview_orig')}</th>
                                                    <th className="pr-2 py-1 font-medium">{t('explorer.import_profile_preview_chg_cur')}</th>
                                                    <th className="pr-2 py-1 font-medium">{t('table.memo')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {txnTestResults.map((tx) => (
                                                    <tr key={tx.id} className="border-t border-emerald-50">
                                                        <td className="pr-2 py-1 whitespace-nowrap">{tx.date?.slice(0, 10)}</td>
                                                        <td className="pr-2 py-1 max-w-[160px] truncate">{tx.description}</td>
                                                        <td className="pr-2 py-1 whitespace-nowrap">{tx.amount}</td>
                                                        <td className="pr-2 py-1 whitespace-nowrap">{tx.originalAmount}</td>
                                                        <td className="pr-2 py-1 whitespace-nowrap">{tx.chargedCurrency}</td>
                                                        <td className="pr-2 py-1 max-w-[120px] truncate">{tx.memo ?? '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end flex-wrap">
                    {saveError && (
                        <p className="w-full text-sm text-red-600 sm:mr-auto sm:w-auto" role="alert">
                            {saveError}
                        </p>
                    )}
                    <div className="flex justify-end gap-2 flex-wrap w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            disabled={!workbook || isSaving}
                            onClick={() => void handleSave()}
                            className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${
                                !workbook || isSaving ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                        >
                            {isSaving ? t('explorer.import_profile_saving') : t('explorer.import_profile_save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
