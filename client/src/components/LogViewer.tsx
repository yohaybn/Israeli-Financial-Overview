import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogs, useLogLevel, useUpdateLogLevel, useClearLogs } from '../hooks/useScraper';
import AILogViewer from './AILogViewer';

interface LogViewerProps {
    initialType?: 'server' | 'client' | 'ai';
}

export function LogViewer({ initialType }: LogViewerProps) {
    const { t } = useTranslation();
    const [logType, setLogType] = useState<'server' | 'client' | 'ai'>(initialType || 'server');
    const [lines, setLines] = useState(100);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { data: logsData, isLoading } = useLogs(logType === 'ai' ? 'server' : logType, lines, {
        enabled: logType !== 'ai'
    });

    const { data: currentLevel } = useLogLevel();
    const { mutate: updateLevel } = useUpdateLogLevel();
    const { mutate: clearLogs, isPending: isClearing } = useClearLogs();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logsData, logType]);

    if (logType === 'ai') {
        return (
            <div className="flex flex-col h-full bg-white" dir="ltr">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50">
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                        <h2 className="text-lg font-bold text-gray-800">{t('common.logs')}</h2>
                        <div className="flex bg-gray-200/50 p-1 rounded-lg">
                            <button
                                onClick={() => setLogType('server')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${(logType as string) === 'server' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {t('common.server')}
                            </button>
                            <button
                                onClick={() => setLogType('client')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${(logType as string) === 'client' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {t('common.client')}
                            </button>
                            <button
                                onClick={() => setLogType('ai')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${(logType as string) === 'ai' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {t('common.ai')}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <AILogViewer />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-900 text-gray-300 font-mono text-sm" dir="ltr">
            <div className="p-4 border-b border-gray-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-gray-950">
                <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-start">
                    <h2 className="text-lg font-bold text-white">{t('common.logs')}</h2>
                    <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
                        <button
                            onClick={() => setLogType('server')}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${(logType as string) === 'server' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {t('common.server')}
                        </button>
                        <button
                            onClick={() => setLogType('client')}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${(logType as string) === 'client' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {t('common.client')}
                        </button>
                        <button
                            onClick={() => setLogType('ai')}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${(logType as string) === 'ai' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {t('common.ai')}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                    <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-800">
                        <span className="text-xs text-gray-500">{t('common.level')}</span>
                        <select
                            value={currentLevel}
                            onChange={(e) => updateLevel(e.target.value)}
                            className="bg-transparent border-none text-white text-xs py-0 px-1 focus:ring-0 cursor-pointer outline-none"
                        >
                            <option value="debug">{t('common.debug')}</option>
                            <option value="info">{t('common.info')}</option>
                            <option value="warn">{t('common.warn')}</option>
                            <option value="error">{t('common.error_level')}</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-800">
                        <span className="text-xs text-gray-500">{t('common.lines')}</span>
                        <select
                            value={lines}
                            onChange={(e) => setLines(Number(e.target.value))}
                            className="bg-transparent border-none text-white text-xs py-0 px-1 focus:ring-0 cursor-pointer outline-none"
                        >
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={200}>200</option>
                            <option value={500}>500</option>
                        </select>
                    </div>
                    <button
                        onClick={() => {
                            if (confirm(t('common.clear_logs_confirm', { type: t(`common.${logType}`) }))) {
                                clearLogs(logType);
                            }
                        }}
                        disabled={isClearing}
                        className="px-3 py-1.5 rounded-lg border border-red-800/50 text-red-400 text-xs font-medium hover:bg-red-900/30 disabled:opacity-50 transition"
                    >
                        {isClearing ? t('common.loading') : t('common.clear')}
                    </button>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 custom-scrollbar selection:bg-blue-500/30"
            >
                {isLoading ? (
                    <div className="flex items-center justify-center h-full gap-3 text-gray-500">
                        <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>{t('common.loading_logs')}</span>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {logsData?.lines?.split('\n').map((line: string, i: number) => {
                            if (!line.trim()) return null;
                            const colorClass = line.includes('ERROR') ? 'text-red-400' :
                                line.includes('WARN') ? 'text-yellow-400' :
                                    line.includes('DEBUG') ? 'text-gray-500' : 'text-gray-300';
                            return (
                                <div key={i} className={`whitespace-pre-wrap ${colorClass}`}>
                                    {line}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
