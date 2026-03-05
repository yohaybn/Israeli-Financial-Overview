import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrapeResults, useMultipleScrapeResults, useUpdateCategory, useFilters, useAddFilter, useRemoveFilter, useToggleFilter, useAICategorize, useAIChat, useAISettings, useDeleteScrapeResult, useRenameResult, useMergeResults, useUpdateTransactionType } from '../hooks/useScraper';
import { TransactionTable } from './TransactionTable';
import { AISettings } from './AISettings';
import { logger } from '../utils/logger';

interface ResultsExplorerProps {
    onOpenImport?: () => void;
}

export function ResultsExplorer({ onOpenImport }: ResultsExplorerProps) {
    const { t, i18n } = useTranslation();
    const { data: files, isLoading: isLoadingList } = useScrapeResults();
    const { data: aiSettings } = useAISettings();
    const { data: filters } = useFilters();
    const { mutate: addFilter } = useAddFilter();
    const { mutate: removeFilter } = useRemoveFilter();
    const { mutate: toggleFilter } = useToggleFilter();
    const { mutate: deleteResult } = useDeleteScrapeResult();
    const { mutate: renameResult } = useRenameResult();
    const { mutate: updateCategory } = useUpdateCategory();
    const { mutate: aiCategorize, isPending: isCategorizing } = useAICategorize();
    const { mutate: aiChat, isPending: isChatting } = useAIChat();
    const [showRaw, setShowRaw] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    const [showAnalyst, setShowAnalyst] = useState(false);
    const [showAISettings, setShowAISettings] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renameTarget, setRenameTarget] = useState<string | null>(null);
    const [newFileName, setNewFileName] = useState('');
    const [chatQuery, setChatQuery] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai'; content: string; isError?: boolean; userQuery?: string }[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [mergeOutputName, setMergeOutputName] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const { data: multiResults } = useMultipleScrapeResults(selectedFiles);
    const { mutate: mergeResults, isPending: isMerging } = useMergeResults();

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
        if (selectedFiles.includes(file)) {
            setSelectedFiles(selectedFiles.filter(f => f !== file));
        } else {
            setSelectedFiles([...selectedFiles, file]);
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedFiles(sortedFiles.map(f => f.filename));
        } else {
            setSelectedFiles([]);
        }
    };

    const handleDeleteFile = (e: React.MouseEvent, file: string) => {
        e.stopPropagation();
        if (confirm(t('explorer.confirm_delete', 'Are you sure you want to delete this result?'))) {
            deleteResult(file, {
                onSuccess: () => {
                    setSelectedFiles(prev => prev.filter(f => f !== file));
                    showNotification('success', t('explorer.delete_success', 'File deleted successfully'));
                },
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                    logger.error(`Delete failed: ${errorMsg}`);
                    showNotification('error', `Delete failed: ${errorMsg}`);
                }
            });
        }
    };



    const handleUpdateCategory = (transactionId: string, category: string) => {
        // Find which file contains this transaction to perform the update
        const fileIndex = multiResults?.findIndex(r => r?.transactions?.some(t => t.id === transactionId));
        if (fileIndex !== -1 && fileIndex !== undefined && selectedFiles[fileIndex]) {
            updateCategory({ filename: selectedFiles[fileIndex], transactionId, category });
        }
    };

    const handleAddFilterFromTxn = (description: string) => {
        if (window.confirm(t('explorer.confirm_exclude', { description, defaultValue: `Exclude all future transactions with description: "${description}"?` }))) {
            addFilter(description);
        }
    };

    const { mutate: updateType } = useUpdateTransactionType();

    const handleUpdateType = (transactionId: string, type: string) => {
        const fileIndex = multiResults?.findIndex(r => r?.transactions?.some(t => t.id === transactionId));
        if (fileIndex !== -1 && fileIndex !== undefined && selectedFiles[fileIndex]) {
            updateType({ transactionId, type });
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
            const headers = ['Date', 'Description', 'Amount', 'Currency', 'Category', 'Status', 'Memo'];
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
            showNotification('info', t('explorer.select_file_first', 'Please select a file first'));
            return;
        }
        const targetFile = selectedFiles[0]; // Categorize the primary selected file for now
        logger.info(`Starting AI categorization for: ${targetFile}`);
        aiCategorize(targetFile, {
            onSuccess: () => {
                logger.info(`Successfully categorized: ${targetFile}`);
                showNotification('success', t('explorer.ai_categorize_success', 'Categorization completed successfully'));
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                logger.error(`AI Categorization failed for ${targetFile}: ${errorMsg}`);
                showNotification('error', `Categorization failed: ${errorMsg}`);
            }
        });
    };

    const handleSendAnalystQuery = (queryText: string, isRetry: boolean = false) => {
        if (!queryText.trim() || selectedFiles.length === 0) {
            showNotification('info', t('explorer.select_file_and_query', 'Please select a file and enter a query'));
            return;
        }

        if (!isRetry) {
            setChatHistory(prev => [...prev, { role: 'user', content: queryText }]);
            setChatQuery('');
        } else {
            setChatHistory(prev => prev.filter(m => !m.isError));
        }

        logger.info('Sending AI Analyst query', { query: queryText });
        aiChat({ query: queryText, filename: selectedFiles[0] }, {
            onSuccess: (answer) => {
                logger.info('Received AI Analyst answer');
                setChatHistory(prev => [...prev, { role: 'ai', content: answer }]);
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                logger.error(`AI Analyst query failed: ${errorMsg}`);
                showNotification('error', `AI Analyst failed: ${errorMsg}`);
                // Add error message to chat history
                setChatHistory(prev => [...prev, {
                    role: 'ai',
                    content: `Error: ${errorMsg}`,
                    isError: true,
                    userQuery: queryText
                }]);
            }
        });
    };

    const handleAnalystChat = (e: React.FormEvent) => {
        e.preventDefault();
        handleSendAnalystQuery(chatQuery);
    };

    // Filter files to show most recent first (based on filename timestamp if possible)
    const sortedFiles = useMemo(() => {
        if (!files) return [];
        return [...files].sort((a, b) => b.filename.localeCompare(a.filename));
    }, [files]);

    const stripJsonExtension = (filename: string) => {
        return filename.endsWith('.json') ? filename.slice(0, -5) : filename;
    };

    const handleRenameClick = (e: React.MouseEvent, filename: string) => {
        e.stopPropagation();
        setRenameTarget(filename);
        setNewFileName(stripJsonExtension(filename));
        setShowRenameModal(true);
    };

    const handleRenameSubmit = () => {
        if (!renameTarget || !newFileName.trim()) return;
        const cleanName = newFileName.trim();
        const newFullName = cleanName.endsWith('.json') ? cleanName : `${cleanName}.json`;
        if (newFullName === renameTarget) {
            setShowRenameModal(false);
            return;
        }
        renameResult({ oldFilename: renameTarget, newFilename: newFullName }, {
            onSuccess: () => {
                setShowRenameModal(false);
                setRenameTarget(null);
                setNewFileName('');
                logger.info(`File renamed to: ${newFullName}`);
                showNotification('success', t('explorer.rename_success', 'File renamed successfully'));
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                logger.error(`Rename failed: ${errorMsg}`);
                showNotification('error', `Rename failed: ${errorMsg}`);
            }
        });
    };

    const handleMergeSubmit = () => {
        if (selectedFiles.length < 2) {
            logger.error('Select at least 2 files to merge');
            return;
        }
        if (!mergeOutputName.trim()) {
            logger.error('Please enter a name for the merged file');
            return;
        }

        const outputName = mergeOutputName.trim();
        logger.info(`Merging ${selectedFiles.length} files into: ${outputName}`);

        mergeResults({ filenames: selectedFiles, outputName }, {
            onSuccess: (data) => {
                setShowMergeModal(false);
                setMergeOutputName('');
                setSelectedFiles([]);
                logger.info(`Successfully merged files into: ${data.filename}`);
                showNotification('success', t('explorer.merge_success', 'Files merged successfully'));
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                logger.error(`Merge failed: ${errorMsg}`);
                showNotification('error', `Merge failed: ${errorMsg}`);
            }
        });
    };

    if (isLoadingList) return (
        <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-gray-50 text-gray-400">
            <div className="animate-pulse text-lg">{t('explorer.loading_explorer', 'Loading results explorer...')}</div>
        </div>
    );

    return (
        <div className="flex h-[calc(100vh-64px)] bg-gray-50 border-t border-gray-200">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 animate-in fade-in slide-in-from-right-5 ${notification.type === 'success' ? 'bg-green-600' :
                    notification.type === 'error' ? 'bg-red-600' :
                        'bg-blue-600'
                    }`}>
                    {notification.message}
                </div>
            )}
            {/* Sidebar: File List */}
            <div className="w-1/4 border-r border-gray-200 overflow-y-auto bg-white shadow-inner">
                <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-600 flex justify-between items-center sticky top-0 z-20 group/sidebar">
                    <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-tighter text-gray-400">{t('explorer.records')}</span>
                        <div className="flex items-center gap-2">
                            <span>{t('explorer.scrape', 'Scrape')}</span>
                            <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full">{files?.length || 0}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={sortedFiles.length > 0 && selectedFiles.length === sortedFiles.length}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                            title={t('explorer.select_all', 'Select All')}
                        />
                        <button
                            onClick={() => setShowAISettings(true)}
                            className="p-2 hover:bg-white hover:text-indigo-600 rounded-full transition-all border border-transparent hover:border-indigo-100 shadow-sm bg-white md:bg-transparent text-gray-400"
                            title={t('explorer.ai_settings')}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        <button
                            onClick={onOpenImport}
                            className="p-2 hover:bg-white hover:text-blue-600 rounded-full transition-all border border-transparent hover:border-blue-100 shadow-sm bg-white md:bg-transparent"
                            title={t('explorer.import_files')}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <ul>
                    {selectedFiles.length > 1 && (
                        <li className="p-3 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 font-medium">
                            {t('explorer.files_selected_count', {
                                count: selectedFiles.length,
                                defaultValue: `${selectedFiles.length} files selected for aggregation`
                            })}
                        </li>
                    )}
                    {sortedFiles.map((file) => (
                        <li
                            key={file.filename}
                            onClick={() => handleFileClick(file.filename)}
                            className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-all flex items-center justify-between group ${selectedFiles.includes(file.filename) ? 'bg-blue-100 border-l-4 border-blue-500 shadow-inner' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedFiles.includes(file.filename) ? 'bg-blue-600 border-blue-600 rotate-0 scale-110' : 'border-gray-300 rotate-90 scale-100 group-hover:border-blue-400'}`}>
                                    {selectedFiles.includes(file.filename) && (
                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-gray-800 break-all">{stripJsonExtension(file.filename)}</span>
                                    <span className="text-[10px] text-gray-400 mt-1">{file.transactionCount} transactions • {file.accountCount} accounts</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => handleRenameClick(e, file.filename)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 transition-all rounded-md hover:bg-blue-50"
                                    title={t('common.rename', 'Rename')}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={(e) => handleDeleteFile(e, file.filename)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-all rounded-md hover:bg-red-50"
                                    title={t('common.delete')}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </li>
                    ))}
                    {files?.length === 0 && (
                        <li className="p-10 text-center text-gray-400 italic">
                            <svg className="w-12 h-12 mx-auto mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                            {t('explorer.no_results')}
                        </li>
                    )}
                </ul>

                {/* Filters Management Section */}
                {filters && filters.length > 0 && (
                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('explorer.active_exclusions')}</div>
                        <div className="space-y-2">
                            {filters.map((f: any) => (
                                <div key={f.id} className="flex items-center justify-between bg-white p-2 rounded border border-gray-100 shadow-sm">
                                    <span className={`text-xs truncate flex-1 ${f.active ? 'text-gray-700' : 'text-gray-400 line-through'}`}>{f.pattern}</span>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => toggleFilter(f.id)} className="text-gray-400 hover:text-blue-500">
                                            {f.active ? '👁️' : '🕶️'}
                                        </button>
                                        <button onClick={() => removeFilter(f.id)} className="text-gray-400 hover:text-red-500">
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="w-3/4 p-6 overflow-y-auto scroll-smooth">
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
                                        {selectedFiles.length > 1 ? t('explorer.aggregated_results', { count: selectedFiles.length, defaultValue: `Aggregated Results (${selectedFiles.length} files)` }) : selectedFiles[0]}
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

                                {selectedFiles.length >= 2 && (
                                    <>
                                        <button
                                            onClick={() => setShowMergeModal(true)}
                                            disabled={isMerging}
                                            className="px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-all border border-emerald-100 flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {isMerging ? (
                                                <div className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            )}
                                            {isMerging ? t('explorer.merging', 'Merging...') : t('explorer.combine_files', 'Combine Files')}
                                        </button>
                                        <div className="h-4 w-[1px] bg-gray-200 mx-1"></div>
                                    </>
                                )}

                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleExport('json')}
                                        className="px-3 py-1.5 text-xs font-bold text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-all border border-purple-100 flex items-center gap-2"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        JSON
                                    </button>
                                    <button
                                        onClick={() => handleExport('csv')}
                                        className="px-3 py-1.5 text-xs font-bold text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-all border border-green-100 flex items-center gap-2"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        CSV
                                    </button>
                                </div>

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
                                    {showRaw ? t('explorer.hide_raw', 'Hide Raw') : t('explorer.raw_data')}
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
                                    {selectedFiles.length > 1 ? t('explorer.aggregated_txns', 'Aggregated Transactions') : t('explorer.transactions', 'Transactions')}
                                </h3>
                                <TransactionTable
                                    transactions={activeTransactions}
                                    categories={aiSettings?.categories}
                                    onUpdateCategory={handleUpdateCategory}
                                    onAddFilter={handleAddFilterFromTxn}
                                    onUpdateType={handleUpdateType}
                                />
                            </div>
                        ) : (
                            <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 text-center">
                                <p className="text-gray-400">{t('explorer.no_data_available', 'No transaction data available for this record.')}</p>
                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* AI Analyst Sidebar */}
            {showAnalyst && (
                <div className="w-80 border-l border-gray-200 bg-white flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-indigo-50/30">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                            <span className="font-bold text-indigo-900">{t('analyst.title')}</span>
                        </div>
                        <button onClick={() => setShowAnalyst(false)} className="text-gray-400 hover:text-gray-600 p-1">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                        {chatHistory.length === 0 && (
                            <div className="text-center py-10 text-gray-400">
                                <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-3">
                                    <svg className="w-6 h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                    </svg>
                                </div>
                                <p className="text-sm px-4">{t('analyst.ask_me', { count: activeTransactions.length })}</p>
                            </div>
                        )}
                        {chatHistory.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${msg.role === 'user'
                                    ? 'bg-indigo-600 text-white rounded-tr-none'
                                    : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                    } ${msg.isError ? 'border-red-200 bg-red-50 text-red-700' : ''}`}>
                                    {msg.content}
                                    {msg.isError && msg.userQuery && (
                                        <button
                                            onClick={() => handleSendAnalystQuery(msg.userQuery!, true)}
                                            className="mt-2 text-[11px] font-semibold text-red-600 hover:opacity-75 flex items-center gap-1"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            {t('common.retry', 'Retry')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isChatting && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none p-3 shadow-sm">
                                    <div className="flex gap-1">
                                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></div>
                                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                                    </div>
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 px-1">{t('analyst.thinking')}</span>
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleAnalystChat} className="p-4 border-t border-gray-100">
                        <div className="relative">
                            <input
                                type="text"
                                value={chatQuery}
                                onChange={(e) => setChatQuery(e.target.value)}
                                placeholder={t('analyst.placeholder')}
                                className={`w-full ${i18n.language === 'he' ? 'pr-3 pl-10' : 'pl-3 pr-10'} py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner`}
                            />
                            <button
                                type="submit"
                                disabled={isChatting || !chatQuery.trim()}
                                className={`absolute ${i18n.language === 'he' ? 'left-2' : 'right-2'} top-1.5 text-indigo-600 disabled:text-gray-300 hover:scale-110 transition-transform`}
                            >
                                <svg className={`w-5 h-5 ${i18n.language === 'he' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Rename Modal */}
            {showRenameModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">{t('common.rename_file', 'Rename File')}</h3>
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">
                                {t('common.rename_from', 'From')}: <span className="font-mono font-semibold text-gray-800">{stripJsonExtension(renameTarget || '')}</span>
                            </p>
                            <input
                                type="text"
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                placeholder={t('common.new_name', 'New filename')}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameSubmit();
                                    if (e.key === 'Escape') setShowRenameModal(false);
                                }}
                                autoFocus
                            />
                            <div className="flex gap-3 justify-end pt-4">
                                <button
                                    onClick={() => setShowRenameModal(false)}
                                    className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                                >
                                    {t('common.cancel', 'Cancel')}
                                </button>
                                <button
                                    onClick={handleRenameSubmit}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                                    disabled={!newFileName.trim()}
                                >
                                    {t('common.rename', 'Rename')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Merge Modal */}
            {showMergeModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{t('explorer.combine_files', 'Combine Files')}</h3>
                        <p className="text-sm text-gray-600 mb-2">
                            {t('explorer.combine_confirm', {
                                count: selectedFiles.length,
                                defaultValue: `Combining ${selectedFiles.length} files into one. Duplicate transactions (by ID) will be automatically removed.`
                            })}
                        </p>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                            <p className="text-xs text-amber-800 font-medium flex items-center gap-2">
                                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                                {t('explorer.merge_delete_warning', 'Warning: The original files will be deleted after merging. Only files with the same account can be merged.')}
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('explorer.files_to_combine', 'Files to combine')}:
                                </label>
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 max-h-40 overflow-y-auto">
                                    <ul className="space-y-1">
                                        {selectedFiles.map(file => (
                                            <li key={file} className="text-xs text-gray-600 truncate">
                                                • {stripJsonExtension(file)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('explorer.output_name', 'Output file name')}:
                                </label>
                                <input
                                    type="text"
                                    value={mergeOutputName}
                                    onChange={(e) => setMergeOutputName(e.target.value)}
                                    placeholder={t('explorer.combined_results', 'combined_results')}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleMergeSubmit();
                                        if (e.key === 'Escape') setShowMergeModal(false);
                                    }}
                                    autoFocus
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    {t('explorer.no_extension_needed', 'Note: File extension will be added automatically')}
                                </p>
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <button
                                    onClick={() => setShowMergeModal(false)}
                                    className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                                    disabled={isMerging}
                                >
                                    {t('common.cancel', 'Cancel')}
                                </button>
                                <button
                                    onClick={handleMergeSubmit}
                                    disabled={!mergeOutputName.trim() || isMerging}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isMerging && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                    {isMerging ? t('explorer.combining', 'Combining...') : t('explorer.combine', 'Combine')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <AISettings isOpen={showAISettings} onClose={() => setShowAISettings(false)} />
        </div>
    );
}
