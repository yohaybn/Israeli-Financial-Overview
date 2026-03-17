import { useSocket } from '../hooks/useSocket';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';

// Map progress types to display-friendly labels and colors
const PROGRESS_LABELS: Record<string, { labelKey: string; color: string }> = {
    INITIALIZING: { labelKey: 'scrape_progress.initializing', color: 'bg-blue-500' },
    START_SCRAPING: { labelKey: 'scrape_progress.start_scraping', color: 'bg-blue-500' },
    LOGGING_IN: { labelKey: 'scrape_progress.logging_in', color: 'bg-yellow-500' },
    LOGIN_SUCCESS: { labelKey: 'scrape_progress.login_success', color: 'bg-green-500' },
    LOGIN_FAILED: { labelKey: 'scrape_progress.login_failed', color: 'bg-red-500' },
    CHANGE_PASSWORD: { labelKey: 'scrape_progress.change_password', color: 'bg-orange-500' },
    END_SCRAPING: { labelKey: 'scrape_progress.complete', color: 'bg-green-500' },
    TERMINATING: { labelKey: 'scrape_progress.terminating', color: 'bg-gray-500' },
};

export function ScrapeProgress() {
    const { t } = useTranslation();
    const { isConnected, progress, logs, completion, clearProgress } = useSocket();
    const [isVisible, setIsVisible] = useState(true);

    // Re-show when new progress arrives
    useEffect(() => {
        if (progress.length > 0) {
            setIsVisible(true);
        }
    }, [progress.length]);

    const latestProgress = progress[progress.length - 1];
    const progressInfo = latestProgress
        ? PROGRESS_LABELS[latestProgress.type] || { labelKey: 'scrape_progress.unknown', color: 'bg-gray-400' }
        : null;

    const isActive = progress.length > 0 && !completion;
    const hasFinished = !!completion;

    if (!isVisible || (!isActive && !hasFinished)) return null;

    return (
        <div className="fixed bottom-6 right-6 w-96 z-50 animate-in slide-in-from-bottom-10 duration-500">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="bg-blue-600 p-3 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></span>
                            <h3 className="font-bold text-sm">{t('scrape_progress.title')}</h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {(progress.length > 0 || logs.length > 0) && (
                            <button
                                onClick={clearProgress}
                                className="text-xs bg-blue-700 hover:bg-blue-800 px-2 py-1 rounded transition-colors"
                            >
                                {t('common.clear')}
                            </button>
                        )}
                        <button
                            onClick={() => setIsVisible(false)}
                            className="text-white hover:text-gray-200 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="p-4">
                    {/* Current Status */}
                    {progressInfo && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className={`px-2 py-1 rounded text-white text-[10px] font-bold uppercase tracking-wider ${progressInfo.color}`}>
                                    {t(progressInfo.labelKey)}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                    {new Date(latestProgress.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <p className="text-sm text-gray-700 font-medium line-clamp-2">{latestProgress.message}</p>
                        </div>
                    )}

                    {/* Completion Status */}
                    {completion && (
                        <div className={`p-3 rounded-lg mb-4 ${completion.success ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                            <div className={`text-sm font-bold ${completion.success ? 'text-green-700' : 'text-red-700'} flex items-center gap-2`}>
                                {completion.success ? (
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                                )}
                                {completion.success ? t('scrape_progress.scrape_completed') : t('scrape_progress.scrape_failed')}
                            </div>
                            {completion.transactionCount !== undefined && (
                                <div className="text-xs text-green-600 font-medium mt-1 ml-6">
                                    {t('scrape_progress.transactions_retrieved', { count: completion.transactionCount })}
                                </div>
                            )}
                            {completion.error && (
                                <div className="text-xs text-red-600 mt-1 ml-6">{completion.error}</div>
                            )}
                        </div>
                    )}

                    {/* Logs Mini View */}
                    {logs.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('common.logs')}</div>
                                <div className="text-[10px] text-gray-400">{logs.length} lines</div>
                            </div>
                            <div className="bg-gray-900 text-gray-300 text-[10px] font-mono p-3 rounded-lg max-h-32 overflow-y-auto custom-scrollbar">
                                {logs.slice(-50).map((log, i) => (
                                    <div key={i} className="py-0.5 border-b border-gray-800 last:border-0">
                                        <span className="text-gray-600 mr-2">[{i}]</span>
                                        {log.message}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
