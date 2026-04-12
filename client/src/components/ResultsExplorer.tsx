import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrapeResults, useScrapeResult, useUpdateCategory, useFilters, useAICategorize, useAISettings, useDeleteScrapeResult } from '../hooks/useScraper';
import { TransactionTable } from './TransactionTable';
import { AISettings } from './AISettings';
import { logClientError } from '../utils/logger';

interface ResultsExplorerProps {
    onOpenImport?: () => void;
    layout?: 'split' | 'stacked' | 'viewer-only';
    externalSelectedFile?: string | null;
    onExternalSelectFile?: (filename: string) => void;
}

export function ResultsExplorer({
    onOpenImport,
    externalSelectedFile,
    onExternalSelectFile,
}: ResultsExplorerProps) {
    const { t } = useTranslation();
    const { data: files, isLoading: isLoadingList } = useScrapeResults();
    const { data: aiSettings } = useAISettings();
    const { data: filters } = useFilters();
    const { mutate: deleteResult } = useDeleteScrapeResult();
    const { mutate: updateCategory } = useUpdateCategory();
    const { mutate: aiCategorize, isPending: isCategorizing } = useAICategorize();
    const [showRaw, setShowRaw] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    const [showAISettings, setShowAISettings] = useState(false);
    const [internalSelectedFile, setInternalSelectedFile] = useState<string | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const stripJsonExtension = (filename: string) => (filename.endsWith('.json') ? filename.slice(0, -5) : filename);

    const sortedFiles = useMemo(() => {
        return [...(files || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [files]);

    const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;

    const { data: result } = useScrapeResult(selectedFile);

    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null);

    const showNotification = useCallback((type: 'success' | 'error' | 'info' | 'warning', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);

    const activeTransactions = useMemo(() => {
        if (!result?.transactions) return [];
        const allTxns = result.transactions;
        if (showHidden) return allTxns;
        const activeFilters = filters?.filter((f: any) => f.active) || [];
        return allTxns.filter((txn) => {
            const description = txn.description.toLowerCase();
            return !activeFilters.some((f: any) => description.includes(f.pattern.toLowerCase()));
        });
    }, [result, filters, showHidden]);

    const handleFileClick = (file: string) => {
        if (onExternalSelectFile) {
            onExternalSelectFile(file);
        } else {
            setInternalSelectedFile(file);
        }
        setIsDropdownOpen(false);
    };

    const handleUpdateCategory = (transactionId: string, category: string) => {
        if (!selectedFile) return;
        updateCategory({ filename: selectedFile, transactionId, category });
    };

    const copyResultDeepLink = useCallback(() => {
        if (!selectedFile) return;
        const p = new URLSearchParams();
        p.set('view', 'scrape');
        p.set('result', encodeURIComponent(selectedFile));
        const url = `${window.location.origin}${window.location.pathname}?${p.toString()}`;
        void navigator.clipboard.writeText(url);
        showNotification('success', t('explorer.link_copied'));
    }, [selectedFile, showNotification, t]);

    const handleExport = (format: 'json' | 'csv') => {
        const transactionsToExport = activeTransactions;
        if (!transactionsToExport || transactionsToExport.length === 0) return;

        let content = '';
        let type = '';
        const baseName = selectedFile?.replace('.json', '') || 'results';
        const filename = `${baseName}.${format}`;

        if (format === 'json') {
            content = JSON.stringify(transactionsToExport, null, 2);
            type = 'application/json';
        } else {
            const headers = [
                t('export.headers.date'),
                t('export.headers.description'),
                t('export.headers.amount'),
                t('export.headers.currency'),
                t('export.headers.category'),
                t('export.headers.status'),
                t('export.headers.memo'),
            ];
            const rows = transactionsToExport.map((txn) =>
                [
                    txn.date,
                    `"${txn.description.replace(/"/g, '""')}"`,
                    txn.originalAmount,
                    txn.originalCurrency,
                    txn.category || '',
                    txn.status,
                    `"${(txn.memo || '').replace(/"/g, '""')}"`,
                ].join(',')
            );
            content = [headers.join(','), ...rows].join('\n');
            type = 'text/csv;charset=utf-8;';
        }

        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleAICategorize = () => {
        if (!selectedFile) {
            showNotification('info', t('explorer.select_file_first'));
            return;
        }
        aiCategorize(selectedFile, {
            onSuccess: (data) => {
                if (data.categorizationError) {
                    showNotification('warning', t('explorer.ai_categorize_partial', { error: data.categorizationError }));
                } else {
                    showNotification('success', t('explorer.ai_categorize_success'));
                }
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                void logClientError(`AI Categorization failed for ${selectedFile}: ${errorMsg}`);
                showNotification('error', t('explorer.ai_categorize_failed', { error: errorMsg }));
            },
        });
    };

    if (isLoadingList)
        return (
            <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-gray-50 text-gray-400">
                <div className="animate-pulse text-lg">{t('explorer.loading_explorer')}</div>
            </div>
        );

    return (
        <div className="bg-gray-50 border-t border-gray-200 flex flex-col">
            {notification && (
                <div
                    className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 animate-in fade-in slide-in-from-right-5 ${
                        notification.type === 'success'
                            ? 'bg-green-600'
                            : notification.type === 'error'
                              ? 'bg-red-600'
                              : notification.type === 'warning'
                                ? 'bg-amber-600'
                                : 'bg-blue-600'
                    }`}
                >
                    {notification.message}
                </div>
            )}
            <div className="w-full p-4">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                        <div className="relative">
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all text-sm font-semibold text-gray-700 min-w-[200px] w-auto whitespace-nowrap"
                            >
                                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                </svg>
                                <span className="flex-1 text-start overflow-hidden text-ellipsis">
                                    {!selectedFile ? t('explorer.select_record') : stripJsonExtension(selectedFile)}
                                </span>
                                <svg
                                    className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {isDropdownOpen && (
                                <div className="absolute top-full start-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-30 max-h-96 overflow-y-auto animate-in fade-in zoom-in-95 duration-200 lg:start-0">
                                    <div className="p-2 border-b border-gray-50 flex items-center justify-between bg-gray-50/50 sticky top-0 z-10">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">{t('explorer.scrape_results')}</span>
                                        <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full font-bold text-gray-500">{files?.length || 0}</span>
                                    </div>
                                    <div className="py-1">
                                        {sortedFiles.map((file) => (
                                            <div
                                                key={file.filename}
                                                onClick={() => handleFileClick(file.filename)}
                                                className={`px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between group border-b border-gray-50 last:border-0 ${
                                                    selectedFile === file.filename ? 'bg-blue-50/50' : ''
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span
                                                            className={`text-sm truncate ${
                                                                selectedFile === file.filename ? 'font-bold text-blue-700' : 'text-gray-700'
                                                            }`}
                                                        >
                                                            {stripJsonExtension(file.filename)}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 truncate">
                                                            {file.transactionCount} txns • {new Date(file.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm(t('explorer.confirm_delete'))) {
                                                            deleteResult(file.filename, {
                                                                onSuccess: () => {
                                                                    if (onExternalSelectFile === undefined && selectedFile === file.filename) {
                                                                        setInternalSelectedFile(null);
                                                                    }
                                                                    showNotification('success', t('explorer.delete_success'));
                                                                },
                                                            });
                                                        }
                                                    }}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth="2"
                                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                        />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {onOpenImport && (
                            <button
                                onClick={onOpenImport}
                                className="px-4 py-2 bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 rounded-xl transition-all text-sm font-bold flex items-center gap-2 shadow-sm"
                            >
                                <span className="text-lg leading-none">+</span>
                                {t('explorer.import_files')}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {selectedFile && (
                            <>
                                <button
                                    type="button"
                                    onClick={copyResultDeepLink}
                                    className="px-3 py-2 text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200"
                                >
                                    {t('explorer.copy_result_link')}
                                </button>
                                <div className="flex gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
                                    <button
                                        onClick={() => handleExport('json')}
                                        className="px-3 py-1.5 text-xs font-bold text-purple-600 hover:bg-white rounded-lg transition-all flex items-center gap-2"
                                    >
                                        JSON
                                    </button>
                                    <button
                                        onClick={() => handleExport('csv')}
                                        className="px-3 py-1.5 text-xs font-bold text-green-600 hover:bg-white rounded-lg transition-all flex items-center gap-2"
                                    >
                                        CSV
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {!selectedFile ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-300">
                        <svg className="w-24 h-24 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1"
                                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        <p className="text-xl font-light">{t('explorer.select_record')}</p>
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <span className={`w-3 h-3 rounded-full shadow-sm ${result?.success ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    <h2 className="text-2xl font-black text-gray-900 leading-tight truncate max-w-2xl">{selectedFile}</h2>
                                </div>
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                                    {result?.success ? t('explorer.import_successful') : t('explorer.import_failed', { error: result?.error })}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 p-2 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <button
                                    onClick={() => setShowHidden(!showHidden)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-2 ${
                                        showHidden ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'
                                    }`}
                                >
                                    {showHidden ? '👁️' : '🕶️'}
                                    {showHidden ? t('explorer.hide_excluded') : t('explorer.show_all')}
                                </button>

                                <div className="h-4 w-[1px] bg-gray-200 mx-1"></div>

                                <button
                                    onClick={handleAICategorize}
                                    disabled={isCategorizing}
                                    className="px-3 py-1.5 text-xs font-bold text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-all border border-amber-100 flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isCategorizing ? (
                                        <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    )}
                                    {isCategorizing ? t('explorer.categorizing') : t('explorer.categorize_ai')}
                                </button>

                                <button
                                    onClick={() => setShowRaw(!showRaw)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-2 ${
                                        showRaw ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'
                                    }`}
                                >
                                    {showRaw ? '📄' : '⚙️'}
                                    {showRaw ? t('explorer.hide_raw') : t('explorer.raw_data')}
                                </button>
                            </div>
                        </div>

                        {showRaw ? (
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-gray-700">{t('explorer.raw_data')}</h3>
                                <pre className="bg-gray-900 text-white p-6 rounded-2xl overflow-x-auto text-[11px] leading-relaxed shadow-xl border-l-[6px] border-blue-500 font-mono">
                                    {JSON.stringify(result, null, 2)}
                                </pre>
                            </div>
                        ) : result?.success || selectedFile ? (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold text-gray-800">{t('explorer.transactions')}</h3>
                                <TransactionTable
                                    transactions={activeTransactions}
                                    categories={aiSettings?.categories}
                                    onUpdateCategory={handleUpdateCategory}
                                />
                            </div>
                        ) : (
                            <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 text-center">
                                <p className="text-gray-400">{t('explorer.no_data_available')}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <AISettings isOpen={showAISettings} onClose={() => setShowAISettings(false)} />
        </div>
    );
}
