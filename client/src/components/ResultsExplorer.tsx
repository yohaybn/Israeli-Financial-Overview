import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrapeResults, useMultipleScrapeResults, useUpdateCategory, useFilters, useAICategorize, useAISettings, useDeleteScrapeResult } from '../hooks/useScraper';
import { TransactionTable } from './TransactionTable';
import { AISettings } from './AISettings';
import { logger } from '../utils/logger';

interface ResultsExplorerProps {
    onOpenImport?: () => void;
    layout?: 'split' | 'stacked' | 'viewer-only';
}

export function ResultsExplorer({ onOpenImport, externalSelectedFiles, onExternalToggleFile }: ResultsExplorerProps & { externalSelectedFiles?: string[], onExternalToggleFile?: (file: string) => void }) {
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
    const [internalSelectedFiles, setInternalSelectedFiles] = useState<string[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const stripJsonExtension = (filename: string) => (filename.endsWith('.json') ? filename.slice(0, -5) : filename);

    const sortedFiles = useMemo(() => {
        return [...(files || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [files]);
    
    const selectedFiles = externalSelectedFiles || internalSelectedFiles;

    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const { data: multiResults } = useMultipleScrapeResults(selectedFiles);

    // Notification helper function
    const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);


    // Consolidate transactions from multiple files
    const activeTransactions = useMemo(() => {
        if (!multiResults) return [];
        const allTxns = multiResults.flatMap(r => r?.transactions || []);
        if (showHidden) return allTxns;
        const activeFilters = filters?.filter((f: any) => f.active) || [];
        return allTxns.filter(t => {
            const description = t.description.toLowerCase();
            return !activeFilters.some((f: any) => description.includes(f.pattern.toLowerCase()));
        });
    }, [multiResults, filters, showHidden]);

    // Backward compatibility help for singular hooks if needed
    const result = multiResults?.[0];

    const handleFileClick = (file: string) => {
        if (onExternalToggleFile) {
            onExternalToggleFile(file);
            return;
        }
        if (selectedFiles.includes(file)) {
            setInternalSelectedFiles(selectedFiles.filter(f => f !== file));
        } else {
            setInternalSelectedFiles([...selectedFiles, file]);
        }
    };

    const handleSelectAll = (checked: boolean) => {
        const allFiles = sortedFiles.map(f => f.filename);
        if (checked) {
            if (onExternalToggleFile) {
                allFiles.forEach(f => {
                    if (!selectedFiles.includes(f)) onExternalToggleFile(f);
                });
            } else {
                setInternalSelectedFiles(allFiles);
            }
        } else {
            if (onExternalToggleFile) {
                selectedFiles.forEach(f => onExternalToggleFile(f));
            } else {
                setInternalSelectedFiles([]);
            }
        }
    };



    const handleUpdateCategory = (transactionId: string, category: string) => {
        // Find which file contains this transaction to perform the update
        const fileIndex = multiResults?.findIndex(r => r?.transactions?.some(t => t.id === transactionId));
        if (fileIndex !== -1 && fileIndex !== undefined && selectedFiles[fileIndex]) {
            updateCategory({ filename: selectedFiles[fileIndex], transactionId, category });
        }
    };


    const handleExport = (format: 'json' | 'csv') => {
        const transactionsToExport = activeTransactions;
        if (!transactionsToExport || transactionsToExport.length === 0) return;

        let content = '';
        let type = '';
        const baseName = selectedFiles.length > 1 ? 'aggregated_results' : selectedFiles[0]?.replace('.json', '') || 'results';
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
            const rows = transactionsToExport.map(t => [
                t.date,
                `"${t.description.replace(/"/g, '""')}"`,
                t.originalAmount,
                t.originalCurrency,
                t.category || '',
                t.status,
                `"${(t.memo || '').replace(/"/g, '""')}"`
            ].join(','));
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
        if (selectedFiles.length === 0) {
            showNotification('info', t('explorer.select_file_first'));
            return;
        }
        const targetFile = selectedFiles[0]; // Categorize the primary selected file for now
        logger.info(`Starting AI categorization for: ${targetFile}`);
        aiCategorize(targetFile, {
            onSuccess: () => {
                logger.info(`Successfully categorized: ${targetFile}`);
                showNotification('success', t('explorer.ai_categorize_success'));
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                logger.error(`AI Categorization failed for ${targetFile}: ${errorMsg}`);
                showNotification('error', t('explorer.ai_categorize_failed', { error: errorMsg }));
            }
        });
    };


    if (isLoadingList) return (
        <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-gray-50 text-gray-400">
            <div className="animate-pulse text-lg">{t('explorer.loading_explorer')}</div>
        </div>
    );

    return (
        <div className="bg-gray-50 border-t border-gray-200 flex flex-col">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 animate-in fade-in slide-in-from-right-5 ${notification.type === 'success' ? 'bg-green-600' :
                    notification.type === 'error' ? 'bg-red-600' :
                        'bg-blue-600'
                    }`}>
                    {notification.message}
                </div>
            )}
            {/* Main Content Area */}
            <div className="w-full p-4">
                {/* Header with File Dropdown & Import Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                        <div className="relative">
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all text-sm font-semibold text-gray-700 min-w-[200px] w-auto whitespace-nowrap"
                            >
                                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="flex-1 text-start overflow-hidden text-ellipsis">
                                    {selectedFiles.length === 0 
                                        ? t('explorer.select_record') 
                                        : (selectedFiles.length === 1 
                                            ? stripJsonExtension(selectedFiles[0]) 
                                            : t('explorer.files_selected_count_plural', { count: selectedFiles.length }))}
                                </span>
                                <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {isDropdownOpen && (
                                <div className="absolute top-full start-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-30 max-h-96 overflow-y-auto animate-in fade-in zoom-in-95 duration-200 lg:start-0">
                                    <div className="p-2 border-b border-gray-50 flex items-center justify-between bg-gray-50/50 sticky top-0 z-10">
                                        <div className="flex items-center gap-2 px-2">
                                            <input
                                                type="checkbox"
                                                checked={sortedFiles.length > 0 && selectedFiles.length === sortedFiles.length}
                                                onChange={(e) => handleSelectAll(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('explorer.select_all')}</span>
                                        </div>
                                        <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full font-bold text-gray-500">{files?.length || 0}</span>
                                    </div>
                                    <div className="py-1">
                                        {sortedFiles.map(file => (
                                            <div
                                                key={file.filename}
                                                onClick={() => handleFileClick(file.filename)}
                                                className={`px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between group border-b border-gray-50 last:border-0 ${selectedFiles.includes(file.filename) ? 'bg-blue-50/50' : ''}`}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0 ${selectedFiles.includes(file.filename) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 group-hover:border-blue-400'}`}>
                                                        {selectedFiles.includes(file.filename) && (
                                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className={`text-sm truncate ${selectedFiles.includes(file.filename) ? 'font-bold text-blue-700' : 'text-gray-700'}`}>
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
                                                                    if (onExternalToggleFile && selectedFiles.includes(file.filename)) {
                                                                        onExternalToggleFile(file.filename);
                                                                    } else {
                                                                        setInternalSelectedFiles(prev => prev.filter(f => f !== file.filename));
                                                                    }
                                                                    showNotification('success', t('explorer.delete_success'));
                                                                }
                                                            });
                                                        }
                                                    }}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

                    <div className="flex items-center gap-2">
                        {selectedFiles.length > 0 && (
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
                        )}
                    </div>
                </div>

                {selectedFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-300">
                        <svg className="w-24 h-24 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-xl font-light">{t('explorer.select_record')}</p>
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Header & Status */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <span className={`w-3 h-3 rounded-full shadow-sm ${selectedFiles.length > 1 ? 'bg-blue-500' : (result?.success ? 'bg-green-500' : 'bg-red-500')}`}></span>
                                    <h2 className="text-2xl font-black text-gray-900 leading-tight truncate max-w-2xl">
                                        {selectedFiles.length > 1 ? t('explorer.aggregated_results', { count: selectedFiles.length }) : selectedFiles[0]}
                                    </h2>
                                </div>
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                                    {selectedFiles.length > 1 ? t('explorer.multi_source_view') : (result?.success ? t('explorer.import_successful') : t('explorer.import_failed', { error: result?.error }))}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 p-2 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <button
                                    onClick={() => setShowHidden(!showHidden)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-2 ${showHidden ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'}`}
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
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    )}
                                    {isCategorizing ? t('explorer.categorizing') : t('explorer.categorize_ai')}
                                </button>

                                <button
                                    onClick={() => setShowRaw(!showRaw)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-2 ${showRaw ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'}`}
                                >
                                    {showRaw ? '📄' : '⚙️'}
                                    {showRaw ? t('explorer.hide_raw') : t('explorer.raw_data')}
                                </button>
                            </div>
                        </div>

                        {/* Transaction Content or Raw JSON */}
                        {showRaw ? (
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-gray-700">{t('explorer.raw_data')}</h3>
                                <pre className="bg-gray-900 text-white p-6 rounded-2xl overflow-x-auto text-[11px] leading-relaxed shadow-xl border-l-[6px] border-blue-500 font-mono">
                                    {JSON.stringify(result, null, 2)}
                                </pre>
                            </div>
                        ) : (result?.success || selectedFiles.length > 0) ? (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold text-gray-800">
                                    {selectedFiles.length > 1 ? t('explorer.aggregated_txns') : t('explorer.transactions')}
                                </h3>
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

            {/* Rename Modal Removed */}



            <AISettings isOpen={showAISettings} onClose={() => setShowAISettings(false)} />
        </div>
    );
}
