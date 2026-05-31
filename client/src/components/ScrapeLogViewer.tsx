import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { apiClient } from '../lib/api';
import { buildAppUrlSearch } from '../utils/appUrlState';
import { format } from 'date-fns';
import { he, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { ScrapeResultPanel } from './ScrapeResultPanel';

type ScrapeRunActionStatus =
  | 'ok'
  | 'skipped'
  | 'partial'
  | 'failed'
  | 'skipped_no_key'
  | 'queued';

interface ScrapeRunActionRecord {
  key: string;
  status: ScrapeRunActionStatus;
  detail?: string;
  aiLogIds?: string[];
}

interface ScrapeRunLogEntry {
  id: string;
  timestamp: string;
  pipelineId: string;
  companyId?: string;
  profileName?: string;
  runSource?: 'telegram_bot' | 'scheduler' | 'manual';
  kind: 'single' | 'batch';
  transactionCount: number;
  scrapeSuccess: boolean;
  savedFilename?: string | null;
  savedFilenames?: string[];
  actions: ScrapeRunActionRecord[];
  overallPostScrape: 'ok' | 'partial' | 'failed';
}

function resultJsonHref(entryId: string, filename: string): string {
  const search = buildAppUrlSearch({
    view: 'logs',
    configTab: 'ai',
    logType: 'scrape',
    logEntryId: entryId,
    resultFile: filename,
    insightRuleId: null,
  });
  return `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
}

function shortAiLogId(id: string): string {
  if (id.length <= 20) return id;
  return `${id.slice(0, 18)}…`;
}

function statusBadgeClass(status: ScrapeRunActionStatus): string {
  switch (status) {
    case 'ok':
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    case 'partial':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'skipped':
    case 'skipped_no_key':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'queued':
      return 'bg-sky-100 text-sky-900 border-sky-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function filenamesForLog(log: ScrapeRunLogEntry): string[] {
  if (log.savedFilename) return [log.savedFilename];
  if (log.savedFilenames?.length) return log.savedFilenames;
  return [];
}

interface ScrapeLogViewerProps {
  initialEntryId?: string | null;
  onEntryIdChange?: (id: string | null) => void;
  initialResultFile?: string | null;
  onResultFileChange?: (filename: string | null) => void;
}

export const ScrapeLogViewer: React.FC<ScrapeLogViewerProps> = ({
  initialEntryId,
  onEntryIdChange,
  initialResultFile,
  onResultFileChange,
}) => {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState<ScrapeRunLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ScrapeRunLogEntry | null>(null);
  const [activeResultFile, setActiveResultFile] = useState<string | null>(initialResultFile ?? null);
  const [pagination, setPagination] = useState({ offset: 0, limit: 50, total: 0 });
  const selectedRef = useRef<ScrapeRunLogEntry | null>(null);
  selectedRef.current = selected;

  const setResultFile = useCallback(
    (filename: string | null) => {
      setActiveResultFile(filename);
      onResultFileChange?.(filename);
    },
    [onResultFileChange]
  );

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });
      const response = await apiClient.get(`/scrape-logs/logs?${params}`);
      if (response.data.success) {
        setLogs(response.data.data.logs);
        setPagination((prev) => ({ ...prev, total: response.data.data.total }));
      }
    } catch (e) {
      console.error('Failed to fetch scrape logs:', e);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, pagination.offset]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!initialEntryId) return;
    if (selectedRef.current?.id === initialEntryId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiClient.get(`/scrape-logs/logs/entry/${encodeURIComponent(initialEntryId)}`);
        if (cancelled || !response.data?.success) return;
        const entry = response.data.data as ScrapeRunLogEntry;
        setSelected(entry);
        const files = filenamesForLog(entry);
        if (initialResultFile && files.includes(initialResultFile)) {
          setActiveResultFile(initialResultFile);
        } else if (files.length === 1) {
          setResultFile(files[0]);
        }
      } catch {
        /* not found or network */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEntryId, initialResultFile, setResultFile]);

  useEffect(() => {
    if (initialEntryId || !initialResultFile) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiClient.get(
          `/scrape-logs/logs/by-file/${encodeURIComponent(initialResultFile)}`
        );
        if (cancelled || !response.data?.success) return;
        const entry = response.data.data as ScrapeRunLogEntry;
        setSelected(entry);
        onEntryIdChange?.(entry.id);
        setActiveResultFile(initialResultFile);
      } catch {
        setActiveResultFile(initialResultFile);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEntryId, initialResultFile, onEntryIdChange]);

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'PPpp', { locale: i18n.language === 'he' ? he : enUS });
    } catch {
      return dateString;
    }
  };

  const clearOld = async (days: number) => {
    if (!confirm(t('scrape_logs.confirm_clear', { days }))) return;
    try {
      await apiClient.post(`/scrape-logs/logs/clear-old?daysToRetain=${days}`);
      void fetchLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const clearAll = async () => {
    if (!confirm(t('scrape_logs.confirm_clear_all'))) return;
    try {
      await apiClient.post('/scrape-logs/logs/clear');
      void fetchLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectLog = (log: ScrapeRunLogEntry) => {
    setSelected(log);
    onEntryIdChange?.(log.id);
    const files = filenamesForLog(log);
    if (files.length === 1) {
      setResultFile(files[0]);
    } else if (files.length === 0) {
      setResultFile(null);
    } else {
      setResultFile(files[0]);
    }
  };

  const resultFileOptions = useMemo(() => (selected ? filenamesForLog(selected) : []), [selected]);

  return (
    <div className="space-y-6 p-4 sm:p-6 bg-gray-50 text-left" dir="ltr">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">{t('scrape_logs.title')}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void fetchLogs()}
            className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {t('scrape_logs.refresh')}
          </button>
          <button
            type="button"
            onClick={() => void clearOld(30)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            {t('scrape_logs.clear_old')}
          </button>
          <button
            type="button"
            onClick={() => void clearAll()}
            className="px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
          >
            {t('scrape_logs.clear_all')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500">{t('scrape_logs.loading')}</div>
      ) : logs.length === 0 ? (
        <div className="text-gray-500">{t('scrape_logs.no_logs')}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 text-gray-700 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">{t('scrape_logs.time')}</th>
                    <th className="text-left px-3 py-2 font-semibold">{t('scrape_logs.pipeline')}</th>
                    <th className="text-right px-3 py-2 font-semibold">{t('scrape_logs.tx_count')}</th>
                    <th className="text-left px-3 py-2 font-semibold">{t('scrape_logs.overall')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => handleSelectLog(log)}
                      className={`border-t border-gray-100 cursor-pointer hover:bg-emerald-50/50 ${
                        selected?.id === log.id ? 'bg-emerald-50' : ''
                      }`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(log.timestamp)}</td>
                      <td className="px-3 py-2 text-gray-900 truncate max-w-[140px]" title={log.pipelineId}>
                        {log.pipelineId}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{log.transactionCount}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs border ${statusBadgeClass(
                            log.overallPostScrape === 'ok'
                              ? 'ok'
                              : log.overallPostScrape === 'failed'
                                ? 'failed'
                                : 'partial'
                          )}`}
                        >
                          {log.overallPostScrape}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 text-xs text-gray-600">
              <button
                type="button"
                disabled={pagination.offset === 0}
                onClick={() => setPagination((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
                className="disabled:opacity-40"
              >
                {t('scrape_logs.prev')}
              </button>
              <span>
                {pagination.offset + 1}–{Math.min(pagination.offset + pagination.limit, pagination.total)} /{' '}
                {pagination.total}
              </span>
              <button
                type="button"
                disabled={pagination.offset + pagination.limit >= pagination.total}
                onClick={() => setPagination((p) => ({ ...p, offset: p.offset + p.limit }))}
                className="disabled:opacity-40"
              >
                {t('scrape_logs.next')}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 p-4 min-h-[200px] max-h-[85vh] overflow-y-auto custom-scrollbar">
            {selected ? (
              <div className="space-y-4 text-sm">
                <h3 className="font-bold text-gray-900">{t('scrape_logs.details')}</h3>
                <dl className="grid grid-cols-1 gap-2 text-gray-700">
                  <div>
                    <dt className="text-xs text-gray-500">{t('scrape_logs.file')}</dt>
                    <dd className="text-xs break-all space-y-1.5">
                      {resultFileOptions.length > 1 ? (
                        <select
                          value={activeResultFile ?? ''}
                          onChange={(e) => setResultFile(e.target.value || null)}
                          className="w-full text-xs font-mono border border-gray-200 rounded px-2 py-1"
                        >
                          {resultFileOptions.map((fn) => (
                            <option key={fn} value={fn}>
                              {fn}
                            </option>
                          ))}
                        </select>
                      ) : resultFileOptions.length === 1 ? (
                        <a
                          href={resultJsonHref(selected.id, resultFileOptions[0])}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('scrape_logs.open_result_file')}
                          className="font-mono text-blue-600 hover:text-blue-800 hover:underline inline-block"
                        >
                          {resultFileOptions[0]}
                        </a>
                      ) : (
                        <span className="font-mono text-gray-600">—</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{t('scrape_logs.kind')}</dt>
                    <dd>{selected.kind}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{t('scrape_logs.run_source')}</dt>
                    <dd>{selected.runSource || '—'}</dd>
                  </div>
                </dl>
                <div>
                  <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                    {t('scrape_logs.actions')}
                  </h4>
                  <ul className="space-y-1.5">
                    {selected.actions.map((a, i) => (
                      <li
                        key={`${selected.id}-${a.key}-${i}`}
                        className="flex flex-wrap items-center gap-2 justify-between border-b border-gray-100 pb-1.5"
                      >
                        <span className="font-mono text-xs text-gray-800">{a.key}</span>
                        <span className={`text-xs px-2 py-0.5 rounded border ${statusBadgeClass(a.status)}`}>
                          {a.status}
                        </span>
                        {a.detail && <span className="w-full text-xs text-gray-500 break-words">{a.detail}</span>}
                        {a.aiLogIds && a.aiLogIds.length > 0 && (
                          <div className="w-full flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                            <span className="text-[10px] text-gray-400 shrink-0">
                              {t('scrape_logs.ai_calls_for_step')}
                            </span>
                            {a.aiLogIds.map((logId) => (
                              <button
                                key={logId}
                                type="button"
                                onClick={() =>
                                  window.dispatchEvent(new CustomEvent('open-ai-log-entry', { detail: { id: logId } }))
                                }
                                className="text-xs font-mono text-blue-600 hover:text-blue-800 hover:underline"
                                title={logId}
                              >
                                {shortAiLogId(logId)}
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {activeResultFile && (
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
                      {t('scrape_logs.result_transactions')}
                    </h4>
                    <ScrapeResultPanel filename={activeResultFile} compact />
                  </div>
                )}
              </div>
            ) : activeResultFile ? (
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900">{t('scrape_logs.result_transactions')}</h3>
                <ScrapeResultPanel filename={activeResultFile} compact />
              </div>
            ) : (
              <p className="text-gray-500 text-sm">{t('scrape_logs.select_row')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScrapeLogViewer;
