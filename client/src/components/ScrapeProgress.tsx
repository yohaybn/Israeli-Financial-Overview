import { useSocket } from '../hooks/useSocket';
import { useTranslation } from 'react-i18next';

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

    const latestProgress = progress[progress.length - 1];
    const progressInfo = latestProgress
        ? PROGRESS_LABELS[latestProgress.type] || { labelKey: 'scrape_progress.unknown', color: 'bg-gray-400' }
        : null;

    return (
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">{t('scrape_progress.title')}</h3>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span className="text-xs text-gray-500">{isConnected ? t('scrape_progress.connected') : t('scrape_progress.disconnected')}</span>
                    {(progress.length > 0 || logs.length > 0) && (
                        <button
                            onClick={clearProgress}
                            className="text-xs text-blue-600 hover:text-blue-800 ml-2"
                        >
                            {t('common.clear')}
                        </button>
                    )}
                </div>
            </div>

            {/* Current Status */}
            {progressInfo && (
                <div className="mb-3">
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-white text-xs font-medium ${progressInfo.color}`}>
                            {t(progressInfo.labelKey)}
                        </span>
                        <span className="text-xs text-gray-500">
                            {new Date(latestProgress.timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{latestProgress.message}</p>
                </div>
            )}

            {/* Completion Status */}
            {completion && (
                <div className={`p-3 rounded-md mb-3 ${completion.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className={`font-medium ${completion.success ? 'text-green-700' : 'text-red-700'}`}>
                        {completion.success ? t('scrape_progress.scrape_completed') : t('scrape_progress.scrape_failed')}
                    </div>
                    {completion.transactionCount !== undefined && (
                        <div className="text-sm text-green-600">
                            {t('scrape_progress.transactions_retrieved', { count: completion.transactionCount })}
                        </div>
                    )}
                    {completion.error && (
                        <div className="text-sm text-red-600">{completion.error}</div>
                    )}
                    {completion.executionTimeMs && (
                        <div className="text-xs text-gray-500 mt-1">
                            {t('scrape_progress.completed_in_seconds', { seconds: (completion.executionTimeMs / 1000).toFixed(1) })}
                        </div>
                    )}
                </div>
            )}

            {/* Logs */}
            {logs.length > 0 && (
                <div className="mt-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">{t('common.logs')}</div>
                    <div className="bg-gray-900 text-gray-100 text-xs font-mono p-2 rounded max-h-40 overflow-y-auto">
                        {logs.map((log, i) => (
                            <div key={i} className="py-0.5">{log.message}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {progress.length === 0 && logs.length === 0 && !completion && (
                <div className="text-sm text-gray-500 text-center py-4">
                    {t('scrape_progress.empty')}
                </div>
            )}
        </div>
    );
}
