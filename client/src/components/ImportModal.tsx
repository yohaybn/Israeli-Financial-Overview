import { useState, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScrapeResult, Transaction } from '@app/shared';
import { parseTabularImportProfileJson } from '@app/shared';
import { useImportPreview, useImportCommit, useImportProfilesList, fetchImportProfileJsonByFilename } from '../hooks/useScraper';
import { useUnifiedData } from '../hooks/useUnifiedData';
import { useProviders, getProviderDisplayName } from '../hooks/useProviders';
import { PENDING_TABULAR_IMPORT_PROFILE_JSON_KEY } from '../utils/pendingTabularImportProfile';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (importResults: any[]) => void;
    /** Full-page import format builder (replaces the old in-modal builder). */
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

const importFieldCls =
    'w-full rounded-xl border border-gray-200 bg-gray-100/90 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-600/40 focus:ring-2 focus:ring-emerald-200/60 disabled:opacity-50';

export function ImportModal({ isOpen, onClose, onSuccess, onOpenImportProfile }: ImportModalProps) {
    const { t, i18n } = useTranslation();
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [isComplete, setIsComplete] = useState(false);
    const [accountNumberOverride, setAccountNumberOverride] = useState('');
    const [providerTarget, setProviderTarget] = useState<string | undefined>(undefined);
    const [providerNameOverride, setProviderNameOverride] = useState('');
    const [useAi, setUseAi] = useState(false);
    const [aiReview, setAiReview] = useState<ReviewEntry[] | null>(null);
    const [importProfileJson, setImportProfileJson] = useState<string | null>(null);
    const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
    const [savedServerProfileFilename, setSavedServerProfileFilename] = useState<string | null>(null);
    const [loadingSavedProfilePick, setLoadingSavedProfilePick] = useState(false);
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
    const {
        data: savedImportProfiles = [],
        isLoading: savedProfilesListLoading,
        isError: savedProfilesListError,
    } = useImportProfilesList(isOpen);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const profileJsonInputRef = useRef<HTMLInputElement>(null);
    const [dropActive, setDropActive] = useState(false);
    const dropEnterCount = useRef(0);

    useEffect(() => {
        if (!isOpen) return;
        try {
            const raw = sessionStorage.getItem(PENDING_TABULAR_IMPORT_PROFILE_JSON_KEY);
            if (!raw) return;
            sessionStorage.removeItem(PENDING_TABULAR_IMPORT_PROFILE_JSON_KEY);
            parseTabularImportProfileJson(raw);
            setImportProfileJson(raw);
            setSavedServerProfileFilename(null);
            setProfileLoadError(null);
            setUseAi(false);
        } catch (err: unknown) {
            setProfileLoadError(err instanceof Error ? err.message : String(err));
            setImportProfileJson(null);
            setSavedServerProfileFilename(null);
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
                providerNameOverride,
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

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dropEnterCount.current += 1;
        setDropActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dropEnterCount.current -= 1;
        if (dropEnterCount.current <= 0) {
            dropEnterCount.current = 0;
            setDropActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dropEnterCount.current = 0;
        setDropActive(false);
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
        setProviderNameOverride('');
        setUseAi(false);
        setIsComplete(false);
        setAiReview(null);
        setImportProfileJson(null);
        setProfileLoadError(null);
        setSavedServerProfileFilename(null);
        setLoadingSavedProfilePick(false);
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

    const isRtl = i18n.dir() === 'rtl';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
                className={`relative bg-white shadow-2xl w-full ${aiReview ? 'max-w-5xl' : 'max-w-xl'} max-h-[90vh] flex flex-col overflow-hidden rounded-2xl border border-gray-200/80`}
                dir={i18n.dir()}
            >
                <button
                    type="button"
                    onClick={resetAndClose}
                    className="absolute end-4 top-4 z-20 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    aria-label={t('common.close')}
                >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {(isComplete || aiReview) && (
                    <div className="flex items-center border-b border-gray-100 px-6 pb-4 pt-6 pe-14">
                        <h2 className="text-xl font-bold text-gray-900">
                            {aiReview ? t('explorer.import_review_title') : t('explorer.import_files')}
                        </h2>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {!isComplete && !aiReview && (
                        <>
                            <header className="mb-6 flex gap-4">
                                <div className="shrink-0 text-gray-200" aria-hidden>
                                    <svg className="h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.25}
                                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                                        />
                                    </svg>
                                </div>
                                <div className="min-w-0 flex-1 space-y-2 text-start">
                                    <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t('explorer.import_files')}</h2>
                                    <p className="text-sm leading-relaxed text-gray-600">{t('explorer.import_description')}</p>
                                </div>
                            </header>

                            <div className="space-y-2">
                                <p className="text-xs font-medium text-gray-600">{t('explorer.import_upload_label')}</p>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            fileInputRef.current?.click();
                                        }
                                    }}
                                    onDragOver={handleDragOver}
                                    onDragEnter={handleDragEnter}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-10 text-center transition-all ${
                                        dropActive
                                            ? 'border-emerald-500 bg-emerald-50/60'
                                            : 'border-gray-200 bg-gray-50/40 hover:border-emerald-400/70 hover:bg-emerald-50/30'
                                    }`}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        multiple
                                        accept=".xls,.xlsx,.pdf,.json"
                                        className="hidden"
                                    />
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
                                            <svg className="h-9 w-9 text-emerald-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM8 12h8v2H8v-2zm0 4h8v2H8v-2zm0-8h3v2H8V8z" />
                                            </svg>
                                        </div>
                                        <span className="text-sm font-semibold text-gray-800">{t('explorer.import_drop_here')}</span>
                                        <span className="text-xs text-gray-500">{t('explorer.import_drop_click_hint')}</span>
                                        <div className="mt-3 flex flex-wrap justify-center gap-2">
                                            {(['JSON', 'PDF', 'XLSX', 'XLS'] as const).map((fmt) => (
                                                <span
                                                    key={fmt}
                                                    className="rounded-md bg-gray-100/90 px-2 py-0.5 text-[11px] font-medium text-gray-500"
                                                >
                                                    {fmt}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {selectedFiles.length > 0 && (
                                <div className="mt-4 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                                    {selectedFiles.map((file, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2.5 text-sm"
                                        >
                                            <div className="flex min-w-0 items-center gap-2">
                                                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth="2"
                                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                    />
                                                </svg>
                                                <span className="truncate text-gray-800">{file.name}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeFile(idx);
                                                }}
                                                className="shrink-0 p-1 text-red-500 hover:text-red-700"
                                            >
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedFiles.length > 1 && (
                                <div className="mt-3 flex gap-2.5 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-start text-xs leading-snug text-amber-950">
                                    <svg className="h-4 w-4 shrink-0 text-amber-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                                        <path
                                            fillRule="evenodd"
                                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                    <span>{t('explorer.import_same_provider_warning')}</span>
                                </div>
                            )}

                            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="importAccountSelect" className="block text-xs font-medium text-gray-600">
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
                                        className={importFieldCls}
                                        disabled={busy}
                                    >
                                        <option value="">{t('explorer.import_account_auto')}</option>
                                        {accountOptions.map((opt) => (
                                            <option key={`${opt.provider}|${opt.accountNumber}`} value={`${opt.provider}|${opt.accountNumber}`}>
                                                {getProviderDisplayName(opt.provider, providers, i18n.language)} · {opt.accountNumber}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="accountNumber" className="block text-xs font-medium text-gray-600">
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
                                        placeholder={t('explorer.import_account_placeholder')}
                                        className={importFieldCls}
                                        disabled={busy}
                                    />
                                </div>
                            </div>
                            <p className="mt-1 text-[11px] leading-snug text-gray-400">{t('explorer.import_account_hint')}</p>

                            <div className="mt-4 space-y-1.5">
                                <label htmlFor="importProviderId" className="block text-xs font-medium text-gray-600">
                                    {t('explorer.import_provider_name_label')}
                                </label>
                                <select
                                    id="importProviderId"
                                    value={providerNameOverride}
                                    onChange={(e) => setProviderNameOverride(e.target.value)}
                                    className={importFieldCls}
                                    disabled={busy}
                                >
                                    <option value="">{t('explorer.import_provider_id_auto')}</option>
                                    {providers.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {getProviderDisplayName(p.id, providers, i18n.language)}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[11px] leading-snug text-gray-500">{t('explorer.import_provider_name_hint')}</p>
                            </div>

                            <div className="mt-5 space-y-3">
                                <div className="space-y-1.5">
                                    <label htmlFor="savedImportProfileSelect" className="block text-xs font-medium text-gray-600">
                                        {t('explorer.import_profile_saved_select_label')}
                                    </label>
                                    {savedProfilesListError && (
                                        <p className="text-xs text-red-700">{t('explorer.import_profile_saved_list_error')}</p>
                                    )}
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <select
                                            id="savedImportProfileSelect"
                                            className={`${importFieldCls} min-w-0 sm:min-w-[220px] sm:flex-1`}
                                            disabled={busy || loadingSavedProfilePick || savedProfilesListLoading}
                                            value={savedServerProfileFilename || ''}
                                            onChange={async (e) => {
                                                const fn = e.target.value;
                                                if (!fn) {
                                                    setSavedServerProfileFilename(null);
                                                    setImportProfileJson(null);
                                                    setProfileLoadError(null);
                                                    return;
                                                }
                                                setLoadingSavedProfilePick(true);
                                                setProfileLoadError(null);
                                                try {
                                                    const text = await fetchImportProfileJsonByFilename(fn);
                                                    parseTabularImportProfileJson(text);
                                                    setImportProfileJson(text);
                                                    setSavedServerProfileFilename(fn);
                                                    setUseAi(false);
                                                } catch (err: unknown) {
                                                    setProfileLoadError(err instanceof Error ? err.message : String(err));
                                                    setImportProfileJson(null);
                                                    setSavedServerProfileFilename(null);
                                                } finally {
                                                    setLoadingSavedProfilePick(false);
                                                }
                                            }}
                                        >
                                            <option value="">{t('explorer.import_profile_saved_placeholder')}</option>
                                            {savedImportProfiles.map((item) => (
                                                <option key={item.filename} value={item.filename}>
                                                    {item.name?.trim()
                                                        ? `${item.name.trim()} (${item.filename})`
                                                        : item.filename}
                                                </option>
                                            ))}
                                        </select>
                                        {(savedProfilesListLoading || loadingSavedProfilePick) && (
                                            <span className="text-xs text-gray-500 whitespace-nowrap">
                                                {loadingSavedProfilePick
                                                    ? t('explorer.import_profile_saved_loading_one')
                                                    : t('explorer.import_profile_saved_loading')}
                                            </span>
                                        )}
                                    </div>
                                    {!savedProfilesListLoading &&
                                        !savedProfilesListError &&
                                        savedImportProfiles.length === 0 && (
                                            <p className="text-[11px] leading-snug text-gray-500">
                                                {t('explorer.import_profile_saved_empty')}
                                            </p>
                                        )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={onOpenImportProfile}
                                        disabled={busy}
                                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100/90 px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-200/90 disabled:opacity-50"
                                    >
                                        <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                                            />
                                        </svg>
                                        {t('explorer.import_profile_create')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => profileJsonInputRef.current?.click()}
                                        disabled={busy}
                                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100/90 px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-200/90 disabled:opacity-50"
                                    >
                                        <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                                            />
                                        </svg>
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
                                                    setSavedServerProfileFilename(null);
                                                    setProfileLoadError(null);
                                                    setUseAi(false);
                                                } catch (err: unknown) {
                                                    setProfileLoadError(err instanceof Error ? err.message : String(err));
                                                    setImportProfileJson(null);
                                                    setSavedServerProfileFilename(null);
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
                                                setSavedServerProfileFilename(null);
                                                setProfileLoadError(null);
                                            }}
                                            className="self-center text-xs font-medium text-red-600 hover:underline"
                                        >
                                            {t('explorer.import_profile_clear')}
                                        </button>
                                    )}
                                </div>
                                {importProfileJson && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900">
                                        <span className="min-w-0 flex-1">{t('explorer.import_profile_active')}</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const blob = new Blob([importProfileJson], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = 'tabular-import-format.json';
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            }}
                                            className="shrink-0 font-semibold text-emerald-800 underline-offset-2 hover:underline"
                                        >
                                            {t('explorer.import_profile_download')}
                                        </button>
                                    </div>
                                )}
                                {profileLoadError && <p className="text-xs text-red-700">{profileLoadError}</p>}
                                <p className="text-[11px] leading-snug text-gray-500">{t('explorer.import_profile_hint')}</p>
                            </div>

                            <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-100/80 bg-emerald-50/70 p-4">
                                <div className={`shrink-0 text-emerald-600 ${isRtl ? 'order-3' : 'order-1'}`} aria-hidden>
                                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                                    </svg>
                                </div>
                                <div className="order-2 min-w-0 flex-1 text-start">
                                    <span className="text-sm font-semibold text-emerald-800">{t('explorer.use_ai_parsing')}</span>
                                    <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{t('explorer.ai_parsing_desc')}</p>
                                </div>
                                <div className={`shrink-0 ${isRtl ? 'order-1' : 'order-3'}`} dir="ltr">
                                    <label className="relative inline-flex cursor-pointer items-center">
                                        <input
                                            type="checkbox"
                                            role="switch"
                                            aria-checked={useAi}
                                            checked={useAi}
                                            onChange={(e) => setUseAi(e.target.checked)}
                                            className="peer sr-only"
                                            disabled={busy || !!importProfileJson}
                                        />
                                        <div className="relative h-6 w-11 shrink-0 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-200 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-focus-visible:outline-none peer-focus-visible:ring-4 peer-focus-visible:ring-emerald-200 peer-disabled:opacity-50" />
                                    </label>
                                </div>
                            </div>
                        </>
                    )}

                    {isComplete && !aiReview && fileStatuses.length > 0 && (
                        <div className="max-h-60 space-y-2 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                            {fileStatuses.map((file, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
                                        file.status === 'success'
                                            ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
                                            : 'border-red-200 bg-red-50 text-red-800'
                                    }`}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        {file.status === 'success' ? (
                                            <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                <path
                                                    fillRule="evenodd"
                                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        ) : (
                                            <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                <path
                                                    fillRule="evenodd"
                                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        )}
                                        <div className="min-w-0">
                                            <span className="block truncate font-medium">{file.name}</span>
                                            {file.error && <span className="text-xs opacity-90">{file.error}</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
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
                                                        <th className="px-2 py-2 font-medium min-w-[120px] max-w-[200px]">{t('table.memo')}</th>
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
                                                                    type="text"
                                                                    className={inputCls + ' w-full min-w-[100px] max-w-[200px]'}
                                                                    value={txn.memo ?? ''}
                                                                    onChange={(e) =>
                                                                        patchTxn(gi, ti, {
                                                                            memo: e.target.value.trim() ? e.target.value : undefined,
                                                                        })
                                                                    }
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

                    {stepError && (
                        <div className="p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200">
                            {(stepError as Error).message || t('common.error')}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 p-6">
                    {isComplete ? (
                        <button
                            type="button"
                            onClick={resetAndClose}
                            className="rounded-full bg-emerald-900 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-950 active:scale-[0.98]"
                        >
                            {t('common.close')}
                        </button>
                    ) : aiReview ? (
                        <>
                            <button
                                type="button"
                                onClick={backFromAiReview}
                                className="rounded-full px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                                disabled={busy}
                            >
                                {t('explorer.import_back_to_files')}
                            </button>
                            <button
                                type="button"
                                onClick={handleCommitReview}
                                disabled={busy || !canCommitAiReview}
                                className={`rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-md transition active:scale-[0.98] ${busy || !canCommitAiReview ? 'cursor-not-allowed bg-emerald-400' : 'bg-emerald-800 hover:bg-emerald-900 hover:shadow-lg'}`}
                            >
                                {isCommitting ? (
                                    <span className="inline-flex items-center gap-2">
                                        <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        {t('explorer.uploading')}
                                    </span>
                                ) : (
                                    t('explorer.import_save_confirm')
                                )}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={resetAndClose}
                                className="text-sm font-medium text-gray-600 underline-offset-2 transition hover:text-gray-900 hover:underline disabled:opacity-50"
                                disabled={busy}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleUpload}
                                disabled={selectedFiles.length === 0 || busy}
                                className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-md transition active:scale-[0.98] ${selectedFiles.length === 0 || busy ? 'cursor-not-allowed bg-emerald-400' : 'bg-emerald-800 hover:bg-emerald-900 hover:shadow-lg'}`}
                            >
                                {busy ? (
                                    <>
                                        <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        {t('explorer.import_parsing')}
                                    </>
                                ) : (
                                    <>
                                        <svg
                                            className={`h-4 w-4 shrink-0 ${isRtl ? 'rotate-180' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            aria-hidden
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                                        </svg>
                                        {t('explorer.import_parse_preview')}
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
