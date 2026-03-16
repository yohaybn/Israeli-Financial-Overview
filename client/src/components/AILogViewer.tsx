import React, { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../lib/api';
import { format } from 'date-fns';
import { he, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface AILogEntry {
  id: string;
  timestamp: string;
  model: string;
  provider: 'gemini' | 'openai' | 'ollama';
  requestInfo: {
    systemPrompt?: string;
    userInput: string;
    inputLength: number;
  };
  responseInfo: {
    rawOutput?: string;
    finishReason?: string;
    success: boolean;
  };
  metadata: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
    estimatedCost?: number;
  };
  error?: {
    code: string;
    message: string;
    timestamp: string;
  };
  redactedData?: boolean;
}

interface AILogsStats {
  totalCalls: number;
  totalErrors: number;
  totalTokensUsed: number;
  estimatedTotalCost: number;
  averageLatencyMs: number;
  modelBreakdown: Record<string, { calls: number; tokens: number; cost: number }>;
}

export const AILogViewer: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState<AILogEntry[]>([]);
  const [stats, setStats] = useState<AILogsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AILogEntry | null>(null);
  const [filter, setFilter] = useState({ model: '', provider: '', includeErrors: true });
  const [pagination, setPagination] = useState({ offset: 0, limit: 50, total: 0 });

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
        ...(filter.model && { model: filter.model }),
        ...(filter.provider && { provider: filter.provider }),
        includeErrors: filter.includeErrors.toString()
      });

      const response = await apiClient.get(`/ai-logs/logs?${params}`);
      if (response.data.success) {
        setLogs(response.data.data.logs);
        setPagination(prev => ({ ...prev, total: response.data.data.total }));
      }
    } catch (error) {
      console.error('Failed to fetch AI logs:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, pagination.offset, filter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await apiClient.get('/ai-logs/logs/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const clearOldLogs = useCallback(async (daysToRetain: number = 30) => {
    if (!confirm(t('ai_logs.confirm_clear', { days: daysToRetain }))) return;
    try {
      const response = await apiClient.post(`/ai-logs/logs/clear-old?daysToRetain=${daysToRetain}`);
      if (response.data.success) {
        fetchLogs();
        fetchStats();
      }
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  }, [fetchLogs, fetchStats, t]);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'PPpp', { locale: i18n.language === 'he' ? he : enUS });
    } catch {
      return dateString;
    }
  };

  const formatJsonOrText = (text?: string) => {
    if (!text) return '';
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON, return as is
      return text;
    }
  };

  const formatCurrency = (value?: number) => {
    if (!value) return '$0.00';
    return `$${value.toFixed(4)}`;
  };

  const formatTokens = (value?: number) => {
    if (!value) return '0';
    return value.toLocaleString();
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 bg-gray-50 text-left" dir="ltr">
      {/* Header - only show if not embedded (e.g. if we ever mount this standalone) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left sm:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('ai_logs.title')}</h1>
        <button
          onClick={() => fetchLogs()}
          className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {t('ai_logs.refresh')}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg shadow p-4 text-left">
            <div className="text-xs sm:text-sm text-gray-600 mb-1">{t('ai_logs.total_calls')}</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.totalCalls}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 text-left">
            <div className="text-xs sm:text-sm text-gray-600 mb-1">{t('ai_logs.errors')}</div>
            <div className={`text-xl sm:text-2xl font-bold ${stats.totalErrors > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.totalErrors}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 text-left">
            <div className="text-xs sm:text-sm text-gray-600 mb-1">{t('ai_logs.total_tokens')}</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900">{formatTokens(stats.totalTokensUsed)}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 text-left">
            <div className="text-xs sm:text-sm text-gray-600 mb-1">{t('ai_logs.estimated_cost')}</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(stats.estimatedTotalCost)}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 text-left">
            <div className="text-xs sm:text-sm text-gray-600 mb-1">{t('ai_logs.avg_latency')}</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.averageLatencyMs}ms</div>
          </div>
        </div>
      )}

      {/* Model Breakdown */}
      {stats && Object.keys(stats.modelBreakdown).length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 text-left">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">{t('ai_logs.model_breakdown')}</h2>
          <div className="overflow-x-auto custom-scrollbar -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-[600px] w-full text-sm text-left">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 whitespace-nowrap">{t('ai_logs.model')}</th>
                    <th className="px-4 py-2 whitespace-nowrap">{t('ai_logs.calls')}</th>
                    <th className="px-4 py-2 whitespace-nowrap">{t('ai_logs.tokens')}</th>
                    <th className="px-4 py-2 whitespace-nowrap">{t('ai_logs.cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats && Object.entries(stats.modelBreakdown).map(([model, data]) => (
                    <tr key={model} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-900 font-medium whitespace-nowrap">{model}</td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{data.calls}</td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{formatTokens(data.tokens)}</td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{formatCurrency(data.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-center">
        <div className="flex flex-wrap gap-4 items-center w-full sm:w-auto">
          <select
            value={filter.model}
            onChange={(e) => handleFilterChange({ ...filter, model: e.target.value })}
            className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">{t('ai_logs.all_models')}</option>
            {stats?.modelBreakdown && Object.keys(stats.modelBreakdown).map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>

          <select
            value={filter.provider}
            onChange={(e) => handleFilterChange({ ...filter, provider: e.target.value })}
            className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">{t('ai_logs.all_providers')}</option>
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>

        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filter.includeErrors}
              onChange={(e) => handleFilterChange({ ...filter, includeErrors: e.target.checked })}
              className="rounded border-gray-300"
            />
            {t('ai_logs.include_errors')}
          </label>

          <button
            onClick={() => clearOldLogs(30)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm sm:ml-4"
          >
            {t('ai_logs.clear_old_logs')}
          </button>
        </div>

        <div className="w-full sm:w-auto sm:ml-auto text-sm text-gray-600 text-center sm:text-right">
          {pagination.total > 0 && `${pagination.offset + 1}-${Math.min(pagination.offset + pagination.limit, pagination.total)} ${t('ai_logs.out_of')} ${pagination.total}`}
        </div>
      </div>

      <div className={`bg-white rounded-lg shadow overflow-hidden ${loading ? 'opacity-50' : ''}`}>
        <div className="overflow-x-auto custom-scrollbar">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-[1000px] w-full text-sm text-left">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">{t('ai_logs.time')}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t('ai_logs.model')}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t('ai_logs.provider')}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t('ai_logs.input')}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t('ai_logs.tokens')}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t('ai_logs.latency')}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t('ai_logs.cost')}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t('ai_logs.status')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.length > 0 ? (
                  logs.map(log => (
                    <tr
                      key={log.id}
                      className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition"
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">{log.model}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${log.provider === 'gemini' ? 'bg-blue-100 text-blue-800' :
                          log.provider === 'openai' ? 'bg-purple-100 text-purple-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                          {log.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 truncate max-w-[200px]" title={log.requestInfo.userInput}>
                        {log.requestInfo.userInput.substring(0, 40)}...
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatTokens(log.metadata.totalTokens)}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{log.metadata.latencyMs}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatCurrency(log.metadata.estimatedCost)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.error ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">{t('ai_logs.error')}</span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">{t('ai_logs.success')}</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      {loading ? t('ai_logs.loading') : t('ai_logs.no_logs')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center gap-4 py-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
            disabled={pagination.offset === 0}
            className="flex-1 sm:flex-none px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('ai_logs.prev')}
          </button>

          <button
            onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
            disabled={pagination.offset + pagination.limit >= pagination.total}
            className="flex-1 sm:flex-none px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('ai_logs.next')}
          </button>
        </div>

        <select
          value={pagination.limit}
          onChange={(e) => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), offset: 0 }))}
          className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="25">{t('ai_logs.logs_per_page', { count: 25 })}</option>
          <option value="50">{t('ai_logs.logs_per_page', { count: 50 })}</option>
          <option value="100">{t('ai_logs.logs_per_page', { count: 100 })}</option>
        </select>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 p-4 flex justify-between items-center text-left">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('ai_logs.log_details')}</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{selectedLog.id}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8 text-left custom-scrollbar">
              {/* Request Info */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                  <h3 className="text-base font-bold text-gray-900">{t('ai_logs.request_info')}</h3>
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-200">
                    <div className="bg-white p-3">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.time')}</p>
                      <p className="text-sm text-gray-900">{formatDate(selectedLog.timestamp)}</p>
                    </div>
                    <div className="bg-white p-3">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.model')}</p>
                      <p className="text-sm text-gray-900 font-medium">{selectedLog.model}</p>
                    </div>
                    <div className="bg-white p-3">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.provider')}</p>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${selectedLog.provider === 'gemini' ? 'bg-blue-50 text-blue-700' :
                        selectedLog.provider === 'openai' ? 'bg-purple-50 text-purple-700' :
                          'bg-green-50 text-green-700'
                        }`}>
                        {selectedLog.provider}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-4">
                    {selectedLog.requestInfo.systemPrompt && (
                      <details className="group" open>
                        <summary className="flex items-center justify-between cursor-pointer list-none py-2 px-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                          <span className="text-sm font-semibold text-gray-700">{t('ai_logs.system_prompt')}</span>
                          <svg className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div className="mt-2 relative">
                          <pre className="text-xs font-mono bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto max-h-[300px] whitespace-pre-wrap">{formatJsonOrText(selectedLog.requestInfo.systemPrompt)}</pre>
                        </div>
                      </details>
                    )}

                    <details className="group" open>
                      <summary className="flex items-center justify-between cursor-pointer list-none py-2 px-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                        <span className="text-sm font-semibold text-gray-700">{t('ai_logs.raw_request')}</span>
                        <svg className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>
                      <div className="mt-2 relative">
                        <pre className="text-xs font-mono bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto max-h-[400px] whitespace-pre-wrap">{formatJsonOrText(selectedLog.requestInfo.userInput)}</pre>
                      </div>
                    </details>
                  </div>
                </div>
              </section>

              {/* Response Info */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-1.5 h-6 rounded-full ${selectedLog.responseInfo.success ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <h3 className="text-base font-bold text-gray-900">{t('ai_logs.response_info')}</h3>
                </div>

                <div className={`bg-gray-50 rounded-xl border ${selectedLog.responseInfo.success ? 'border-gray-200' : 'border-red-200'} overflow-hidden`}>
                  <div className="bg-white p-3 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.finish_reason')}</p>
                    <p className="text-sm font-mono text-gray-900">{selectedLog.responseInfo.finishReason || 'N/A'}</p>
                  </div>

                  <div className="p-4">
                    {selectedLog.responseInfo.success && selectedLog.responseInfo.rawOutput ? (
                      <details className="group" open>
                        <summary className="flex items-center justify-between cursor-pointer list-none py-2 px-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                          <span className="text-sm font-semibold text-gray-700">{t('ai_logs.raw_response')}</span>
                          <svg className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div className="mt-2 relative">
                          <pre className="text-xs font-mono bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto max-h-[500px] whitespace-pre-wrap">{formatJsonOrText(selectedLog.responseInfo.rawOutput)}</pre>
                        </div>
                      </details>
                    ) : (
                      <div className="text-sm text-gray-500 italic p-2">{t('ai_logs.no_output')}</div>
                    )}
                  </div>
                </div>
              </section>

              {/* Error Info */}
              {selectedLog.error && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-6 bg-red-600 rounded-full"></div>
                    <h3 className="text-base font-bold text-red-600">{t('ai_logs.error_info')}</h3>
                  </div>
                  <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-3 font-mono">
                    <div>
                      <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">{t('ai_logs.code')}</p>
                      <p className="text-sm text-red-700 bg-white/50 p-2 rounded border border-red-100">{selectedLog.error.code}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">{t('ai_logs.message')}</p>
                      <p className="text-sm text-red-800 bg-white/50 p-2 rounded border border-red-100 whitespace-pre-wrap">{selectedLog.error.message}</p>
                    </div>
                  </div>
                </section>
              )}

              {/* Metadata */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-6 bg-gray-400 rounded-full"></div>
                  <h3 className="text-base font-bold text-gray-900">{t('ai_logs.metadata')}</h3>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 grid grid-cols-2 md:grid-cols-3 gap-6 font-mono">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.prompt_tokens')}</p>
                    <p className="text-sm text-gray-900">{formatTokens(selectedLog.metadata.promptTokens)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.completion_tokens')}</p>
                    <p className="text-sm text-gray-900">{formatTokens(selectedLog.metadata.completionTokens)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.total_tokens')}</p>
                    <p className="text-sm font-bold text-gray-900">{formatTokens(selectedLog.metadata.totalTokens)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.latency')}</p>
                    <p className="text-sm text-gray-900">{selectedLog.metadata.latencyMs}ms</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.estimated_cost')}</p>
                    <p className="text-sm text-gray-900">{formatCurrency(selectedLog.metadata.estimatedCost)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{t('ai_logs.redacted_data')}</p>
                    <p className={`text-sm ${selectedLog.redactedData ? 'text-orange-600 font-bold' : 'text-gray-900'}`}>{selectedLog.redactedData ? t('ai_logs.yes') : t('ai_logs.no')}</p>
                  </div>
                </div>
              </section>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 p-4 shrink-0 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-all shadow-md active:scale-95 font-medium"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AILogViewer;
