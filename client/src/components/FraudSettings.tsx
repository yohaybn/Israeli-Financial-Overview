import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalScrapeConfig, FraudDetectionLocalThresholdsConfig, FraudDetectionLocalRulesConfig } from '@app/shared';
import { api } from '../lib/api';

interface FraudSettingsProps {
  isInline?: boolean;
  onClose?: () => void;
}

const DEFAULT_RULES: Required<FraudDetectionLocalRulesConfig> = {
  enableOutlierAmount: true,
  enableNewMerchant: true,
  enableRapidRepeats: true,
  enableForeignCurrency: true,
};

const DEFAULT_THRESHOLDS: Required<FraudDetectionLocalThresholdsConfig> = {
  minAmountForNewMerchantIls: 250,
  foreignCurrencyMinOriginalAmount: 50,
  rapidRepeatWindowMinutes: 30,
  rapidRepeatCountThreshold: 2,
  outlierMinHistoryCount: 6,
  outlierZScore: 3,
  severityLowMinScore: 30,
  severityMediumMinScore: 60,
  severityHighMinScore: 80,
  notifyMinSeverity: 'medium',
  persistOnlyFlagged: true,
};

type FraudFindingDto = {
  id: string;
  transactionId: string;
  detector: 'local' | 'ai';
  score: number;
  severity: 'low' | 'medium' | 'high';
  reasons: { code: string; message: string }[];
  createdAt: string;
};

