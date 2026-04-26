import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { useInvestmentAppSettings, useUpdateInvestmentAppSettings } from '../../hooks/useInvestments';
import { EODHD_API_QUICKSTART_URL, EODHD_DASHBOARD_URL, EODHD_REGISTER_URL } from '../../constants/eodhdUrls';

/**
 * Compact investments + EODHD controls for the getting-started tour (step 6).
 */
export function GettingStartedInvestmentPanel() {
    const { t } = useTranslation();
    const { data, isLoading, error } = useInvestmentAppSettings({ enabled: true });
    const updateMutation = useUpdateInvestmentAppSettings();

    const [featureOn, setFeatureOn] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

    useEffect(() => {
        if (data) {
            setFeatureOn(data.featureEnabled);
            setTokenInput('');
        }
    }, [data]);

    const flash = useCallback((tone: 'ok' | 'err', text: string) => {
        setMsg({ tone, text });
        window.setTimeout(() => setMsg(null), 4000);
    }, []);

    const onToggle = (next: boolean) => {
        setFeatureOn(next);
        updateMutation.mutate(
            { featureEnabled: next },
            {
                onSuccess: () =>
                    flash(
                        'ok',
                        next ? t('getting_started.investments_enabled') : t('getting_started.investments_disabled')
                    ),
                onError: (e) => {
                    setFeatureOn(!next);
                    flash('err', e instanceof Error ? e.message : String(e));
                },
            }
        );
    };

    const onSaveToken = () => {
        const trimmed = tokenInput.trim();
        if (!trimmed) {
            flash('err', t('investment_settings.token_empty'));
            return;
        }
        updateMutation.mutate(
            { eodhdApiToken: trimmed },
            {
                onSuccess: () => {
                    flash('ok', t('investment_settings.saved'));
                    setTokenInput('');
                },
                onError: (e) => flash('err', e instanceof Error ? e.message : String(e)),
            }
        );
    };

    if (isLoading) {
        return <p className="text-sm text-slate-500">{t('investment_settings.loading')}</p>;
    }
    if (error) {
        return (
            <p className="text-sm text-rose-600" role="alert">
                {error instanceof Error ? error.message : String(error)}
            </p>
        );
    }
    if (!data) return null;

    return (
        <div className="mt-4 space-y-4 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <a
                    href={EODHD_REGISTER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2"
                >
                    {t('investment_settings.eodhd_register_link_label')}
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                </a>
                <a
                    href={EODHD_DASHBOARD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2"
                >
                    {t('investment_settings.eodhd_dashboard_link_label')}
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                </a>
                <a
                    href={EODHD_API_QUICKSTART_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2"
                >
                    {t('investment_settings.eodhd_api_docs_link_label')}
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                </a>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="text-sm font-semibold text-slate-800">{t('investment_settings.feature_toggle')}</span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={featureOn}
                    disabled={updateMutation.isPending}
                    dir="ltr"
                    onClick={() => onToggle(!featureOn)}
                    className={`relative inline-flex h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                        featureOn ? 'bg-teal-600' : 'bg-slate-300'
                    }`}
                >
                    <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform m-0.5 ${
                            featureOn ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                </button>
            </div>

            <div className="space-y-2">
                <label htmlFor="tour-eodhd-token" className="text-xs font-medium text-slate-600">
                    {t('investment_settings.eodhd_token_label')}
                </label>
                <input
                    id="tour-eodhd-token"
                    type="password"
                    autoComplete="off"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder={t('investment_settings.eodhd_token_placeholder')}
                    disabled={data.eodhdApiTokenFromEnv}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono disabled:opacity-50"
                />
                {data.eodhdApiTokenFromEnv && (
                    <p className="text-xs text-amber-800">{t('investment_settings.eodhd_env_override')}</p>
                )}
                <button
                    type="button"
                    disabled={updateMutation.isPending || !tokenInput.trim() || data.eodhdApiTokenFromEnv}
                    onClick={() => void onSaveToken()}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-40"
                >
                    {t('investment_settings.save_token')}
                </button>
            </div>

            {msg && (
                <p className={`text-sm ${msg.tone === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`} role="status">
                    {msg.text}
                </p>
            )}
        </div>
    );
}
