import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as xlsx from '@e965/xlsx';
import type { Transaction } from '@app/shared';
import {
    TABULAR_IMPORT_PROFILE_FORMAT,
    TABULAR_IMPORT_PROFILE_VERSION,
    TABULAR_MAPPABLE_TXN_FIELDS,
    parseTabularRows,
    type TabularDateFormat,
    type TabularImportProfileV1,
    type TabularMappableTxnField,
} from '@app/shared';

type OptionalFieldRow = { id: string; field: TabularMappableTxnField; col: number };

interface ImportProfileBuilderProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (profileJson: string) => void;
    /** Full-page layout (no modal overlay); used from Import profile route. */
    variant?: 'modal' | 'page';
}

function colLabel(idx: number, preview: string): string {
    const p = preview.replace(/\s+/g, ' ').trim().slice(0, 28);
    return p ? `${idx}: ${p}` : `${idx}`;
}

export function ImportProfileBuilder({ isOpen, onClose, onSave, variant = 'modal' }: ImportProfileBuilderProps) {
    const { t } = useTranslation();
    const [workbook, setWorkbook] = useState<xlsx.WorkBook | null>(null);
    const [sheetName, setSheetName] = useState('');
    const [headerRowOneBased, setHeaderRowOneBased] = useState(1);
    const [dateCol, setDateCol] = useState(0);
    const [descCol, setDescCol] = useState(1);
    const [categoryCol, setCategoryCol] = useState<number | ''>('');
    const [dateFormat, setDateFormat] = useState<TabularDateFormat>('dmy_dot');
    const [skipDataRows, setSkipDataRows] = useState(0);
    const [provider, setProvider] = useState('imported');
    const [profileName, setProfileName] = useState('');
    const [sheetFilter, setSheetFilter] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [lOrigAmtCol, setLOrigAmtCol] = useState(2);
    const [lChargedCol, setLChargedCol] = useState(3);
    const [lChgCurCol, setLChgCurCol] = useState(4);
    const [lOrigCurCol, setLOrigCurCol] = useState<number | ''>('');
    const [lExtraCol, setLExtraCol] = useState<number | ''>('');
    const [includeDefaultFooterStops, setIncludeDefaultFooterStops] = useState(true);
    const [optionalFieldRows, setOptionalFieldRows] = useState<OptionalFieldRow[]>([]);
    const [txnTestResults, setTxnTestResults] = useState<Transaction[] | null>(null);
    const [txnTestError, setTxnTestError] = useState<string | null>(null);

    const readFile = useCallback((file: File | null) => {
        setParseError(null);
        setTxnTestResults(null);
        setTxnTestError(null);
        setWorkbook(null);
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const wb = xlsx.read(data, { type: 'array' });
                setWorkbook(wb);
                const first = wb.SheetNames[0] || '';
                setSheetName(first);
                setHeaderRowOneBased(1);
            } catch (err: unknown) {
                setParseError(err instanceof Error ? err.message : String(err));
            }
        };
        reader.readAsArrayBuffer(file);
    }, []);

    const rows = useMemo(() => {
        if (!workbook || !sheetName) return [] as any[][];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        return xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    }, [workbook, sheetName]);

    const maxCols = useMemo(() => {
        let m = 0;
        const hi = Math.max(0, headerRowOneBased - 1);
        for (let r = hi; r < Math.min(rows.length, hi + 5); r++) {
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

    const colOptions = useMemo(() => {
        const opts: { value: number; label: string }[] = [];
        for (let j = 0; j < maxCols; j++) {
            opts.push({
                value: j,
                label: colLabel(j, String(headerRow[j] ?? '')),
            });
        }
        return opts;
    }, [maxCols, headerRow]);

    /** Rows after header + skip (data sample). */
    const previewDataRows = useMemo(() => {
        const hi = headerRowOneBased - 1;
        const start = hi + 1 + skipDataRows;
        return rows.slice(start, start + 8);
    }, [rows, headerRowOneBased, skipDataRows]);

    const headerPreviewIndex = headerRowOneBased - 1;
    const headerPreviewCells =
        headerPreviewIndex >= 0 && headerPreviewIndex < rows.length ? rows[headerPreviewIndex] || [] : null;
    const dataPreviewStartIndex = headerPreviewIndex + 1 + skipDataRows;

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
                chargedCurrency: { kind: 'index', index: lChgCurCol },
                ...(lOrigCurCol !== '' ? { originalCurrency: { kind: 'index', index: lOrigCurCol } } : {}),
                ...(lExtraCol !== '' ? { extraDetails: { kind: 'index', index: lExtraCol } } : {}),
                ...(categoryCol !== '' ? { category: { kind: 'index', index: categoryCol } } : {}),
            },
            ...(optionalFieldMappings ? { optionalFieldMappings } : {}),
            ...(includeDefaultFooterStops ? { defaultLedgerFooterStops: true } : {}),
        };
    }, [
        headerRowOneBased,
        dateFormat,
        provider,
        skipDataRows,
        dateCol,
        descCol,
        lOrigAmtCol,
        lChargedCol,
        lChgCurCol,
        lOrigCurCol,
        lExtraCol,
        categoryCol,
        optionalFieldRows,
        includeDefaultFooterStops,
    ]);

    const runTxnTest = useCallback(() => {
        setTxnTestError(null);
        if (!workbook) return;
        const profile = buildLedgerProfile();
        const logs: string[] = [];
        let n = 0;
        try {
            const { transactions } = parseTabularRows(rows, profile, logs, '0000', () => `test-${n++}`);
            setTxnTestResults(transactions.slice(0, 20));
        } catch (e: unknown) {
            setTxnTestError(e instanceof Error ? e.message : String(e));
            setTxnTestResults(null);
        }
    }, [workbook, buildLedgerProfile, rows]);

    const handleSave = () => {
        const sheetNames = sheetFilter
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

        const base = buildLedgerProfile();
        const profile: TabularImportProfileV1 = {
            ...base,
            name: profileName.trim() || undefined,
            ...(sheetNames.length > 0 ? { sheetNames } : {}),
        };

        const json = JSON.stringify(profile);
        onSave(json);
        if (variant === 'modal') onClose();
    };

    if (!isOpen) return null;

    const selectCls =
        'w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none';

    const outerCls =
        variant === 'page'
            ? 'min-h-full flex flex-col bg-gray-50 py-4 px-4'
            : 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60';
    const innerCls =
        variant === 'page'
            ? 'bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-3xl mx-auto flex flex-col flex-1 min-h-0 max-h-[calc(100vh-2rem)]'
            : 'bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-gray-200';

    return (
        <div className={outerCls}>
            <div className={innerCls}>
                <div className="p-4 border-b border-gray-100 flex justify-between items-center gap-2 shrink-0">
                    <h3 className="text-lg font-semibold text-gray-800">{t('explorer.import_profile_builder_title')}</h3>
                    {variant === 'page' ? (
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                            {t('common.back')}
                        </button>
                    ) : (
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label={t('common.close')}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                    <p className="text-gray-600">{t('explorer.import_profile_builder_intro')}</p>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {t('explorer.import_profile_sample_file')}
                        </label>
                        <input
                            type="file"
                            accept=".xls,.xlsx"
                            onChange={(e) => readFile(e.target.files?.[0] ?? null)}
                            className="text-sm w-full"
                        />
                        {parseError && <p className="text-red-600 text-xs mt-1">{parseError}</p>}
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
                                        onChange={(e) => setSheetName(e.target.value)}
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
                                        {t('explorer.import_profile_col_charged_currency')}
                                    </label>
                                    <select
                                        className={selectCls}
                                        value={lChgCurCol}
                                        onChange={(e) => setLChgCurCol(parseInt(e.target.value, 10))}
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
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_col_extra')}
                                    </label>
                                    <select
                                        className={selectCls}
                                        value={lExtraCol === '' ? '' : String(lExtraCol)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setLExtraCol(v === '' ? '' : parseInt(v, 10));
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
                                                    {f}
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
                                                field: 'memo',
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
                                        <option value="dmy_slash">DD/MM/YYYY (slash)</option>
                                        <option value="dmy_dot">DD.MM.YYYY (dot)</option>
                                        <option value="mdy_slash">MM/DD/YYYY</option>
                                        <option value="ymd_dash">YYYY-MM-DD</option>
                                        <option value="excel_serial">Excel serial number</option>
                                        <option value="iso">ISO / auto</option>
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_provider_id')}
                                    </label>
                                    <input
                                        type="text"
                                        className={selectCls}
                                        value={provider}
                                        onChange={(e) => setProvider(e.target.value)}
                                        placeholder="imported"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                        {t('explorer.import_profile_name')}
                                    </label>
                                    <input
                                        type="text"
                                        className={selectCls}
                                        value={profileName}
                                        onChange={(e) => setProfileName(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                    {t('explorer.import_profile_category_optional')}
                                </label>
                                <select
                                    className={selectCls}
                                    value={categoryCol === '' ? '' : String(categoryCol)}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setCategoryCol(v === '' ? '' : parseInt(v, 10));
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
                                        disabled={!workbook}
                                        onClick={runTxnTest}
                                        className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-lg border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {t('explorer.import_profile_test_btn')}
                                    </button>
                                </div>
                                {txnTestError && (
                                    <div className="px-2 py-2 text-xs text-red-700 bg-red-50 border-t border-red-100">{txnTestError}</div>
                                )}
                                {txnTestResults && txnTestResults.length === 0 && !txnTestError && (
                                    <div className="px-2 py-3 text-xs text-gray-600">{t('explorer.import_profile_test_empty')}</div>
                                )}
                                {txnTestResults && txnTestResults.length > 0 && (
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

                <div className="p-4 border-t border-gray-100 flex justify-end gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        disabled={!workbook}
                        onClick={handleSave}
                        className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${!workbook ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {t('explorer.import_profile_save')}
                    </button>
                </div>
            </div>
        </div>
    );
}
