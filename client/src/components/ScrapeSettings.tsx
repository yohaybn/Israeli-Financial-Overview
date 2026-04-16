import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalScrapeConfig, ScraperOptions, parseExcludedAccountNumbersInput } from '@app/shared';
import { api } from '../lib/api';
import { CollapsibleCard } from './CollapsibleCard';

interface ScrapeSettingsProps {
    isOpen?: boolean;
    onClose?: () => void;
    isInline?: boolean;
    /** Jump to Configuration → Budget exports (same panel). */
    onOpenBudgetExports?: () => void;
}

export function ScrapeSettings({ isOpen, onClose, isInline, onOpenBudgetExports }: ScrapeSettingsProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<GlobalScrapeConfig | null>(null);
    const [availableChannels, setAvailableChannels] = useState<string[]>([]);
    const [telegramStatus, setTelegramStatus] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const lastSerializedRef = useRef<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [configRes, channelsRes, telegramRes] = await Promise.all([
                    api.get<{ success: boolean; data: GlobalScrapeConfig }>('/config'),
                    api.get<{ success: boolean; data: string[] }>('/notifications/channels'),
                    api.get<{ success: boolean; data: any }>('/telegram/status')
                ]);

                if (configRes.data.success) {
                    const c = configRes.data.data;
                    setConfig(c);
                    lastSerializedRef.current = JSON.stringify(c);
                }
                if (channelsRes.data.success) setAvailableChannels(channelsRes.data.data);
                if (telegramRes.data.success) setTelegramStatus(telegramRes.data.data);
            } catch (err) {
                console.error('Failed to fetch scrape settings', err);
                setError(t('scraper.errors.load_failed'));
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

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
                setToast(t('common.save_success'));
                setTimeout(() => setToast(null), 1500);
            } catch (e: any) {
                console.error('Failed to save scrape config', e);
                setError(e?.message || t('scraper.errors.save_failed'));
            } finally {
                setSaving(false);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [config, t]);

    const updateOption = <K extends keyof ScraperOptions>(key: K, value: ScraperOptions[K]) => {
        if (!config) return;
        setConfig({
            ...config,
            scraperOptions: { ...config.scraperOptions, [key]: value }
        });
    };

    const updatePostScrape = (patch: any) => {
        if (!config) return;
        setConfig({
            ...config,
            postScrapeConfig: { ...config.postScrapeConfig, ...patch }
        });
    };

    if (!isInline && (!isOpen || !config)) return null;
    if (loading) return <div className="p-4 text-sm text-gray-500">{t('common.loading')}</div>;
    if (!config) return <div className="p-4 text-sm text-red-500">{t('scraper.errors.unavailable')}</div>;

    const content = (
        <div className={`${isInline ? 'space-y-8' : 'bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200'}`}>
            {!isInline && (
                <div className="p-6 bg-indigo-600 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-bold">{t('scraper.config_title')}</h3>
                        <p className="text-indigo-100 text-sm">{t('scraper.config_desc')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            <div className={`space-y-8 ${isInline ? '' : 'p-6 overflow-y-auto'}`}>
                {/* Global Scraper Options */}
                <CollapsibleCard
                    title={
                        <span className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            {t('scraper.global_options')}
                        </span>
                    }
                    defaultOpen
                    bodyClassName="px-6 pb-6 pt-0 space-y-6"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <label className="flex items-center gap-3 p-3 bg-white rounded-xl cursor-pointer hover:bg-gray-50 transition-colors border border-gray-50">
                                <input
                                    type="checkbox"
                                    checked={config.scraperOptions.showBrowser || false}
                                    onChange={(e) => updateOption('showBrowser', e.target.checked)}
                                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div>
                                    <span className="block text-sm font-bold text-gray-700">{t('scraper.show_browser')}</span>
                                    <span className="text-xs text-gray-500">{t('scraper.show_browser_desc')}</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 bg-white rounded-xl cursor-pointer hover:bg-gray-50 transition-colors border border-gray-50">
                                <input
                                    type="checkbox"
                                    checked={config.scraperOptions.verbose ?? true}
                                    onChange={(e) => updateOption('verbose', e.target.checked)}
                                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div>
                                    <span className="block text-sm font-bold text-gray-700">{t('scraper.verbose')}</span>
                                    <span className="text-xs text-gray-500">{t('scraper.verbose_desc')}</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 bg-white rounded-xl cursor-pointer hover:bg-gray-50 transition-colors border border-gray-50">
                                <input
                                    type="checkbox"
                                    checked={config.scraperOptions.combineInstallments || false}
                                    onChange={(e) => updateOption('combineInstallments', e.target.checked)}
                                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div>
                                    <span className="block text-sm font-bold text-gray-700">{t('scraper.combine_installments')}</span>
                                    <span className="text-xs text-gray-500">{t('scraper.combine_installments_desc')}</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-xl cursor-pointer hover:bg-blue-100/50 transition-colors border border-blue-100/50">
                                <input
                                    type="checkbox"
                                    checked={config.scraperOptions.ignorePendingTransactions !== false}
                                    onChange={(e) => updateOption('ignorePendingTransactions', e.target.checked)}
                                    className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div>
                                    <span className="block text-sm font-bold text-blue-900">{t('post_scrape.ignore_pending')}</span>
                                    <span className="text-xs text-blue-700 opacity-80">{t('post_scrape.ignore_pending_desc')}</span>
                                </div>
                            </label>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">{t('scraper.timeout')} (ms)</label>
                                <input
                                    type="number"
                                    value={config.scraperOptions.timeout || 120000}
                                    onChange={(e) => updateOption('timeout', parseInt(e.target.value))}
                                    className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                />
                            </div>

                            <label className="flex items-center gap-3 p-3 bg-indigo-50/50 rounded-xl cursor-pointer hover:bg-indigo-100/50 transition-colors border border-indigo-100/50">
                                <input
                                    type="checkbox"
                                    checked={config.useSmartStartDate}
                                    onChange={(e) => setConfig({ ...config, useSmartStartDate: e.target.checked })}
                                    className="w-5 h-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div>
                                    <span className="block text-sm font-bold text-indigo-900">{t('scraper.smart_start_date')}</span>
                                    <span className="text-xs text-indigo-700 opacity-80">{t('scraper.smart_start_date_desc')}</span>
                                </div>
                            </label>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">{t('scraper.future_months')}</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={12}
                                    value={config.scraperOptions.futureMonthsToScrape || 0}
                                    onChange={(e) => updateOption('futureMonthsToScrape', parseInt(e.target.value))}
                                    className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6">
                        <label className="block text-sm font-bold text-gray-700 mb-1" htmlFor="globalExcludedAccounts">
                            {t('scraper.excluded_accounts')}
                        </label>
                        <textarea
                            id="globalExcludedAccounts"
                            rows={3}
                            placeholder="12-345-678901"
                            value={(config.scraperOptions.excludedAccountNumbers || []).join('\n')}
                            onChange={(e) =>
                                updateOption(
                                    'excludedAccountNumbers',
                                    parseExcludedAccountNumbersInput(e.target.value)
                                )
                            }
                            className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-mono"
                        />
                        <p className="mt-1 text-xs text-gray-500">{t('scraper.excluded_accounts_hint')}</p>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <label className="block text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                             <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                            </svg>
                            {t('scraper.opt_in_features')}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 p-4 bg-white/50 rounded-2xl border border-gray-50">
                                {[
                                    { id: 'isracard-amex:skipAdditionalTransactionInformation', label: t('scraper.feature_skip_additional_info') },
                                    { id: 'mizrahi:pendingIfNoIdentifier', label: t('scraper.feature_mizrahi_pending_no_id') },
                                    { id: 'mizrahi:pendingIfHasGenericDescription', label: t('scraper.feature_mizrahi_pending_generic') },
                                    { id: 'mizrahi:pendingIfTodayTransaction', label: t('scraper.feature_mizrahi_pending_today') }
                                ].map((feature) => (
                                    <label key={feature.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-xl cursor-pointer transition-colors group">
                                        <input
                                            type="checkbox"
                                            checked={(config.scraperOptions.optInFeatures || []).includes(feature.id)}
                                            onChange={(e) => {
                                                const current = config.scraperOptions.optInFeatures || [];
                                                const next = e.target.checked 
                                                    ? [...current, feature.id]
                                                    : current.filter((id: string) => id !== feature.id);
                                                updateOption('optInFeatures', next);
                                            }}
                                            className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700 group-hover:text-indigo-600 transition-colors">{feature.label}</span>
                                    </label>
                                ))}
                            </div>
                            
                            <div className="space-y-3">
                                <p className="text-xs text-gray-500 px-1 italic">
                                    {t('scraper.custom_opt_in_help')}
                                </p>
                                <textarea
                                    placeholder={t('scraper.custom_opt_in')}
                                    value={(config.scraperOptions.optInFeatures || []).filter((f: string) => ![
                                        'isracard-amex:skipAdditionalTransactionInformation',
                                        'mizrahi:pendingIfNoIdentifier',
                                        'mizrahi:pendingIfHasGenericDescription',
                                        'mizrahi:pendingIfTodayTransaction'
                                    ].includes(f)).join(', ')}
                                    onChange={(e) => {
                                        const known = [
                                            'isracard-amex:skipAdditionalTransactionInformation',
                                            'mizrahi:pendingIfNoIdentifier',
                                            'mizrahi:pendingIfHasGenericDescription',
                                            'mizrahi:pendingIfTodayTransaction'
                                        ];
                                        const currentKnown = (config.scraperOptions.optInFeatures || []).filter((f: string) => known.includes(f));
                                        const custom = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean);
                                        updateOption('optInFeatures', [...new Set([...currentKnown, ...custom])]);
                                    }}
                                    className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm min-h-[120px]"
                                />
                            </div>
                        </div>
                    </div>
                </CollapsibleCard>

                {/* Post-Scrape Actions */}
                <CollapsibleCard
                    title={
                        <span className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {t('post_scrape.title')}
                        </span>
                    }
                    defaultOpen
                    bodyClassName="px-6 pb-6 pt-0 space-y-6"
                >
                    <div className="space-y-6">
                        <label className="flex items-center gap-3 p-3 bg-white rounded-xl cursor-pointer hover:bg-gray-50 transition-colors border border-gray-50">
                            <input
                                type="checkbox"
                                checked={config.postScrapeConfig.runCategorization}
                                onChange={(e) => updatePostScrape({ runCategorization: e.target.checked })}
                                className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <div>
                                <span className="block text-sm font-bold text-gray-700">{t('post_scrape.run_categorization')}</span>
                                <span className="text-xs text-gray-500">{t('post_scrape.run_categorization_desc')}</span>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-white rounded-xl cursor-pointer hover:bg-gray-50 transition-colors border border-gray-50">
                            <input
                                type="checkbox"
                                checked={config.postScrapeConfig.runInsightRules !== false}
                                onChange={(e) => updatePostScrape({ runInsightRules: e.target.checked })}
                                className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <div>
                                <span className="block text-sm font-bold text-gray-700">{t('post_scrape.run_insight_rules')}</span>
                                <span className="text-xs text-gray-500">{t('post_scrape.run_insight_rules_desc')}</span>
                            </div>
                        </label>

                        {onOpenBudgetExports && (
                            <div className="p-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 text-sm text-gray-700 flex flex-wrap items-center justify-between gap-3">
                                <p className="min-w-0">{t('post_scrape.budget_exports_teaser')}</p>
                                <button
                                    type="button"
                                    onClick={onOpenBudgetExports}
                                    className="shrink-0 rounded-lg bg-emerald-600 text-white text-xs font-bold px-4 py-2 hover:bg-emerald-700"
                                >
                                    {t('post_scrape.budget_exports_open')}
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={config.postScrapeConfig.fraudDetection?.enabled}
                                            onChange={(e) => updatePostScrape({ fraudDetection: { ...config.postScrapeConfig.fraudDetection, enabled: e.target.checked } })}
                                            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                        />
                                        <span className="text-sm font-bold text-gray-700">{t('post_scrape.fraud_detection')}</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">{t('post_scrape.fraud_notify_help')}</p>

                                {/* Detector mode (local / AI / both) */}
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                                        {t('post_scrape.fraud_mode_label')}
                                    </span>
                                    <div className="flex gap-1 p-1 bg-gray-50 rounded-lg border border-gray-100">
                                        {(['local', 'ai', 'both'] as const).map((mode) => {
                                            const isActive = (config.postScrapeConfig.fraudDetection?.mode || 'local') === mode;
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
                                                        updatePostScrape({
                                                            fraudDetection: {
                                                                ...config.postScrapeConfig.fraudDetection,
                                                                mode,
                                                            },
                                                        })
                                                    }
                                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                                                        isActive
                                                            ? 'bg-purple-600 text-white shadow-sm'
                                                            : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                                >
                                                    {t(labelKey)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="flex gap-2 p-1 bg-gray-50 rounded-lg border border-gray-100 w-fit">
                                    <button 
                                        onClick={() => updatePostScrape({ fraudDetection: { ...config.postScrapeConfig.fraudDetection, scope: 'current' } })}
                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${config.postScrapeConfig.fraudDetection?.scope !== 'all' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {t('post_scrape.scope_current')}
                                    </button>
                                    <button 
                                        onClick={() => updatePostScrape({ fraudDetection: { ...config.postScrapeConfig.fraudDetection, scope: 'all' } })}
                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${config.postScrapeConfig.fraudDetection?.scope === 'all' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {t('post_scrape.scope_all')}
                                    </button>
                                </div>

                                {/* Notify toggle */}
                                <label className="flex items-center gap-2 text-xs text-gray-600 mt-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.postScrapeConfig.fraudDetection?.notifyOnIssue ?? true}
                                        onChange={(e) =>
                                            updatePostScrape({
                                                fraudDetection: {
                                                    ...config.postScrapeConfig.fraudDetection,
                                                    notifyOnIssue: e.target.checked,
                                                },
                                            })
                                        }
                                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="font-medium">
                                        {t('post_scrape.fraud_notify_toggle')}
                                    </span>
                                </label>

                                {/* Link to advanced fraud settings */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const el = document.getElementById('fraud-alerts-section');
                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        else window.dispatchEvent(new CustomEvent('open-fraud-settings'));
                                    }}
                                    className="mt-2 text-[11px] font-semibold text-purple-600 hover:text-purple-800 underline-offset-2 hover:underline"
                                >
                                    {t('post_scrape.fraud_advanced_link')}
                                </button>
                            </div>

                            <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={config.postScrapeConfig.customAI?.enabled}
                                        onChange={(e) => updatePostScrape({ customAI: { ...config.postScrapeConfig.customAI, enabled: e.target.checked } })}
                                        className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="text-sm font-bold text-gray-700">{t('post_scrape.custom_ai')}</span>
                                </div>
                                <textarea
                                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none min-h-[60px]"
                                    placeholder={t('post_scrape.custom_ai_query')}
                                    value={config.postScrapeConfig.customAI?.query || ''}
                                    onChange={(e) => updatePostScrape({ customAI: { ...config.postScrapeConfig.customAI, query: e.target.value } })}
                                />
                                <div className="flex gap-2 p-1 bg-gray-50 rounded-lg border border-gray-100 w-fit">
                                    <button 
                                        onClick={() => updatePostScrape({ customAI: { ...config.postScrapeConfig.customAI, scope: 'current' } })}
                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${config.postScrapeConfig.customAI?.scope !== 'all' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {t('post_scrape.scope_current')}
                                    </button>
                                    <button 
                                        onClick={() => updatePostScrape({ customAI: { ...config.postScrapeConfig.customAI, scope: 'all' } })}
                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${config.postScrapeConfig.customAI?.scope === 'all' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {t('post_scrape.scope_all')}
                                    </button>
                                </div>
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.postScrapeConfig.customAI?.skipIfNoTransactions !== false}
                                        onChange={(e) =>
                                            updatePostScrape({
                                                customAI: {
                                                    ...config.postScrapeConfig.customAI,
                                                    skipIfNoTransactions: e.target.checked,
                                                },
                                            })
                                        }
                                        className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <span>
                                        <span className="block text-xs font-semibold text-gray-700">{t('post_scrape.custom_ai_skip_if_no_tx')}</span>
                                        <span className="text-[11px] text-gray-500">{t('post_scrape.custom_ai_skip_if_no_tx_desc')}</span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-2">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.postScrapeConfig.aggregateTelegramNotifications !== false}
                                    onChange={(e) =>
                                        updatePostScrape({ aggregateTelegramNotifications: e.target.checked })
                                    }
                                    className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <span>
                                    <span className="block text-sm font-bold text-gray-700">{t('post_scrape.telegram_aggregate')}</span>
                                    <span className="text-xs text-gray-500">{t('post_scrape.telegram_aggregate_desc')}</span>
                                </span>
                            </label>
                            <p className="text-xs text-gray-500 pl-8 border-l-2 border-indigo-100 ml-1">
                                {t('post_scrape.whale_where')}
                            </p>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.postScrapeConfig.spendingDigestEnabled === true}
                                    onChange={(e) =>
                                        updatePostScrape({ spendingDigestEnabled: e.target.checked })
                                    }
                                    className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <span>
                                    <span className="block text-sm font-bold text-gray-700">{t('post_scrape.spending_digest')}</span>
                                    <span className="text-xs text-gray-500">{t('post_scrape.spending_digest_help')}</span>
                                </span>
                            </label>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-3">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.postScrapeConfig.transactionReviewReminder?.enabled !== false}
                                    onChange={(e) =>
                                        updatePostScrape({
                                            transactionReviewReminder: {
                                                ...config.postScrapeConfig.transactionReviewReminder,
                                                enabled: e.target.checked,
                                            },
                                        })
                                    }
                                    className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <span>
                                    <span className="block text-sm font-bold text-gray-700">{t('post_scrape.review_reminder_title')}</span>
                                    <span className="text-xs text-gray-500">{t('post_scrape.review_reminder_desc')}</span>
                                </span>
                            </label>
                            {config.postScrapeConfig.transactionReviewReminder?.enabled !== false && (
                                <div className="pl-8 space-y-2 border-l-2 border-indigo-100 ml-1">
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={config.postScrapeConfig.transactionReviewReminder?.notifyTransfersCategory !== false}
                                            onChange={(e) =>
                                                updatePostScrape({
                                                    transactionReviewReminder: {
                                                        ...config.postScrapeConfig.transactionReviewReminder,
                                                        notifyTransfersCategory: e.target.checked,
                                                    },
                                                })
                                            }
                                            className="rounded border-gray-300 text-purple-600"
                                        />
                                        {t('post_scrape.review_reminder_transfers')}
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={config.postScrapeConfig.transactionReviewReminder?.notifyUncategorized !== false}
                                            onChange={(e) =>
                                                updatePostScrape({
                                                    transactionReviewReminder: {
                                                        ...config.postScrapeConfig.transactionReviewReminder,
                                                        notifyUncategorized: e.target.checked,
                                                    },
                                                })
                                            }
                                            className="rounded border-gray-300 text-purple-600"
                                        />
                                        {t('post_scrape.review_reminder_uncategorized')}
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-bold text-gray-700">{t('post_scrape.notification_channels')}</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {Array.from(new Set([...(availableChannels || []), 'telegram'])).map((ch) => {
                                    const isTelegram = ch === 'telegram';
                                    const isActive = isTelegram ? !!telegramStatus?.isActive : (availableChannels || []).includes(ch);
                                    const isSelected = (config.postScrapeConfig.notificationChannels || []).includes(ch);
                                    const disabled = isTelegram && !isActive;

                                    return (
                                        <label key={ch} className={`flex items-center gap-2 p-2 border-2 rounded-xl transition-all ${disabled ? 'opacity-40 grayscale cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'border-purple-600 bg-purple-50' : 'border-gray-50 bg-white hover:border-purple-200'}`}>
                                            <input
                                                type="checkbox"
                                                disabled={disabled}
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    const current = Array.isArray(config.postScrapeConfig.notificationChannels) ? [...config.postScrapeConfig.notificationChannels] : [];
                                                    if (e.target.checked) {
                                                        if (!current.includes(ch)) current.push(ch);
                                                    } else {
                                                        const idx = current.indexOf(ch);
                                                        if (idx >= 0) current.splice(idx, 1);
                                                    }
                                                    updatePostScrape({ notificationChannels: current });
                                                }}
                                                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                            />
                                            <span className="text-xs font-bold text-gray-700 capitalize">{ch}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </CollapsibleCard>
            </div>

            <div className={`flex justify-end gap-3 shrink-0 ${isInline ? 'sticky bottom-0 bg-gray-50/80 backdrop-blur-sm py-4 border-t border-gray-200 -mx-6 px-6 z-10' : 'p-6 bg-gray-50 border-t border-gray-100'}`}>
                {error && (
                    <div className="mr-auto text-xs text-red-600 font-bold flex items-center gap-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {error}
                    </div>
                )}
                {saving && (
                    <span className="mr-auto text-xs text-indigo-600 font-bold flex items-center gap-1.5">
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
            {toast && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 z-[110]">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-bold">{toast}</span>
                </div>
            )}
        </div>
    );

    if (isInline) return content;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            {content}
        </div>
    );
}
