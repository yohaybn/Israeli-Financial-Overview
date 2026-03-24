import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogs, useLogLevel, useUpdateLogLevel, useClearLogs } from '../hooks/useScraper';
import AILogViewer from './AILogViewer';
import ScrapeLogViewer from './ScrapeLogViewer';
import type { LogTabId } from '../utils/appUrlState';

interface LogViewerProps {
    logType: LogTabId;
    onLogTypeChange: (t: LogTabId) => void;
    logEntryId: string | null;
    onLogEntryIdChange: (id: string | null) => void;
}

function LogTypeTabs({
    logType,
    onChange,
}: {
    logType: LogTabId;
    onChange: (t: LogTabId) => void;
}) {
    const { t } = useTranslation();
    const btn = (type: LogTabId, label: string, activeClass: string) => (
        <button
            type="button"
            onClick={() => onChange(type)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                logType === type ? `bg-white shadow-sm ${activeClass}` : 'text-gray-500 hover:text-gray-700'
            }`}
        >
            {label}
        </button>
    );
    return (
        <div className="flex bg-gray-200/50 p-1 rounded-lg flex-wrap gap-0.5">
            {btn('server', t('common.server'), 'text-blue-600')}
            {btn('client', t('common.client'), 'text-blue-600')}
            {btn('ai', t('common.ai'), 'text-blue-600')}
            {btn('scrape', t('common.scrape'), 'text-emerald-700')}
        </div>
    );
}

export function LogViewer({ logType, onLogTypeChange, logEntryId, onLogEntryIdChange }: LogViewerProps) {
    const { t } = useTranslation();
    const [lines, setLines] = useState(100);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { data: logsData, isLoading } = useLogs(logType === 'ai' || logType === 'scrape' ? 'server' : logType, lines, {
        enabled: logType !== 'ai' && logType !== 'scrape',
    });

    const { data: currentLevel } = useLogLevel();
    const { mutate: updateLevel } = useUpdateLogLevel();
    const { mutate: clearLogs, isPending: isClearing } = useClearLogs();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logsData, logType]);

    if (logType === 'ai' || logType === 'scrape') {
        return (
            <div className="flex flex-col h-full bg-white" dir="ltr">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50">
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start flex-wrap">
                        <h2 className="text-lg font-bold text-gray-800">{t('common.logs')}</h2>
                        <LogTypeTabs logType={logType} onChange={onLogTypeChange} />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    {logType === 'ai' ? (
                        <AILogViewer initialEntryId={logEntryId} onEntryIdChange={onLogEntryIdChange} />
                    ) : (
                        <ScrapeLogViewer initialEntryId={logEntryId} onEntryIdChange={onLogEntryIdChange} />
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white" dir="ltr">
            <div className="p-4 border-b border-gray-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-gray-50">
                <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-start flex-wrap">
                    <h2 className="text-lg font-bold text-gray-800">{t('common.logs')}</h2>
                    <LogTypeTabs logType={logType} onChange={onLogTypeChange} />
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                        <span className="text-xs text-gray-500">{t('common.level')}</span>
                        <select
                            value={currentLevel}
                            onChange={(e) => updateLevel(e.target.value)}
                            className="bg-transparent border-none text-gray-800 text-xs py-0 px-1 focus:ring-0 cursor-pointer outline-none"
                        >
                            <option value="debug">{t('common.debug')}</option>
                            <option value="info">{t('common.info')}</option>
                            <option value="warn">{t('common.warn')}</option>
                            <option value="error">{t('common.error_level')}</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                        <span className="text-xs text-gray-500">{t('common.lines')}</span>
                        <select
                            value={lines}
                            onChange={(e) => setLines(Number(e.target.value))}
                            className="bg-transparent border-none text-gray-800 text-xs py-0 px-1 focus:ring-0 cursor-pointer outline-none"
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
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition"
                    >
                        {isClearing ? t('common.loading') : t('common.clear')}
                    </button>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar min-h-0 bg-gray-50 font-mono text-sm text-left selection:bg-blue-200/60"
            >
                {isLoading ? (
                    <div className="flex items-center justify-center h-full gap-3 text-gray-500">
                        <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        <span>{t('common.loading_logs')}</span>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {logsData?.lines?.split('\n').map((line: string, i: number) => {
                            if (!line.trim()) return null;
                            const colorClass = line.includes('ERROR')
                                ? 'text-red-600'
                                : line.includes('WARN')
                                  ? 'text-amber-700'
                                  : line.includes('DEBUG')
                                    ? 'text-gray-500'
                                    : 'text-gray-800';
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
