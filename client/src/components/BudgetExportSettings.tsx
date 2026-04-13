import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetExportsConfig } from '@app/shared';
import { api } from '../lib/api';
import { CollapsibleCard } from './CollapsibleCard';

type SecretsStatus = {
    firefly: boolean;
    lunchMoney: boolean;
    ynab: { configured: boolean; oauthReady: boolean };
    actual: boolean;
};

function parseAccountMapJson(raw: string): Record<string, string> {
    const t = raw.trim();
    if (!t) return {};
    const o = JSON.parse(t) as unknown;
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not_object');
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        out[k] = String(v);
    }
    return out;
}

function buildPublicPayload(
    be: BudgetExportsConfig,
    mapFf: string,
    mapLm: string,
    mapYnab: string,
    mapActual: string
): BudgetExportsConfig {
    return {
        firefly: {
            ...be.firefly,
            enabled: be.firefly?.enabled,
            expenseAccountName: be.firefly?.expenseAccountName,
            accountMap: parseAccountMapJson(mapFf),
        },
        lunchMoney: {
            ...be.lunchMoney,
            enabled: be.lunchMoney?.enabled,
            accountMap: parseAccountMapJson(mapLm),
        },
        ynab: {
            ...be.ynab,
            enabled: be.ynab?.enabled,
            budgetId: be.ynab?.budgetId,
            accountMap: parseAccountMapJson(mapYnab),
        },
        actual: {
            ...be.actual,
            enabled: be.actual?.enabled,
            accountMap: parseAccountMapJson(mapActual),
        },
    };
}