export function FraudSettings({ isInline, onClose }: FraudSettingsProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<GlobalScrapeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<FraudFindingDto[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<{ success: boolean; data: GlobalScrapeConfig }>('/config');
        if (res.data.success) {
          setConfig(res.data.data);
        }
      } catch (e) {
        setError(t('fraud_settings.errors.load_failed'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!isInline && onClose) return;
    };
    window.addEventListener('open-fraud-settings', handler);
    return () => window.removeEventListener('open-fraud-settings', handler);
  }, [isInline, onClose]);

  const updateFraud = (patch: any) => {
    if (!config) return;
    setConfig({
      ...config,
      postScrapeConfig: {
        ...config.postScrapeConfig,
        fraudDetection: {
          ...config.postScrapeConfig.fraudDetection,
          ...patch,
        },
      },
    });
  };

  const updateLocalRules = (patch: Partial<FraudDetectionLocalRulesConfig>) => {
    if (!config) return;
    const current =
      config.postScrapeConfig.fraudDetection.local?.rules || (DEFAULT_RULES as FraudDetectionLocalRulesConfig);
    updateFraud({
      local: {
        ...(config.postScrapeConfig.fraudDetection.local || {}),
        rules: { ...current, ...patch },
      },
    });
  };

  const updateLocalThresholds = (patch: Partial<FraudDetectionLocalThresholdsConfig>) => {
    if (!config) return;
    const current =
      config.postScrapeConfig.fraudDetection.local?.thresholds ||
      (DEFAULT_THRESHOLDS as FraudDetectionLocalThresholdsConfig);
    updateFraud({
      local: {
        ...(config.postScrapeConfig.fraudDetection.local || {}),
        thresholds: { ...current, ...patch },
      },
    });
  };

  const thresholds: FraudDetectionLocalThresholdsConfig = {
    ...DEFAULT_THRESHOLDS,
    ...(config?.postScrapeConfig.fraudDetection.local?.thresholds || {}),
  };
  const rules: FraudDetectionLocalRulesConfig = {
    ...DEFAULT_RULES,
    ...(config?.postScrapeConfig.fraudDetection.local?.rules || {}),
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.put<{ success: boolean; data: GlobalScrapeConfig }>('/config', config);
      if (!res.data.success) throw new Error(t('common.save_failed'));
      setConfig(res.data.data);
      if (onClose && !isInline) onClose();
    } catch (e: any) {
      setError(e?.message || t('fraud_settings.errors.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    if (!config) return;
    updateFraud({
      local: {
        rules: DEFAULT_RULES,
        thresholds: DEFAULT_THRESHOLDS,
      },
    });
  };

  const loadRecentFindings = async () => {
    setLoadingFindings(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const iso = since.toISOString();
      const res = await api.get<{ success: boolean; data: FraudFindingDto[] }>(
        `/fraud/findings?minSeverity=medium&detector=local&since=${encodeURIComponent(iso)}`
      );
      if (res.data.success) {
        setFindings(res.data.data || []);
      }
    } catch {
      // silent for now
    } finally {
      setLoadingFindings(false);
    }
  };

  if (!isInline && (!config || loading)) return null;
  if (loading) return <div className="p-4 text-sm text-gray-500">{t('fraud_settings.loading')}</div>;
  if (!config) return <div className="p-4 text-sm text-red-500">{t('fraud_settings.errors.unavailable')}</div>;

  const content = (
    <div
      className={`${
        isInline
          ? 'space-y-6'
          : 'bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200'
      }`}
    >
      {!isInline && (
        <div className="p-6 bg-purple-600 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-bold">{t('fraud_settings.title')}</h3>
            <p className="text-purple-100 text-sm">
              {t('fraud_settings.description')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className={`${isInline ? '' : 'p-6 overflow-y-auto'} space-y-6`}>
        {/* Mode & scope summary */}
        <section className="bg-purple-50/70 border border-purple-100 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-black text-purple-900 uppercase tracking-wider">
                {t('fraud_settings.overview')}
              </h4>
              <p className="text-[11px] text-purple-800/80">
                {t('fraud_settings.overview_desc')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-purple-900">
                {t('fraud_settings.mode_label')}:
              </span>
              <div className="flex gap-1 p-1 bg-white/60 rounded-lg border border-purple-100">
                {(['local', 'ai', 'both'] as const).map((mode) => {
                  const active = (config.postScrapeConfig.fraudDetection.mode || 'local') === mode;
                  const labelKey =
                    mode === 'local'
                      ? 'post_scrape.fraud_mode_local'
                      : mode === 'ai'
                      ? 'post_scrape.fraud_mode_ai'
                      : 'post_scrape.fraud_mode_both';
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        updateFraud({
                          mode,
                        })
                      }
                      className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                        active ? 'bg-purple-600 text-white shadow-sm' : 'text-purple-700/80 hover:bg-purple-50'
                      }`}
                    >
                      {t(labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-purple-900">
                {t('post_scrape.scope_label')}:
              </span>
              <div className="flex gap-1 p-1 bg-white/60 rounded-lg border border-purple-100">
                <button
                  type="button"
                  onClick={() => updateFraud({ scope: 'current' })}
                  className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                    config.postScrapeConfig.fraudDetection.scope !== 'all'
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-purple-700/70 hover:bg-purple-50'
                  }`}
                >
                  {t('post_scrape.scope_current')}
                </button>
                <button
                  type="button"
                  onClick={() => updateFraud({ scope: 'all' })}
                  className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                    config.postScrapeConfig.fraudDetection.scope === 'all'
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-purple-700/70 hover:bg-purple-50'
                  }`}
                >
                  {t('post_scrape.scope_all')}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-purple-900 cursor-pointer">
              <input
                type="checkbox"
                checked={config.postScrapeConfig.fraudDetection.notifyOnIssue ?? true}
                onChange={(e) => updateFraud({ notifyOnIssue: e.target.checked })}
                className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="font-medium">
                {t('post_scrape.fraud_notify_toggle')}
              </span>
            </label>
          </div>
        </section>

        {/* Local rules */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h4 className="text-sm font-bold text-gray-800">
            {t('fraud_settings.local_rules')}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!rules.enableOutlierAmount}
                onChange={(e) => updateLocalRules({ enableOutlierAmount: e.target.checked })}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span>
                <span className="font-semibold">
                  {t('fraud_settings.rule_outlier_amount')}
                </span>
                <span className="block text-xs text-gray-500">
                  {t(
                    'fraud_settings.rule_outlier_amount_desc',
                    'Flag charges much higher than historical amounts for the same description.'
                  )}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!rules.enableNewMerchant}
                onChange={(e) => updateLocalRules({ enableNewMerchant: e.target.checked })}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span>
                <span className="font-semibold">
                  {t('fraud_settings.rule_new_merchant')}
                </span>
                <span className="block text-xs text-gray-500">
                  {t(
                    'fraud_settings.rule_new_merchant_desc',
                    'Highlight expensive transactions from merchants never seen before.'
                  )}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!rules.enableRapidRepeats}
                onChange={(e) => updateLocalRules({ enableRapidRepeats: e.target.checked })}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span>
                <span className="font-semibold">
                  {t('fraud_settings.rule_rapid_repeats')}
                </span>
                <span className="block text-xs text-gray-500">
                  {t(
                    'fraud_settings.rule_rapid_repeats_desc',
                    'Detect multiple similar charges in a short time window.'
                  )}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!rules.enableForeignCurrency}
                onChange={(e) => updateLocalRules({ enableForeignCurrency: e.target.checked })}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span>
                <span className="font-semibold">
                  {t('fraud_settings.rule_foreign_currency')}
                </span>
                <span className="block text-xs text-gray-500">
                  {t(
                    'fraud_settings.rule_foreign_currency_desc',
                    'Flag large non-ILS charges that may be unexpected.'
                  )}
                </span>
              </span>
            </label>
          </div>
        </section>

        {/* Thresholds */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-800">
              {t('fraud_settings.thresholds')}
            </h4>
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline"
            >
              {t('fraud_settings.reset_defaults')}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.min_new_merchant')}
              </label>
              <input
                type="number"
                value={thresholds.minAmountForNewMerchantIls ?? ''}
                onChange={(e) =>
                  updateLocalThresholds({ minAmountForNewMerchantIls: Number(e.target.value || 0) })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.min_fx_amount')}
              </label>
              <input
                type="number"
                value={thresholds.foreignCurrencyMinOriginalAmount ?? ''}
                onChange={(e) =>
                  updateLocalThresholds({ foreignCurrencyMinOriginalAmount: Number(e.target.value || 0) })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.rapid_window')}
              </label>
              <input
                type="number"
                value={thresholds.rapidRepeatWindowMinutes ?? ''}
                onChange={(e) =>
                  updateLocalThresholds({ rapidRepeatWindowMinutes: Number(e.target.value || 0) })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.rapid_count')}
              </label>
              <input
                type="number"
                value={thresholds.rapidRepeatCountThreshold ?? ''}
                onChange={(e) =>
                  updateLocalThresholds({ rapidRepeatCountThreshold: Number(e.target.value || 0) })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.outlier_history')}
              </label>
              <input
                type="number"
                value={thresholds.outlierMinHistoryCount ?? ''}
                onChange={(e) =>
                  updateLocalThresholds({ outlierMinHistoryCount: Number(e.target.value || 0) })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.outlier_zscore')}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.outlierZScore ?? ''}
                onChange={(e) =>
                  updateLocalThresholds({ outlierZScore: Number(e.target.value || 0) })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs pt-2 border-t border-gray-100 mt-2">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.sev_low')}
              </label>
              <input
                type="number"
                value={thresholds.severityLowMinScore ?? ''}
                onChange={(e) =>
                  updateLocalThresholds({ severityLowMinScore: Number(e.target.value || 0) })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.sev_medium')}
              </label>
              <input
                type="number"
                value={thresholds.severityMediumMinScore ?? ''}
                onChange={(e) =>
                  updateLocalThresholds({ severityMediumMinScore: Number(e.target.value || 0) })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.sev_high')}
              </label>
              <input
                type="number"
                value={thresholds.severityHighMinScore ?? ''}
                onChange={(e) =>
                  updateLocalThresholds({ severityHighMinScore: Number(e.target.value || 0) })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {t('fraud_settings.notify_severity')}
              </label>
              <select
                value={thresholds.notifyMinSeverity || 'medium'}
                onChange={(e) => updateLocalThresholds({ notifyMinSeverity: e.target.value as any })}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              >
                <option value="low">{t('fraud_settings.severity_low')}</option>
                <option value="medium">{t('fraud_settings.severity_medium')}</option>
                <option value="high">{t('fraud_settings.severity_high')}</option>
              </select>
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={thresholds.persistOnlyFlagged ?? true}
                  onChange={(e) => updateLocalThresholds({ persistOnlyFlagged: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span>{t('fraud_settings.persist_only_flagged')}</span>
              </label>
            </div>
          </div>
        </section>

        {/* Version info */}
        <section className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between text-xs">
          <div>
            <div className="font-semibold text-gray-800">
              {t('fraud_settings.version_label')}
            </div>
            <div className="text-gray-500">
              {config.postScrapeConfig.fraudDetection.local?.version || 'v1'}
            </div>
          </div>
          <p className="text-[11px] text-gray-500 max-w-xs">
            {t(
              'fraud_settings.version_help',
              'Optionally bump this when you change thresholds in a way that reinterprets scores.'
            )}
          </p>
        </section>

        {/* Recent findings */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-800">
              {t('fraud_settings.recent_findings')}
            </h4>
            <button
              type="button"
              onClick={loadRecentFindings}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {loadingFindings
                ? t('fraud_settings.loading_findings')
                : t('fraud_settings.refresh_findings')}
            </button>
          </div>
          {findings.length === 0 && !loadingFindings && (
            <p className="text-xs text-gray-500">
              {t('fraud_settings.no_findings')}
            </p>
          )}
          {findings.length > 0 && (
            <div className="space-y-1 max-h-52 overflow-y-auto text-xs">
              {findings.slice(0, 20).map((f) => (
                <div
                  key={f.id}
                  className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          f.severity === 'high'
                            ? 'bg-red-100 text-red-700'
                            : f.severity === 'medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {f.severity.toUpperCase()} • {f.score}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(f.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-gray-700 mt-0.5">
                      {f.reasons[0]?.message || f.reasons[0]?.code || t('fraud_settings.suspicious_pattern')}
                    </div>
                  </div>
                  <code className="text-[10px] text-gray-400 truncate max-w-[120px]">
                    {f.transactionId}
                  </code>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-2">
            {error}
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-3 shrink-0 ${isInline ? 'pt-3' : 'p-4 bg-gray-50 border-t border-gray-100'}`}>
        {!isInline && (
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-gray-600 font-bold text-sm hover:bg-gray-100 rounded-2xl transition-all"
          >
            {t('common.cancel')}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-8 py-2.5 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 ${
            saving ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'
          }`}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );

  if (isInline) return content;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {content}
    </div>
  );
}

