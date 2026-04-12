import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GlobalScrapeConfig,
  FraudDetectionLocalThresholdsConfig,
  FraudDetectionLocalRulesConfig,
  FraudFinding,
  FraudDetectionSummary,
} from '@app/shared';
import { Info } from 'lucide-react';
import { api } from '../lib/api';
import { SeverityThresholdBar } from './SeverityThresholdBar';

interface FraudSettingsProps {
  isInline?: boolean;
  onClose?: () => void;
}

const DEFAULT_RULES: Required<FraudDetectionLocalRulesConfig> = {
  enableOutlierAmount: true,
  enableNewMerchant: true,
  enableNewMerchantNonHebrew: true,
  enableRapidRepeats: true,
  enableForeignCurrency: true,
};

const DEFAULT_THRESHOLDS: Required<FraudDetectionLocalThresholdsConfig> = {
  minAmountForNewMerchantIls: 250,
  newMerchantNonHebrewPoints: 35,
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

  const [testDesc, setTestDesc] = useState('');
  const [testDate, setTestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [testAmount, setTestAmount] = useState('100');
  const [testOrig, setTestOrig] = useState('');
  const [testCur, setTestCur] = useState('ILS');
  const [testHistoryJson, setTestHistoryJson] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFinding, setPreviewFinding] = useState<FraudFinding | null>(null);
  const [previewSummary, setPreviewSummary] = useState<FraudDetectionSummary | null>(null);
  const [previewAlert, setPreviewAlert] = useState<{
    wouldNotify: boolean;
    insightLine: string;
    itemLines: string[];
  } | null>(null);
  const [outlierInfoOpen, setOutlierInfoOpen] = useState(false);
  const lastSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<{ success: boolean; data: GlobalScrapeConfig }>('/config');
        if (res.data.success) {
          const c = res.data.data;
          setConfig(c);
          lastSerializedRef.current = JSON.stringify(c);
        }
      } catch (e) {
        setError(t('fraud_settings.errors.load_failed'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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

  const updateLocalPatch = (patch: Partial<NonNullable<GlobalScrapeConfig['postScrapeConfig']['fraudDetection']['local']>>) => {
    if (!config) return;
    updateFraud({
      local: {
        ...(config.postScrapeConfig.fraudDetection.local || {}),
        ...patch,
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

  useEffect(() => {
    if (!config) return;
    const json = JSON.stringify(config);
    if (lastSerializedRef.current === json) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await api.put<{ success: boolean; data: GlobalScrapeConfig }>('/config', config);
        if (!res.data.success) throw new Error(t('common.save_failed'));
        const next = res.data.data;
        setConfig(next);
        lastSerializedRef.current = JSON.stringify(next);
      } catch (e: any) {
        setError(e?.message || t('fraud_settings.errors.save_failed'));
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [config, t]);

  const resetToDefaults = () => {
    if (!config) return;
    updateFraud({
      local: {
        rules: DEFAULT_RULES,
        thresholds: DEFAULT_THRESHOLDS,
      },
    });
  };

  const runFraudPreview = async () => {
    if (!config) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewFinding(null);
    setPreviewSummary(null);
    setPreviewAlert(null);
    try {
      let history: any[] = [];
      if (testHistoryJson.trim()) {
        try {
          const parsed = JSON.parse(testHistoryJson);
          if (Array.isArray(parsed)) history = parsed;
          else throw new Error('not_array');
        } catch {
          setPreviewError(t('fraud_settings.test_history_invalid'));
          setPreviewLoading(false);
          return;
        }
      }
      const origNum = testOrig.trim() === '' ? Number(testAmount) : Number(testOrig);
      const r = await api.post<{
        success: boolean;
        data?: {
          finding: FraudFinding | null;
          summary: FraudDetectionSummary;
          alertPreview: { wouldNotify: boolean; insightLine: string; itemLines: string[] };
        };
        error?: string;
      }>('/fraud/preview', {
        transaction: {
          id: 'fraud-test-preview',
          description: testDesc,
          date: new Date(testDate).toISOString(),
          amount: Number(testAmount),
          originalAmount: Number.isFinite(origNum) ? origNum : Number(testAmount),
          originalCurrency: testCur || 'ILS',
        },
        history,
        local: config.postScrapeConfig.fraudDetection.local,
      });
      const body = r.data;
      if (!body.success || !body.data) {
        throw new Error((body as { error?: string }).error || 'Preview failed');
      }
      setPreviewFinding(body.data.finding);
      setPreviewSummary(body.data.summary);
      setPreviewAlert(body.data.alertPreview);
    } catch (e: any) {
      setPreviewError(e?.message || t('fraud_settings.test_error'));
    } finally {
      setPreviewLoading(false);
    }
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
                  {t('fraud_settings.rule_new_merchant_desc')}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer md:col-span-2">
              <input
                type="checkbox"
                checked={rules.enableNewMerchantNonHebrew !== false}
                onChange={(e) => updateLocalRules({ enableNewMerchantNonHebrew: e.target.checked })}
                disabled={!rules.enableNewMerchant}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-40"
              />
              <span>
                <span className="font-semibold">
                  {t('fraud_settings.rule_new_merchant_non_hebrew')}
                </span>
                <span className="block text-xs text-gray-500">
                  {t('fraud_settings.rule_new_merchant_non_hebrew_desc')}
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
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-gray-800">
              {t('fraud_settings.thresholds')}
            </h4>
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline shrink-0"
            >
              {t('fraud_settings.reset_defaults')}
            </button>
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">{t('fraud_settings.thresholds_intro')}</p>
          <p className="text-[11px] text-gray-500 leading-relaxed border-l-2 border-purple-200 pl-3">
            {t('fraud_settings.scores_summary')}
          </p>

          <div>
            <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
              {t('fraud_settings.thresholds_group_rules')}
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
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
                <p className="text-[10px] text-gray-500 mt-1">{t('fraud_settings.min_new_merchant_help')}</p>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {t('fraud_settings.non_hebrew_points')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={thresholds.newMerchantNonHebrewPoints ?? ''}
                  onChange={(e) =>
                    updateLocalThresholds({ newMerchantNonHebrewPoints: Number(e.target.value || 0) })
                  }
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-1">{t('fraud_settings.non_hebrew_points_help')}</p>
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
                <p className="text-[10px] text-gray-500 mt-1">{t('fraud_settings.min_fx_amount_help')}</p>
              </div>
              <div className="md:col-span-2">
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
                <p className="text-[10px] text-gray-500 mt-1">{t('fraud_settings.rapid_count_help')}</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                {t('fraud_settings.thresholds_group_outlier')}
              </h5>
              <button
                type="button"
                className="inline-flex rounded-full p-0.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-400"
                aria-expanded={outlierInfoOpen}
                aria-label={t('fraud_settings.outlier_info_aria')}
                onClick={() => setOutlierInfoOpen((o) => !o)}
              >
                <Info className="w-4 h-4" strokeWidth={2.25} />
              </button>
            </div>
            {outlierInfoOpen && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-[11px] leading-relaxed text-gray-700 space-y-2">
                <p>{t('fraud_settings.outlier_info_p1')}</p>
                <p>{t('fraud_settings.outlier_info_p2')}</p>
                <p>{t('fraud_settings.outlier_info_p3')}</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
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
                <p className="text-[10px] text-gray-500 mt-1">{t('fraud_settings.outlier_history_help')}</p>
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
                <p className="text-[10px] text-gray-500 mt-1">{t('fraud_settings.outlier_zscore_help')}</p>
              </div>
            </div>
          </div>

          <div>
            <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
              {t('fraud_settings.thresholds_group_alerts')}
            </h5>
            <div className="mb-4">
              <SeverityThresholdBar
                mediumMin={thresholds.severityMediumMinScore ?? DEFAULT_THRESHOLDS.severityMediumMinScore}
                highMin={thresholds.severityHighMinScore ?? DEFAULT_THRESHOLDS.severityHighMinScore}
                onChange={(patch) => updateLocalThresholds(patch)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {t('fraud_settings.notify_severity')}
                </label>
                <select
                  value={thresholds.notifyMinSeverity || 'medium'}
                  onChange={(e) => updateLocalThresholds({ notifyMinSeverity: e.target.value as 'low' | 'medium' | 'high' })}
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="low">{t('fraud_settings.severity_low')}</option>
                  <option value="medium">{t('fraud_settings.severity_medium')}</option>
                  <option value="high">{t('fraud_settings.severity_high')}</option>
                </select>
                <p className="text-[10px] text-gray-500 mt-1">{t('fraud_settings.notify_severity_help')}</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thresholds.persistOnlyFlagged ?? true}
                    onChange={(e) => updateLocalThresholds({ persistOnlyFlagged: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span>{t('fraud_settings.persist_only_flagged')}</span>
                </label>
                <p className="text-[10px] text-gray-500 mt-1">{t('fraud_settings.persist_only_flagged_help')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Test transaction preview */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 text-xs">
          <h4 className="text-sm font-bold text-gray-800">{t('fraud_settings.test_title')}</h4>
          <p className="text-[11px] text-gray-500">{t('fraud_settings.test_intro')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">{t('fraud_settings.test_description')}</label>
              <input
                type="text"
                value={testDesc}
                onChange={(e) => setTestDesc(e.target.value)}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('fraud_settings.test_date')}</label>
              <input
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('fraud_settings.test_amount_ils')}</label>
              <input
                type="number"
                value={testAmount}
                onChange={(e) => setTestAmount(e.target.value)}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('fraud_settings.test_orig_amount')}</label>
              <input
                type="number"
                value={testOrig}
                onChange={(e) => setTestOrig(e.target.value)}
                placeholder={t('fraud_settings.test_orig_placeholder')}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">{t('fraud_settings.test_currency')}</label>
              <input
                type="text"
                value={testCur}
                onChange={(e) => setTestCur(e.target.value.toUpperCase())}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">{t('fraud_settings.test_history_json')}</label>
              <textarea
                value={testHistoryJson}
                onChange={(e) => setTestHistoryJson(e.target.value)}
                rows={3}
                placeholder={t('fraud_settings.test_history_placeholder')}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={runFraudPreview}
            disabled={previewLoading}
            className="px-4 py-2 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400"
          >
            {previewLoading ? t('fraud_settings.test_running') : t('fraud_settings.test_run')}
          </button>
          {previewError && <p className="text-red-600 text-xs">{previewError}</p>}
          {previewFinding && previewSummary && (
            <div className="border border-gray-100 rounded-xl p-3 bg-slate-50 space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-bold text-gray-800">{t('fraud_settings.test_score')}</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
                  {previewFinding.score}
                </span>
                <span className="text-gray-600">
                  {t('fraud_settings.test_severity')}: {previewFinding.severity}
                </span>
              </div>
              {previewFinding.reasons.length > 0 && (
                <ul className="list-disc pl-4 space-y-1 text-gray-700">
                  {previewFinding.reasons.map((r, i) => (
                    <li key={i}>
                      <span className="font-medium">+{r.points}</span> {r.message}{' '}
                      <code className="text-[10px] text-gray-400">({r.code})</code>
                    </li>
                  ))}
                </ul>
              )}
              {previewFinding.reasons.length === 0 && (
                <p className="text-gray-500">{t('fraud_settings.test_no_reasons')}</p>
              )}
            </div>
          )}
          {previewAlert && (
            <div className="border border-amber-100 rounded-xl p-3 bg-amber-50/80 space-y-2">
              <div className="font-bold text-amber-900 text-[11px] uppercase tracking-wide">
                {t('fraud_settings.test_alert_preview')}
              </div>
              <p className="text-[11px] text-amber-950/90 whitespace-pre-wrap font-mono">
                {previewAlert.insightLine}
                {'\n'}
                {previewAlert.itemLines.join('\n')}
              </p>
              <p className="text-[10px] text-amber-800/80">
                {previewAlert.wouldNotify
                  ? t('fraud_settings.test_would_notify')
                  : t('fraud_settings.test_would_not_notify')}
              </p>
            </div>
          )}
        </section>

        {/* Version info */}
        <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-xs">
          <div className="font-semibold text-gray-800">{t('fraud_settings.version_label')}</div>
          <input
            type="text"
            value={config.postScrapeConfig.fraudDetection.local?.version ?? ''}
            onChange={(e) => updateLocalPatch({ version: e.target.value })}
            placeholder={t('fraud_settings.version_placeholder')}
            className="w-full max-w-xs p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <p className="text-[11px] text-gray-500 max-w-lg">{t('fraud_settings.version_help')}</p>
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

      <div className={`flex justify-end gap-3 shrink-0 items-center ${isInline ? 'pt-3' : 'p-4 bg-gray-50 border-t border-gray-100'}`}>
        {saving && (
          <span className="mr-auto text-xs text-rose-600 font-bold flex items-center gap-1.5">
            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {t('common.saving')}
          </span>
        )}
        {!isInline && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-gray-600 font-bold text-sm hover:bg-gray-100 rounded-2xl transition-all"
          >
            {t('common.cancel')}
          </button>
        )}
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