export function BudgetExportSettings() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [savingPublic, setSavingPublic] = useState(false);
    const [status, setStatus] = useState<SecretsStatus | null>(null);
    const [be, setBe] = useState<BudgetExportsConfig>({});
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const [mapFf, setMapFf] = useState('{}');
    const [mapLm, setMapLm] = useState('{}');
    const [mapYnab, setMapYnab] = useState('{}');
    const [mapActual, setMapActual] = useState('{}');

    const [ffBase, setFfBase] = useState('');
    const [ffToken, setFfToken] = useState('');
    const [lmToken, setLmToken] = useState('');
    const [ynabClientId, setYnabClientId] = useState('');
    const [ynabSecret, setYnabSecret] = useState('');
    const [ynabRedirect, setYnabRedirect] = useState('');
    const [actualUrl, setActualUrl] = useState('');
    const [actualPass, setActualPass] = useState('');
    const [actualSync, setActualSync] = useState('');

    const load = useCallback(async () => {
        setError(null);
        try {
            const [stRes, cfgRes] = await Promise.all([
                api.get<{ success: boolean; data: SecretsStatus }>('/budget-export/status'),
                api.get<{ success: boolean; data: BudgetExportsConfig }>('/budget-export/public-config'),
            ]);
            if (stRes.data.success) setStatus(stRes.data.data);
            if (cfgRes.data.success) {
                const d = cfgRes.data.data || {};
                setBe(d);
                setMapFf(JSON.stringify(d.firefly?.accountMap || {}, null, 2));
                setMapLm(JSON.stringify(d.lunchMoney?.accountMap || {}, null, 2));
                setMapYnab(JSON.stringify(d.ynab?.accountMap || {}, null, 2));
                setMapActual(JSON.stringify(d.actual?.accountMap || {}, null, 2));
            }
        } catch (e: any) {
            setError(e?.message || t('budget_exports.load_failed'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void load();
    }, [load]);

    const savePublic = async () => {
        setError(null);
        try {
            try {
                parseAccountMapJson(mapFf);
                parseAccountMapJson(mapLm);
                parseAccountMapJson(mapYnab);
                parseAccountMapJson(mapActual);
            } catch {
                setError(t('budget_exports.invalid_account_map_json'));
                return;
            }
            const payload = buildPublicPayload(be, mapFf, mapLm, mapYnab, mapActual);
            setSavingPublic(true);
            const res = await api.put<{ success: boolean; data: BudgetExportsConfig }>(
                '/budget-export/public-config',
                payload
            );
            if (res.data.success) {
                setBe(res.data.data);
                setToast(t('common.save_success'));
                setTimeout(() => setToast(null), 1500);
            }
        } catch (e: any) {
            setError(e?.message || t('common.save_failed'));
        } finally {
            setSavingPublic(false);
        }
    };

    const saveSecretsFirefly = async () => {
        setError(null);
        try {
            await api.post('/budget-export/secrets', {
                firefly: { baseUrl: ffBase || undefined, token: ffToken || undefined },
            });
            setFfToken('');
            setToast(t('budget_exports.secrets_saved'));
            setTimeout(() => setToast(null), 1500);
            void load();
        } catch (e: any) {
            setError(e?.message || t('common.save_failed'));
        }
    };

    const saveSecretsLunch = async () => {
        setError(null);
        try {
            await api.post('/budget-export/secrets', {
                lunchMoney: { token: lmToken || undefined },
            });
            setLmToken('');
            setToast(t('budget_exports.secrets_saved'));
            setTimeout(() => setToast(null), 1500);
            void load();
        } catch (e: any) {
            setError(e?.message || t('common.save_failed'));
        }
    };

    const saveSecretsYnab = async () => {
        setError(null);
        try {
            await api.post('/budget-export/secrets', {
                ynab: {
                    clientId: ynabClientId || undefined,
                    clientSecret: ynabSecret || undefined,
                    redirectUri: ynabRedirect || undefined,
                },
            });
            setYnabSecret('');
            setToast(t('budget_exports.secrets_saved'));
            setTimeout(() => setToast(null), 1500);
            void load();
        } catch (e: any) {
            setError(e?.message || t('common.save_failed'));
        }
    };

    const saveSecretsActual = async () => {
        setError(null);
        try {
            await api.post('/budget-export/secrets', {
                actual: {
                    serverUrl: actualUrl || undefined,
                    password: actualPass || undefined,
                    syncId: actualSync || undefined,
                },
            });
            setActualPass('');
            setToast(t('budget_exports.secrets_saved'));
            setTimeout(() => setToast(null), 1500);
            void load();
        } catch (e: any) {
            setError(e?.message || t('common.save_failed'));
        }
    };

    const connectYnab = async () => {
        setError(null);
        try {
            const res = await api.get<{ success: boolean; data: { url: string } }>('/budget-export/ynab/authorize-url');
            if (res.data.success && res.data.data?.url) {
                window.location.href = res.data.data.url;
            }
        } catch (e: any) {
            setError(e?.message || t('budget_exports.ynab_auth_failed'));
        }
    };

    if (loading) return <div className="text-sm text-gray-500">{t('common.loading')}</div>;

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">{t('budget_exports.title')}</h2>
                    <p className="text-gray-500 text-sm mt-1">{t('budget_exports.subtitle')}</p>
                </div>
                <button
                    type="button"
                    disabled={savingPublic}
                    onClick={() => void savePublic()}
                    className="rounded-lg bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
                >
                    {savingPublic ? t('common.loading') : t('budget_exports.save_public')}
                </button>
            </div>

            {toast && (
                <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-4 py-2 border border-emerald-100">
                    {toast}
                </div>
            )}
            {error && (
                <div className="rounded-lg bg-red-50 text-red-800 text-sm px-4 py-2 border border-red-100">{error}</div>
            )}

            <CollapsibleCard
                title={t('budget_exports.firefly_title')}
                defaultOpen
                bodyClassName="px-6 pb-6 pt-0 space-y-4"
            >
                <label className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        checked={!!be.firefly?.enabled}
                        onChange={(e) => setBe({ ...be, firefly: { ...be.firefly, enabled: e.target.checked } })}
                        className="w-5 h-5 rounded border-gray-300 text-emerald-600"
                    />
                    <span className="text-sm font-medium text-gray-800">{t('budget_exports.enable')}</span>
                </label>
                <p className="text-xs text-gray-500">{t('budget_exports.firefly_help')}</p>
                <input
                    type="text"
                    placeholder={t('budget_exports.expense_account_placeholder')}
                    value={be.firefly?.expenseAccountName || ''}
                    onChange={(e) =>
                        setBe({ ...be, firefly: { ...be.firefly, expenseAccountName: e.target.value || undefined } })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <div>
                    <label className="text-xs font-semibold text-gray-600">{t('budget_exports.account_map_json')}</label>
                    <textarea
                        value={mapFf}
                        onChange={(e) => setMapFf(e.target.value)}
                        rows={4}
                        className="mt-1 w-full font-mono text-xs rounded-lg border border-gray-200 px-3 py-2"
                    />
                </div>
                <p className="text-xs text-gray-500">
                    {t('budget_exports.credentials_status')}: {status?.firefly ? t('budget_exports.configured') : t('budget_exports.not_configured')}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                    <input
                        type="url"
                        placeholder={t('budget_exports.firefly_base_url')}
                        value={ffBase}
                        onChange={(e) => setFfBase(e.target.value)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                        type="password"
                        placeholder={t('budget_exports.firefly_token')}
                        value={ffToken}
                        onChange={(e) => setFfToken(e.target.value)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => void saveSecretsFirefly()}
                    className="rounded-lg bg-gray-800 text-white text-sm font-semibold px-4 py-2 hover:bg-gray-900"
                >
                    {t('budget_exports.save_credentials')}
                </button>
            </CollapsibleCard>

            <CollapsibleCard title={t('budget_exports.lunch_title')} defaultOpen bodyClassName="px-6 pb-6 pt-0 space-y-4">
                <label className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        checked={!!be.lunchMoney?.enabled}
                        onChange={(e) => setBe({ ...be, lunchMoney: { ...be.lunchMoney, enabled: e.target.checked } })}
                        className="w-5 h-5 rounded border-gray-300 text-emerald-600"
                    />
                    <span className="text-sm font-medium text-gray-800">{t('budget_exports.enable')}</span>
                </label>
                <p className="text-xs text-gray-500">{t('budget_exports.lunch_help')}</p>
                <textarea
                    value={mapLm}
                    onChange={(e) => setMapLm(e.target.value)}
                    rows={4}
                    className="w-full font-mono text-xs rounded-lg border border-gray-200 px-3 py-2"
                />
                <p className="text-xs text-gray-500">
                    {t('budget_exports.credentials_status')}:{' '}
                    {status?.lunchMoney ? t('budget_exports.configured') : t('budget_exports.not_configured')}
                </p>
                <input
                    type="password"
                    placeholder={t('budget_exports.lunch_token')}
                    value={lmToken}
                    onChange={(e) => setLmToken(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <button
                    type="button"
                    onClick={() => void saveSecretsLunch()}
                    className="rounded-lg bg-gray-800 text-white text-sm font-semibold px-4 py-2 hover:bg-gray-900"
                >
                    {t('budget_exports.save_credentials')}
                </button>
            </CollapsibleCard>

            <CollapsibleCard title={t('budget_exports.ynab_title')} defaultOpen bodyClassName="px-6 pb-6 pt-0 space-y-4">
                <label className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        checked={!!be.ynab?.enabled}
                        onChange={(e) => setBe({ ...be, ynab: { ...be.ynab, enabled: e.target.checked } })}
                        className="w-5 h-5 rounded border-gray-300 text-emerald-600"
                    />
                    <span className="text-sm font-medium text-gray-800">{t('budget_exports.enable')}</span>
                </label>
                <p className="text-xs text-gray-500">{t('budget_exports.ynab_help')}</p>
                <input
                    type="text"
                    placeholder={t('budget_exports.ynab_budget_id')}
                    value={be.ynab?.budgetId || ''}
                    onChange={(e) => setBe({ ...be, ynab: { ...be.ynab, budgetId: e.target.value || undefined } })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                />
                <textarea
                    value={mapYnab}
                    onChange={(e) => setMapYnab(e.target.value)}
                    rows={4}
                    className="w-full font-mono text-xs rounded-lg border border-gray-200 px-3 py-2"
                />
                <p className="text-xs text-gray-500">
                    OAuth: {status?.ynab?.configured ? t('budget_exports.ynab_connected') : t('budget_exports.not_configured')}
                    {status?.ynab?.oauthReady ? ` · ${t('budget_exports.ynab_app_ready')}` : ''}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                    <input
                        type="text"
                        placeholder="Client ID"
                        value={ynabClientId}
                        onChange={(e) => setYnabClientId(e.target.value)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                        type="password"
                        placeholder="Client secret (optional)"
                        value={ynabSecret}
                        onChange={(e) => setYnabSecret(e.target.value)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                        type="url"
                        className="sm:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder={t('budget_exports.ynab_redirect_placeholder')}
                        value={ynabRedirect}
                        onChange={(e) => setYnabRedirect(e.target.value)}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void saveSecretsYnab()}
                        className="rounded-lg bg-gray-800 text-white text-sm font-semibold px-4 py-2 hover:bg-gray-900"
                    >
                        {t('budget_exports.save_oauth_app')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void connectYnab()}
                        className="rounded-lg border border-emerald-600 text-emerald-800 text-sm font-semibold px-4 py-2 hover:bg-emerald-50"
                    >
                        {t('budget_exports.ynab_connect')}
                    </button>
                </div>
            </CollapsibleCard>

            <CollapsibleCard title={t('budget_exports.actual_title')} defaultOpen bodyClassName="px-6 pb-6 pt-0 space-y-4">
                <label className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        checked={!!be.actual?.enabled}
                        onChange={(e) => setBe({ ...be, actual: { ...be.actual, enabled: e.target.checked } })}
                        className="w-5 h-5 rounded border-gray-300 text-emerald-600"
                    />
                    <span className="text-sm font-medium text-gray-800">{t('budget_exports.enable')}</span>
                </label>
                <p className="text-xs text-gray-500">{t('budget_exports.actual_help')}</p>
                <textarea
                    value={mapActual}
                    onChange={(e) => setMapActual(e.target.value)}
                    rows={4}
                    className="w-full font-mono text-xs rounded-lg border border-gray-200 px-3 py-2"
                />
                <p className="text-xs text-gray-500">
                    {t('budget_exports.credentials_status')}:{' '}
                    {status?.actual ? t('budget_exports.configured') : t('budget_exports.not_configured')}
                </p>
                <input
                    type="url"
                    placeholder={t('budget_exports.actual_server')}
                    value={actualUrl}
                    onChange={(e) => setActualUrl(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                    type="password"
                    placeholder={t('budget_exports.actual_password')}
                    value={actualPass}
                    onChange={(e) => setActualPass(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                    type="text"
                    placeholder={t('budget_exports.actual_sync_id')}
                    value={actualSync}
                    onChange={(e) => setActualSync(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                />
                <button
                    type="button"
                    onClick={() => void saveSecretsActual()}
                    className="rounded-lg bg-gray-800 text-white text-sm font-semibold px-4 py-2 hover:bg-gray-900"
                >
                    {t('budget_exports.save_credentials')}
                </button>
            </CollapsibleCard>
        </div>
    );
}
