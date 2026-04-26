import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import {
    useInvestmentAppSettings,
    useUpdateInvestmentAppSettings,
    useSnapshotSettings,
    useUpdateSnapshotSettings,
    useSavePortfolioSnapshot,
    type EodhdQuoteModeDto,
} from '../hooks/useInvestments';
import { EODHD_API_QUICKSTART_URL, EODHD_DASHBOARD_URL, EODHD_REGISTER_URL } from '../constants/eodhdUrls';

function padSnapshotRunTime(t: string): string {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
    if (!m) return '22:00';
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function InvestmentSettings({ isInline = false }: { isInline?: boolean }) {
    const { t } = useTranslation();
    const enabled = isInline;
    const { data, isLoading, error } = useInvestmentAppSettings({ enabled });
    const updateMutation = useUpdateInvestmentAppSettings();
    const snapQueryEnabled = Boolean(enabled && data?.featureEnabled);
    const { data: snapSettings } = useSnapshotSettings({ enabled: snapQueryEnabled });
    const schedMut = useUpdateSnapshotSettings();
    const snapMut = useSavePortfolioSnapshot();

    const [featureOn, setFeatureOn] = useState(true);
    const [tokenInput, setTokenInput] = useState('');
    const [quoteMode, setQuoteMode] = useState<EodhdQuoteModeDto>('realtime');
    const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

    const [runTime, setRunTime] = useState('22:00');
    const [timezone, setTimezone] = useState('Asia/Jerusalem');
    const [schedEnabled, setSchedEnabled] = useState(true);

    useEffect(() => {
        if (data) {
            setFeatureOn(data.featureEnabled);
            setTokenInput('');
            setQuoteMode(data.eodhdQuoteMode);
        }
    }, [data]);

    useEffect(() => {
        if (!snapSettings) return;
        setRunTime(padSnapshotRunTime(snapSettings.runTime));
        setTimezone(snapSettings.timezone);
        setSchedEnabled(snapSettings.enabled);
    }, [snapSettings]);

    const showFeedback = useCallback((tone: 'ok' | 'err', text: string) => {
        setFeedback({ tone, text });
        window.setTimeout(() => setFeedback(null), 5000);
    }, []);

    const onSaveToken = () => {
        const trimmed = tokenInput.trim();
        if (!trimmed) {
            showFeedback('err', t('investment_settings.token_empty'));
            return;
        }
        updateMutation.mutate(
            { eodhdApiToken: trimmed },
            {
                onSuccess: () => showFeedback('ok', t('investment_settings.saved')),
                onError: (e) => showFeedback('err', e instanceof Error ? e.message : String(e)),
            }
        );
    };

    const onClearToken = () => {
        updateMutation.mutate(
            { clearEodhdApiToken: true },
            {
                onSuccess: () => {
                    setTokenInput('');
                    showFeedback('ok', t('investment_settings.token_cleared'));
                },
                onError: (e) => showFeedback('err', e instanceof Error ? e.message : String(e)),
            }
        );
    };

    const onToggleFeature = (next: boolean) => {
        setFeatureOn(next);
        updateMutation.mutate(
            { featureEnabled: next },
            {
                onError: (e) => {
                    setFeatureOn(!next);
                    showFeedback('err', e instanceof Error ? e.message : String(e));
                },
            }
        );
    };

    const onSaveSchedule = async () => {
        try {
            await schedMut.mutateAsync({
                run_time: runTime,
                timezone,
                enabled: schedEnabled,
            });
            showFeedback('ok', t('investment_settings.schedule_saved'));
        } catch (e) {
            showFeedback('err', e instanceof Error ? e.message : String(e));
        }
    };

    const onSnapshotNow = async () => {
        try {
            await snapMut.mutateAsync({});
            showFeedback('ok', t('dashboard.portfolio.snapshot_saved'));
        } catch (e: unknown) {
            const msg =
                e && typeof e === 'object' && 'response' in e
                    ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
                    : undefined;
            showFeedback(
                'err',
                msg ? `${t('dashboard.portfolio.snapshot_failed')} (${msg})` : t('dashboard.portfolio.snapshot_failed')
            );
        }
    };

    const onQuoteModeChange = (next: EodhdQuoteModeDto) => {
        const prev = quoteMode;
        setQuoteMode(next);
        updateMutation.mutate(
            { eodhdQuoteMode: next },
            {
                onSuccess: () => showFeedback('ok', t('investment_settings.saved')),
                onError: (e) => {
                    setQuoteMode(prev);
                    showFeedback('err', e instanceof Error ? e.message : String(e));
                },
            }
        );
    };

    if (!enabled) return null;

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-xl font-bold text-gray-900">{t('config_tabs.investments')}</h2>
                <p className="text-gray-500 text-sm mt-1">{t('investment_settings.subtitle')}</p>
            </div>

            {isLoading && <p className="text-sm text-gray-500">{t('investment_settings.loading')}</p>}
            {error && (
                <p className="text-sm text-rose-600" role="alert">
                    {error instanceof Error ? error.message : String(error)}
                </p>
            )}

            {data && (
                <>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{t('investment_settings.feature_toggle')}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{t('investment_settings.feature_toggle_help')}</p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={featureOn}
                                disabled={updateMutation.isPending}
                                dir="ltr"
                                onClick={() => onToggleFeature(!featureOn)}
                                className={`relative inline-flex h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                    featureOn ? 'bg-emerald-600' : 'bg-gray-300'
                                }`}
                            >
                                <span
                                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform m-0.5 ${
                                        featureOn ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
                        <div>
                            <p className="text-sm font-semibold text-gray-900">{t('investment_settings.eodhd_title')}</p>
                            <p className="text-xs text-gray-500 mt-1">{t('investment_settings.eodhd_help')}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-sm">
                                <a
                                    href={EODHD_REGISTER_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900"
                                >
                                    {t('investment_settings.eodhd_register_link_label')}
                                    <ExternalLink className="w-3.5 h-3.5 opacity-70" aria-hidden />
                                </a>
                                <a
                                    href={EODHD_DASHBOARD_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900"
                                >
                                    {t('investment_settings.eodhd_dashboard_link_label')}
                                    <ExternalLink className="w-3.5 h-3.5 opacity-70" aria-hidden />
                                </a>
                                <a
                                    href={EODHD_API_QUICKSTART_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900"
                                >
                                    {t('investment_settings.eodhd_api_docs_link_label')}
                                    <ExternalLink className="w-3.5 h-3.5 opacity-70" aria-hidden />
                                </a>
                            </div>
                            {data.eodhdApiTokenFromEnv && (
                                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                                    {t('investment_settings.eodhd_env_override')}
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="eodhd-token-input" className="text-xs font-medium text-gray-600">
                                {t('investment_settings.eodhd_token_label')}
                            </label>
                            <input
                                id="eodhd-token-input"
                                type="password"
                                autoComplete="off"
                                value={tokenInput}
                                onChange={(e) => setTokenInput(e.target.value)}
                                placeholder={
                                    data.eodhdApiTokenConfigured
                                        ? t('investment_settings.eodhd_token_placeholder_configured')
                                        : t('investment_settings.eodhd_token_placeholder')
                                }
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono w-full max-w-xl"
                            />
                            <p className="text-[11px] text-gray-500">
                                {data.eodhdApiTokenConfigured
                                    ? t('investment_settings.token_status_configured')
                                    : t('investment_settings.token_status_empty')}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                disabled={updateMutation.isPending || !tokenInput.trim()}
                                onClick={() => void onSaveToken()}
                                className="rounded-lg bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 disabled:opacity-40"
                            >
                                {t('investment_settings.save_token')}
                            </button>
                            <button
                                type="button"
                                disabled={updateMutation.isPending || !data.eodhdApiTokenConfigured}
                                onClick={() => void onClearToken()}
                                className="rounded-lg border border-gray-300 text-gray-800 text-sm font-semibold px-4 py-2 hover:bg-gray-50 disabled:opacity-40"
                            >
                                {t('investment_settings.clear_token')}
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-500">
                            {t('investment_settings.provider_note', { mode: data.marketDataProvider })}
                        </p>
                        {data.marketDataProvider === 'eodhd_then_yahoo' && (
                            <div className="pt-2 border-t border-gray-100 mt-2">
                                <label htmlFor="eodhd-quote-mode" className="text-xs font-medium text-gray-600 block mb-1.5">
                                    {t('investment_settings.eodhd_quote_mode_label')}
                                </label>
                                <select
                                    id="eodhd-quote-mode"
                                    disabled={updateMutation.isPending}
                                    value={quoteMode}
                                    onChange={(e) => onQuoteModeChange(e.target.value as EodhdQuoteModeDto)}
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm w-full max-w-xl bg-white"
                                >
                                    <option value="realtime">{t('investment_settings.eodhd_quote_mode_realtime')}</option>
                                    <option value="eod">{t('investment_settings.eodhd_quote_mode_eod')}</option>
                                    <option value="realtime_then_eod">
                                        {t('investment_settings.eodhd_quote_mode_realtime_then_eod')}
                                    </option>
                                    <option value="eod_then_realtime">
                                        {t('investment_settings.eodhd_quote_mode_eod_then_realtime')}
                                    </option>
                                </select>
                                <p className="text-[11px] text-gray-500 mt-1.5">{t('investment_settings.eodhd_quote_mode_help')}</p>
                            </div>
                        )}
                    </div>

                    {data.featureEnabled && (
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{t('dashboard.portfolio.schedule_title')}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{t('investment_settings.schedule_help')}</p>
                            </div>
                            <div className="flex flex-wrap items-end gap-3">
                                <label className="flex flex-col gap-1 text-xs">
                                    <span className="text-gray-500">{t('dashboard.portfolio.schedule_time')}</span>
                                    <input
                                        type="time"
                                        value={padSnapshotRunTime(runTime)}
                                        onChange={(e) => setRunTime(e.target.value)}
                                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-xs min-w-[10rem] flex-1">
                                    <span className="text-gray-500">{t('dashboard.portfolio.schedule_timezone')}</span>
                                    <input
                                        type="text"
                                        value={timezone}
                                        onChange={(e) => setTimezone(e.target.value)}
                                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm w-full"
                                        placeholder="Asia/Jerusalem"
                                    />
                                </label>
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={schedEnabled}
                                        onChange={(e) => setSchedEnabled(e.target.checked)}
                                    />
                                    <span>{t('dashboard.portfolio.schedule_enabled')}</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => void onSaveSchedule()}
                                    disabled={schedMut.isPending}
                                    className="rounded-lg bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {t('dashboard.portfolio.save_schedule')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void onSnapshotNow()}
                                    disabled={snapMut.isPending}
                                    className="rounded-lg border border-emerald-200 text-emerald-800 text-sm font-semibold px-4 py-2 hover:bg-emerald-50 disabled:opacity-50"
                                >
                                    {t('dashboard.portfolio.snapshot_now')}
                                </button>
                            </div>
                        </div>
                    )}

                    {feedback && (
                        <p
                            className={`text-sm ${feedback.tone === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}
                            role="status"
                        >
                            {feedback.text}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
