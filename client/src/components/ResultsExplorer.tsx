import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrapeResults, useMultipleScrapeResults, useUpdateCategory, useFilters, useRemoveFilter, useToggleFilter, useAICategorize, useAIChat, useAISettings, useDeleteScrapeResult, useRenameResult } from '../hooks/useScraper';
import { TransactionTable } from './TransactionTable';
import { AISettings } from './AISettings';
import { logger } from '../utils/logger';
import { clsx } from 'clsx';
import { ScrapeFileList, ScrapeResultFileMeta } from './scrape/ScrapeFileList';

interface ResultsExplorerProps {
    onOpenImport?: () => void;
    layout?: 'split' | 'stacked';
}

export function ResultsExplorer({ onOpenImport, layout = 'split' }: ResultsExplorerProps) {
    const { t, i18n } = useTranslation();
    const { data: files, isLoading: isLoadingList } = useScrapeResults();
    const { data: aiSettings } = useAISettings();
    const { data: filters } = useFilters();
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

    const handleSendAnalystQuery = (queryText: string, isRetry: boolean = false) => {
        if (!queryText.trim() || selectedFiles.length === 0) {
            showNotification('info', t('explorer.select_file_and_query'));
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
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                logger.error(`AI Analyst query failed: ${errorMsg}`);
                showNotification('error', t('explorer.ai_analyst_failed', { error: errorMsg }));
                // Add error message to chat history
                setChatHistory(prev => [...prev, {
                    role: 'ai',
                    content: t('common.error_with_message', { error: errorMsg }),
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

    // Filter files to show most recent first (based on creation time)
    const sortedFiles = useMemo(() => {
        if (!files) return [];
        return [...files].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [files]);

    const stripJsonExtension = (filename: string) => {
        return filename.endsWith('.json') ? filename.slice(0, -5) : filename;
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
                showNotification('success', t('explorer.rename_success'));
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                logger.error(`Rename failed: ${errorMsg}`);
                showNotification('error', t('explorer.rename_failed', { error: errorMsg }));
            }
        });
    };



    if (isLoadingList) return (
        <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-gray-50 text-gray-400">
            <div className="animate-pulse text-lg">{t('explorer.loading_explorer')}</div>
        </div>
    );

    return (
        <div className={clsx(
            "bg-gray-50 border-t border-gray-200",
            layout === 'split' ? "flex h-[calc(100vh-64px)]" : "flex flex-col"
        )}>
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 animate-in fade-in slide-in-from-right-5 ${notification.type === 'success' ? 'bg-green-600' :
                    notification.type === 'error' ? 'bg-red-600' :
                        'bg-blue-600'
                    }`}>
                    {notification.message}
                </div>
            )}
            {/* File List */}
            <div className={clsx(
                layout === 'split' ? "w-1/4 border-r border-gray-200 overflow-y-auto bg-white shadow-inner" : "p-4"
            )}>
                <ScrapeFileList
                    files={(files || []) as ScrapeResultFileMeta[]}
                    selectedFiles={selectedFiles}
                    onToggleFile={handleFileClick}
                    onSelectAll={handleSelectAll}
                    onRenameClick={(filename) => {
                        setRenameTarget(filename);
                        setNewFileName(stripJsonExtension(filename));
                        setShowRenameModal(true);
                    }}
                    onDeleteClick={(filename) => {
                        if (confirm(t('explorer.confirm_delete'))) {
                            deleteResult(filename, {
                                onSuccess: () => {
                                    setSelectedFiles(prev => prev.filter(f => f !== filename));
                                    showNotification('success', t('explorer.delete_success'));
                                },
                                onError: (err: any) => {
                                    const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                                    logger.error(`Delete failed: ${errorMsg}`);
                                    showNotification('error', t('explorer.delete_failed', { error: errorMsg }));
                                }
                            });
                        }
                    }}
                    onOpenImport={onOpenImport}
                />

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
            <div className={clsx(
                layout === 'split' ? "w-3/4 p-6 overflow-y-auto scroll-smooth" : "p-4"
            )}>
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
                                            {t('common.retry')}
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
                        <h3 className="text-xl font-bold text-gray-900 mb-4">{t('common.rename_file')}</h3>
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">
                                {t('common.rename_from')}: <span className="font-mono font-semibold text-gray-800">{stripJsonExtension(renameTarget || '')}</span>
                            </p>
                            <input
                                type="text"
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                placeholder={t('common.new_name')}
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
                                    {t('common.cancel')}
                                </button>
                                <button
                                    onClick={handleRenameSubmit}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                                    disabled={!newFileName.trim()}
                                >
                                    {t('common.rename')}
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
