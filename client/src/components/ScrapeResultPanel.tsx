import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrapeResult, useUpdateCategory, useFilters, useAICategorize, useAISettings } from '../hooks/useScraper';
import { TransactionTable } from './TransactionTable';
import { logClientError } from '../utils/logger';
import { buildAppUrlSearch } from '../utils/appUrlState';

interface ScrapeResultPanelProps {
    filename: string;
    compact?: boolean;
    onCopyLink?: () => void;
}

export function ScrapeResultPanel({ filename, compact = false }: ScrapeResultPanelProps) {
    const { t } = useTranslation();
    const { data: result, isLoading } = useScrapeResult(filename);
    const { data: aiSettings } = useAISettings();
    const { data: filters } = useFilters();
    const { mutate: updateCategory } = useUpdateCategory();
    const { mutate: aiCategorize, isPending: isCategorizing } = useAICategorize();
    const [showRaw, setShowRaw] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null);

    const showNotification = useCallback((type: 'success' | 'error' | 'info' | 'warning', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);

    const activeTransactions = useMemo(() => {
        if (!result?.transactions) return [];
        const allTxns = result.transactions;
        if (showHidden) return allTxns;
        const activeFilters = filters?.filter((f: { active?: boolean }) => f.active) || [];
        return allTxns.filter((txn) => {
            const description = txn.description.toLowerCase();
            return !activeFilters.some((f: { pattern: string }) => description.includes(f.pattern.toLowerCase()));
        });
    }, [result, filters, showHidden]);

    const handleUpdateCategory = (transactionId: string, category: string) => {
        updateCategory({ filename, transactionId, category });
    };

    const copyResultDeepLink = useCallback(() => {
        const search = buildAppUrlSearch({
            view: 'logs',
            configTab: 'ai',
            logType: 'scrape',
            logEntryId: null,
            resultFile: filename,
            insightRuleId: null,
        });
        const url = `${window.location.origin}${window.location.pathname}?${search}`;
        void navigator.clipboard.writeText(url);
        showNotification('success', t('explorer.link_copied'));
    }, [filename, showNotification, t]);

    const handleExport = (format: 'json' | 'csv') => {
        const transactionsToExport = activeTransactions;
        if (!transactionsToExport || transactionsToExport.length === 0) return;

        let content = '';
        let type = '';
        const baseName = filename.replace('.json', '') || 'results';
        const exportName = `${baseName}.${format}`;

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
        link.setAttribute('download', exportName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleAICategorize = () => {
        aiCategorize(filename, {
            onSuccess: (data) => {
                if (data.categorizationError) {
                    showNotification('warning', t('explorer.ai_categorize_partial', { error: data.categorizationError }));
                } else {
                    showNotification('success', t('explorer.ai_categorize_success'));
                }
            },
            onError: (err: unknown) => {
                const ax = err as { response?: { data?: { error?: string } }; message?: string };
                const errorMsg = ax?.response?.data?.error || ax.message || t('common.unknown_error');
                void logClientError(`AI Categorization failed for ${filename}: ${errorMsg}`);
                showNotification('error', t('explorer.ai_categorize_failed', { error: errorMsg }));
            },
        });
    };

    if (isLoading) {
        return <div className="text-sm text-gray-500 py-4">{t('scrape_logs.loading')}</div>;
    }

    return (
        <div className={`space-y-4 ${compact ? 'text-sm' : ''}`}>
            {notification && (
                <div
                    className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 ${
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

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${result?.success ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-mono text-xs text-gray-700 truncate" title={filename}>
                        {filename}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={copyResultDeepLink}
                        className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200"
                    >
                        {t('explorer.copy_result_link')}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleExport('json')}
                        className="px-2 py-1 text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-100"
                    >
                        JSON
                    </button>
                    <button
                        type="button"
                        onClick={() => handleExport('csv')}
                        className="px-2 py-1 text-xs font-semibold text-green-600 bg-green-50 hover:bg-green-100 rounded-lg border border-green-100"
                    >
                        CSV
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <button
                    type="button"
                    onClick={() => setShowHidden(!showHidden)}
                    className={`px-2 py-1 text-xs font-bold rounded-lg border ${
                        showHidden ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-white text-gray-600 border-gray-100'
                    }`}
                >
                    {showHidden ? t('explorer.hide_excluded') : t('explorer.show_all')}
                </button>
                <button
                    type="button"
                    onClick={handleAICategorize}
                    disabled={isCategorizing}
                    className="px-2 py-1 text-xs font-bold text-amber-600 bg-amber-50 rounded-lg border border-amber-100 disabled:opacity-50"
                >
                    {isCategorizing ? t('explorer.categorizing') : t('explorer.categorize_ai')}
                </button>
                <button
                    type="button"
                    onClick={() => setShowRaw(!showRaw)}
                    className={`px-2 py-1 text-xs font-bold rounded-lg border ${
                        showRaw ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-gray-600 border-gray-100'
                    }`}
                >
                    {showRaw ? t('explorer.hide_raw') : t('explorer.raw_data')}
                </button>
            </div>

            {showRaw ? (
                <pre className="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto text-[10px] leading-relaxed font-mono max-h-[50vh]">
                    {JSON.stringify(result, null, 2)}
                </pre>
            ) : result?.success || filename ? (
                <TransactionTable
                    transactions={activeTransactions}
                    categories={aiSettings?.categories}
                    onUpdateCategory={handleUpdateCategory}
                />
            ) : (
                <p className="text-gray-400 text-sm">{t('explorer.no_data_available')}</p>
            )}
        </div>
    );
}
