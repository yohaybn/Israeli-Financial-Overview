import { useState, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScrapeResult, Transaction } from '@app/shared';
import { parseTabularImportProfileJson } from '@app/shared';
import { useImportPreview, useImportCommit } from '../hooks/useScraper';
import { useUnifiedData } from '../hooks/useUnifiedData';
import { useProviders, getProviderDisplayName } from '../hooks/useProviders';
import { PENDING_TABULAR_IMPORT_PROFILE_JSON_KEY } from '../utils/pendingTabularImportProfile';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (importResults: any[]) => void;
    /** Full-page import profile builder (replaces the old in-modal builder). */
    onOpenImportProfile: () => void;
}

interface FileStatus {
    name: string;
    status: 'pending' | 'success' | 'error';
    error?: string;
}

type ReviewEntry = { originalName: string; result: ScrapeResult };

function isoDateInputValue(iso: string | undefined): string {
    if (!iso) return '';
    return iso.slice(0, 10);
}

const inputCls =
    'min-w-0 px-1.5 py-1 border border-gray-200 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none';

export function ImportModal({ isOpen, onClose, onSuccess, onOpenImportProfile }: ImportModalProps) {
    const { t, i18n } = useTranslation();
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [isComplete, setIsComplete] = useState(false);
    const [accountNumberOverride, setAccountNumberOverride] = useState('');
    const [providerTarget, setProviderTarget] = useState<string | undefined>(undefined);
    const [useAi, setUseAi] = useState(false);
    const [aiReview, setAiReview] = useState<ReviewEntry[] | null>(null);
    const [importProfileJson, setImportProfileJson] = useState<string | null>(null);
    const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
    const { data: unifiedTxns = [] } = useUnifiedData();
    const { data: providers = [] } = useProviders();

    const accountOptions = useMemo(() => {
        const map = new Map<string, { provider: string; accountNumber: string }>();
        for (const txn of unifiedTxns) {
            if (txn.provider && txn.accountNumber) {
                const k = `${txn.provider}\0${txn.accountNumber}`;
                if (!map.has(k)) {
                    map.set(k, { provider: txn.provider, accountNumber: txn.accountNumber });
                }
            }
        }
        return Array.from(map.values()).sort((a, b) => {
            const pa = getProviderDisplayName(a.provider, providers, i18n.language);
            const pb = getProviderDisplayName(b.provider, providers, i18n.language);
            if (pa !== pb) return pa.localeCompare(pb);
            return a.accountNumber.localeCompare(b.accountNumber);
        });
    }, [unifiedTxns, providers, i18n.language]);

    const { mutate: importPreview, isPending: isPreviewing, error: previewError } = useImportPreview();
    const { mutate: importCommit, isPending: isCommitting, error: commitError } = useImportCommit();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const profileJsonInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        try {
            const raw = sessionStorage.getItem(PENDING_TABULAR_IMPORT_PROFILE_JSON_KEY);
            if (!raw) return;
            sessionStorage.removeItem(PENDING_TABULAR_IMPORT_PROFILE_JSON_KEY);
            parseTabularImportProfileJson(raw);
            setImportProfileJson(raw);
            setProfileLoadError(null);
            setUseAi(false);
        } catch (err: unknown) {
            setProfileLoadError(err instanceof Error ? err.message : String(err));
            setImportProfileJson(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const patchTxn = (groupIdx: number, txnIdx: number, patch: Partial<Transaction>) => {
        setAiReview((prev) => {
            if (!prev) return prev;
            return prev.map((g, gi) => {
                if (gi !== groupIdx) return g;
                const txns = [...(g.result.transactions || [])];
                const cur = txns[txnIdx];
                if (!cur) return g;
                txns[txnIdx] = { ...cur, ...patch };
                return { ...g, result: { ...g.result, transactions: txns } };
            });
        });
    };

    const removeTxnRow = (groupIdx: number, txnIdx: number) => {
        setAiReview((prev) => {
            if (!prev) return prev;
            return prev.map((g, gi) => {
                if (gi !== groupIdx) return g;
                const txns = [...(g.result.transactions || [])];
                txns.splice(txnIdx, 1);
                return { ...g, result: { ...g.result, transactions: txns } };
            });
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const validFiles = files.filter(f => {
                const ext = f.name.split('.').pop()?.toLowerCase();
                return ['xls', 'xlsx', 'pdf', 'json'].includes(ext || '');
            });
            setSelectedFiles(prev => [...prev, ...validFiles]);
            setIsComplete(false);
            setFileStatuses([]);
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const finishSuccess = (data: { results: any[]; success?: boolean; allSuccessful?: boolean }) => {
        setFileStatuses(data.results.map((r: any) => ({
            name: r.originalName,
            status: r.success ? 'success' : 'error',
            error: r.error
        })));
        setIsComplete(true);

        if (data.success && data.allSuccessful) {
            onSuccess?.(data.results);
            setSelectedFiles([]);
            setAiReview(null);
            setTimeout(() => {
                onClose();
                setIsComplete(false);
                setFileStatuses([]);
            }, 2000);
        } else if (data.success) {
            onSuccess?.(data.results);
        }
    };

    const handleUpload = () => {
        if (selectedFiles.length === 0) return;

        importPreview(
            {
                files: selectedFiles,
                accountNumberOverride,
                useAi,
                providerTarget,
                importProfileJson,
            },
            {
                onSuccess: (data) => {
                    const entries: ReviewEntry[] = data.results.map((r) => ({
                        originalName: r.originalName,
                        result: JSON.parse(JSON.stringify(r.preview)) as ScrapeResult,
                    }));
                    setAiReview(entries);
                },
            }
        );
    };

    const handleCommitReview = () => {
        if (!aiReview || aiReview.length === 0) return;
        const items = aiReview.filter(
            g =>
                g.result.success &&
                ((g.result.transactions?.length ?? 0) > 0 || (g.result.accounts?.length ?? 0) > 0)
        );
        if (items.length === 0) return;
        importCommit(items, {
            onSuccess: (data) => {
                setAiReview(null);
                finishSuccess(data);
            }
        });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files) {
            const files = Array.from(e.dataTransfer.files);
            const validFiles = files.filter(f => {
                const ext = f.name.split('.').pop()?.toLowerCase();
                return ['xls', 'xlsx', 'pdf', 'json'].includes(ext || '');
            });
            setSelectedFiles(prev => [...prev, ...validFiles]);
            setIsComplete(false);
            setFileStatuses([]);
        }
    };

    const resetAndClose = () => {
        setSelectedFiles([]);
        setFileStatuses([]);
        setAccountNumberOverride('');
        setProviderTarget(undefined);
        setUseAi(false);
        setIsComplete(false);
        setAiReview(null);
        setImportProfileJson(null);
        setProfileLoadError(null);
        onClose();
    };

    const backFromAiReview = () => {
        setAiReview(null);
    };

    const busy = isPreviewing || isCommitting;
    const stepError = aiReview ? (commitError as Error | null) : (previewError as Error | null);

    const canCommitAiReview =
        !!aiReview?.some(
            g =>
                g.result.success &&
                ((g.result.transactions?.length ?? 0) > 0 || (g.result.accounts?.length ?? 0) > 0)
        );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`bg-white rounded-xl shadow-2xl w-full ${aiReview ? 'max-w-5xl' : 'max-w-lg'} max-h-[90vh] flex flex-col overflow-hidden border border-gray-200`}>
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">
                        {aiReview ? t('explorer.import_review_title') : t('explorer.import_files')}
                    </h2>
                    <button onClick={resetAndClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {!isComplete && !aiReview && (
                        <>
                            <p className="text-gray-600 text-sm">{t('explorer.import_description')}</p>

                            <div
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer group"
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    multiple
                                    accept=".xls,.xlsx,.pdf,.json"
                                    className="hidden"
                                />
                                <div className="flex flex-col items-center">
                                    <svg className="w-12 h-12 text-gray-400 group-hover:text-blue-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <span className="text-sm font-medium text-gray-700">{t('explorer.drop_files')}</span>
                                    <span className="text-xs text-gray-400 mt-1">{t('explorer.supportedFormats')}</span>
                                </div>
                            </div>

                            <div className="space-y-1">
                                {accountOptions.length > 0 ? (
                                    <>
                                        <label htmlFor="importAccountSelect" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            {t('explorer.import_account_from_data')}
                                        </label>
                                        <select
                                            id="importAccountSelect"
                                            value={
                                                providerTarget && accountNumberOverride
                                                    ? `${providerTarget}|${accountNumberOverride}`
                                                    : ''
                                            }
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (!v) {
                                                    setProviderTarget(undefined);
                                                    setAccountNumberOverride('');
                                                    return;
                                                }
                                                const pipe = v.indexOf('|');
                                                if (pipe === -1) return;
                                                setProviderTarget(v.slice(0, pipe));
                                                setAccountNumberOverride(v.slice(pipe + 1));
                                            }}
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white mb-2"
                                            disabled={busy}
                                        >
                                            <option value="">{t('explorer.import_account_auto')}</option>
                                            {accountOptions.map((opt) => (
                                                <option key={`${opt.provider}|${opt.accountNumber}`} value={`${opt.provider}|${opt.accountNumber}`}>
                                                    {getProviderDisplayName(opt.provider, providers, i18n.language)} · {opt.accountNumber}
                                                </option>
                                            ))}
                                        </select>
                                    </>
                                ) : null}
                                <label htmlFor="accountNumber" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    {t('common.account_number')} ({t('common.optional')})
                                </label>
                                <input
                                    id="accountNumber"
                                    type="text"
                                    value={accountNumberOverride}
                                    onChange={(e) => {
                                        setAccountNumberOverride(e.target.value);
                                        setProviderTarget(undefined);
                                    }}
                                    placeholder={t('common.account_number')}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                                    disabled={busy}
                                />
                                <p className="text-[10px] text-gray-400 italic">
                                    {t('explorer.import_account_hint')}
                                </p>
                            </div>

                            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2">
                                <div className="flex flex-wrap gap-2 items-center">
                                    <button
                                        type="button"
                                        onClick={onOpenImportProfile}
                                        disabled={busy}
                                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 disabled:opacity-50"
                                    >
                                        {t('explorer.import_profile_create')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => profileJsonInputRef.current?.click()}
                                        disabled={busy}
                                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 disabled:opacity-50"
                                    >
                                        {t('explorer.import_profile_load_json')}
                                    </button>
                                    <input
                                        ref={profileJsonInputRef}
                                        type="file"
                                        accept=".json,application/json"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            e.target.value = '';
                                            if (!f) return;
                                            const reader = new FileReader();
                                            reader.onload = () => {
                                                try {
                                                    const text = String(reader.result || '');
                                                    parseTabularImportProfileJson(text);
                                                    setImportProfileJson(text);
                                                    setProfileLoadError(null);
                                                    setUseAi(false);
                                                } catch (err: unknown) {
                                                    setProfileLoadError(err instanceof Error ? err.message : String(err));
                                                    setImportProfileJson(null);
                                                }
                                            };
                                            reader.readAsText(f);
                                        }}
                                    />
                                    {importProfileJson && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setImportProfileJson(null);
                                                setProfileLoadError(null);
                                            }}
                                            className="text-xs text-red-600 hover:underline"
                                        >
                                            {t('explorer.import_profile_clear')}
                                        </button>
                                    )}
                                </div>
                                {importProfileJson && (
                                    <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-2 py-1 flex flex-wrap items-center justify-between gap-2">
                                        <span>{t('explorer.import_profile_active')}</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const blob = new Blob([importProfileJson], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = 'tabular-import-profile.json';
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            }}
                                            className="font-medium text-emerald-900 underline hover:no-underline"
                                        >
                                            {t('explorer.import_profile_download')}
                                        </button>
                                    </div>
                                )}
                                {profileLoadError && (
                                    <p className="text-xs text-red-700">{profileLoadError}</p>
                                )}
                                <p className="text-[10px] text-gray-500">{t('explorer.import_profile_hint')}</p>
                            </div>

                            <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100 group transition-all hover:bg-indigo-100/50">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useAi}
                                        onChange={(e) => setUseAi(e.target.checked)}
                                        className="sr-only peer"
                                        disabled={busy || !!importProfileJson}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        {t('explorer.use_ai_parsing')}
                                    </span>
                                    <span className="text-[10px] text-indigo-700/70">
                                        {t('explorer.ai_parsing_desc')}
                                    </span>
                                </div>
                            </div>
                        </>
                    )}

                    {aiReview && !isComplete && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">{t('explorer.import_review_hint')}</p>
                            {useAi && (
                                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    {t('dashboard.ai_disclaimer')}
                                </p>
                            )}
                            {aiReview.map((group, gi) => (
                                <div key={gi} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
                                    <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 text-sm font-semibold text-gray-800 truncate">
                                        {group.originalName}
                                    </div>
                                    {!group.result.success && (
                                        <div className="p-3 text-sm text-red-700 bg-red-50">
                                            {group.result.error || t('common.error')}
                                        </div>
                                    )}
                                    {group.result.success && group.result.transactions && group.result.transactions.length > 0 && (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs border-collapse">
                                                <thead>
                                                    <tr className="bg-white border-b border-gray-200 text-left text-gray-500 uppercase tracking-wide">
                                                        <th className="px-2 py-2 font-medium whitespace-nowrap">{t('table.date')}</th>
                                                        <th className="px-2 py-2 font-medium min-w-[140px]">{t('table.description')}</th>
                                                        <th className="px-2 py-2 font-medium whitespace-nowrap">{t('table.amount')}</th>
                                                        <th className="px-2 py-2 font-medium min-w-[100px]">{t('table.category')}</th>
                                                        <th className="px-2 py-2 font-medium whitespace-nowrap">{t('table.account')}</th>
                                                        <th className="px-2 py-2 font-medium min-w-[80px]">{t('explorer.import_col_provider')}</th>
                                                        <th className="px-2 py-2 font-medium w-10"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {group.result.transactions.map((txn, ti) => (
                                                        <tr key={`${txn.id}-${ti}`} className="border-b border-gray-100 bg-white">
                                                            <td className="px-2 py-1 align-top">
                                                                <input
                                                                    type="date"
                                                                    className={inputCls + ' w-[118px]'}
                                                                    value={isoDateInputValue(txn.date)}
                                                                    onChange={(e) => {
                                                                        const v = e.target.value;
                                                                        const d = v ? `${v}T12:00:00.000Z` : txn.date;
                                                                        patchTxn(gi, ti, { date: d, processedDate: d });
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-1 align-top">
                                                                <input
                                                                    type="text"
                                                                    className={inputCls + ' w-full'}
                                                                    value={txn.description}
                                                                    onChange={(e) => patchTxn(gi, ti, { description: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-1 align-top">
                                                                <input
                                                                    type="number"
                                                                    step="1"
                                                                    className={inputCls + ' w-24'}
                                                                    value={Number.isFinite(txn.amount) ? txn.amount : ''}
                                                                    onChange={(e) => {
                                                                        const n = parseFloat(e.target.value);
                                                                        if (Number.isNaN(n)) return;
                                                                        patchTxn(gi, ti, { amount: n, chargedAmount: n });
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-1 align-top">
                                                                <input
                                                                    type="text"
                                                                    className={inputCls + ' w-full'}
                                                                    value={txn.category ?? ''}
                                                                    onChange={(e) => patchTxn(gi, ti, { category: e.target.value || undefined })}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-1 align-top">
                                                                <input
                                                                    type="text"
                                                                    className={inputCls + ' w-24'}
                                                                    value={txn.accountNumber}
                                                                    onChange={(e) => patchTxn(gi, ti, { accountNumber: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-1 align-top">
                                                                <input
                                                                    type="text"
                                                                    className={inputCls + ' w-full'}
                                                                    value={txn.provider}
                                                                    onChange={(e) => patchTxn(gi, ti, { provider: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="px-1 py-1 align-top">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeTxnRow(gi, ti)}
                                                                    className="text-red-500 hover:text-red-700 p-1"
                                                                    title={t('explorer.import_row_remove')}
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    {group.result.success && (!group.result.transactions || group.result.transactions.length === 0) && (
                                        <div className="p-3 text-sm text-gray-600">{t('explorer.import_no_transactions')}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {(selectedFiles.length > 0 || fileStatuses.length > 0) && !aiReview && (
                        <div className="max-h-60 overflow-y-auto space-y-2 border rounded-lg p-2 bg-gray-50">
                            {isComplete ? (
                                fileStatuses.map((file, idx) => (
                                    <div key={idx} className={`flex items-center justify-between p-3 rounded border text-sm ${file.status === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            {file.status === 'success' ? (
                                                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="truncate font-medium">{file.name}</span>
                                                {file.error && <span className="text-xs opacity-80">{file.error}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                selectedFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 text-sm">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span className="truncate">{file.name}</span>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); removeFile(idx); }} className="text-red-500 hover:text-red-700 ml-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {stepError && (
                        <div className="p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200">
                            {(stepError as Error).message || t('common.error')}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 flex-wrap">
                    {isComplete ? (
                        <button
                            onClick={resetAndClose}
                            className="px-6 py-2 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all shadow-md active:scale-95"
                        >
                            {t('common.close')}
                        </button>
                    ) : aiReview ? (
                        <>
                            <button
                                type="button"
                                onClick={backFromAiReview}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                disabled={busy}
                            >
                                {t('explorer.import_back_to_files')}
                            </button>
                            <button
                                type="button"
                                onClick={handleCommitReview}
                                disabled={busy || !canCommitAiReview}
                                className={`px-6 py-2 text-sm font-medium text-white rounded-lg transition-all shadow-md ${busy || !canCommitAiReview ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-95'}`}
                            >
                                {isCommitting ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('explorer.uploading')}
                                    </span>
                                ) : t('explorer.import_save_confirm')}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                disabled={busy}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={selectedFiles.length === 0 || busy}
                                className={`px-6 py-2 text-sm font-medium text-white rounded-lg transition-all shadow-md ${selectedFiles.length === 0 || busy ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-95'}`}
                            >
                                {busy ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('explorer.import_parsing')}
                                    </span>
                                ) : t('explorer.import_parse_preview')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div >
    );
}
