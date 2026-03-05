import { useSocket } from '../hooks/useSocket';

// Map progress types to display-friendly labels and colors
const PROGRESS_LABELS: Record<string, { label: string; color: string }> = {
    INITIALIZING: { label: 'Initializing', color: 'bg-blue-500' },
    START_SCRAPING: { label: 'Starting Scrape', color: 'bg-blue-500' },
    LOGGING_IN: { label: 'Logging In', color: 'bg-yellow-500' },
    LOGIN_SUCCESS: { label: 'Login Success', color: 'bg-green-500' },
    LOGIN_FAILED: { label: 'Login Failed', color: 'bg-red-500' },
    CHANGE_PASSWORD: { label: 'Password Change Required', color: 'bg-orange-500' },
    END_SCRAPING: { label: 'Complete', color: 'bg-green-500' },
    TERMINATING: { label: 'Terminating', color: 'bg-gray-500' },
};

export function ScrapeProgress() {
    const { isConnected, progress, logs, completion, clearProgress } = useSocket();

    const latestProgress = progress[progress.length - 1];
    const progressInfo = latestProgress
        ? PROGRESS_LABELS[latestProgress.type] || { label: latestProgress.type, color: 'bg-gray-400' }
        : null;

    return (
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Live Progress</h3>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span className="text-xs text-gray-500">{isConnected ? 'Connected' : 'Disconnected'}</span>
                    {(progress.length > 0 || logs.length > 0) && (
                        <button
                            onClick={clearProgress}
                            className="text-xs text-blue-600 hover:text-blue-800 ml-2"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Current Status */}
            {progressInfo && (
                <div className="mb-3">
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-white text-xs font-medium ${progressInfo.color}`}>
                            {progressInfo.label}
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
                        {completion.success ? '✓ Scrape Completed' : '✗ Scrape Failed'}
                    </div>
                    {completion.transactionCount !== undefined && (
                        <div className="text-sm text-green-600">
                            {completion.transactionCount} transactions retrieved
                        </div>
                    )}
                    {completion.error && (
                        <div className="text-sm text-red-600">{completion.error}</div>
                    )}
                    {completion.executionTimeMs && (
                        <div className="text-xs text-gray-500 mt-1">
                            Completed in {(completion.executionTimeMs / 1000).toFixed(1)}s
                        </div>
                    )}
                </div>
            )}

            {/* Logs */}
            {logs.length > 0 && (
                <div className="mt-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">Logs</div>
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
                    Start a scrape to see real-time progress here.
                </div>
            )}
        </div>
    );
}
