import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalScrapeConfig, ScraperOptions } from '@app/shared';
import { api } from '../lib/api';

export function ScrapeSettings() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<GlobalScrapeConfig | null>(null);
    const [availableChannels, setAvailableChannels] = useState<string[]>([]);
    const [telegramStatus, setTelegramStatus] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [configRes, channelsRes, telegramRes] = await Promise.all([
                    api.get<{ success: boolean; data: GlobalScrapeConfig }>('/config'),
                    api.get<{ success: boolean; data: string[] }>('/notifications/channels'),
                    api.get<{ success: boolean; data: any }>('/telegram/status')
                ]);

                if (configRes.data.success) setConfig(configRes.data.data);
                if (channelsRes.data.success) setAvailableChannels(channelsRes.data.data);
                if (telegramRes.data.success) setTelegramStatus(telegramRes.data.data);
            } catch (err) {
                console.error('Failed to fetch scrape settings', err);
                setError('Failed to load settings');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

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

    const handleSave = async () => {
        if (!config) return;

        setSaving(true);
        setError(null);
        try {
            const res = await api.put<{ success: boolean; data: GlobalScrapeConfig }>('/config', config);
            if (!res.data.success) throw new Error('Save failed');
            setConfig(res.data.data);
            setToast(t('common.save_success', 'Settings saved successfully'));
            setTimeout(() => setToast(null), 3000);
        } catch (e: any) {
            console.error('Failed to save scrape config', e);
            setError(e.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-4 text-sm text-gray-500">Loading...</div>;
    if (!config) return <div className="p-4 text-sm text-red-500">Unable to load configuration</div>;

    return (
        <div className="space-y-8">
            {/* Global Scraper Options */}
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    {t('scraper.global_options', 'Global Scraper Options')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                            <input
                                type="checkbox"
                                checked={config.scraperOptions.showBrowser || false}
                                onChange={(e) => updateOption('showBrowser', e.target.checked)}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                                <span className="block text-sm font-bold text-gray-700">{t('scraper.show_browser')}</span>
                                <span className="text-xs text-gray-500">{t('scraper.show_browser_desc', 'Open browser window during scrape (useful for debugging)')}</span>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                            <input
                                type="checkbox"
                                checked={config.scraperOptions.verbose ?? true}
                                onChange={(e) => updateOption('verbose', e.target.checked)}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                                <span className="block text-sm font-bold text-gray-700">{t('scraper.verbose', 'Verbose Logging')}</span>
                                <span className="text-xs text-gray-500">{t('scraper.verbose_desc', 'Include more debug info in the output logs.')}</span>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                            <input
                                type="checkbox"
                                checked={config.scraperOptions.combineInstallments || false}
                                onChange={(e) => updateOption('combineInstallments', e.target.checked)}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                                <span className="block text-sm font-bold text-gray-700">{t('scraper.combine_installments')}</span>
                                <span className="text-xs text-gray-500">{t('scraper.combine_installments_desc', 'Merge installments into a single transaction')}</span>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                            <input
                                type="checkbox"
                                checked={config.scraperOptions.additionalTransactionInformation || false}
                                onChange={(e) => updateOption('additionalTransactionInformation', e.target.checked)}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                                <span className="block text-sm font-bold text-gray-700">{t('scraper.additional_info', 'Additional Transaction Info')}</span>
                                <span className="text-xs text-gray-500">{t('scraper.additional_info_desc', 'Perform extra operations to get more info like categories (may increase processing time).')}</span>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                            <input
                                type="checkbox"
                                checked={config.scraperOptions.includeRawTransaction || false}
                                onChange={(e) => updateOption('includeRawTransaction', e.target.checked)}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                                <span className="block text-sm font-bold text-gray-700">{t('scraper.include_raw', 'Include Raw Transaction')}</span>
                                <span className="text-xs text-gray-500">{t('scraper.include_raw_desc', 'Include the raw source transaction in the output for debugging.')}</span>
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
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">{t('scraper.navigation_retries', 'Navigation Retry Count')}</label>
                            <input
                                type="number"
                                value={config.scraperOptions.navigationRetryCount || 0}
                                onChange={(e) => updateOption('navigationRetryCount', parseInt(e.target.value))}
                                min={0}
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">{t('scraper.navigation_retries_desc', 'Number of times to retry navigation on failure.')}</p>
                        </div>

                        <label className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors border border-blue-100">
                            <input
                                type="checkbox"
                                checked={config.useSmartStartDate}
                                onChange={(e) => setConfig({ ...config, useSmartStartDate: e.target.checked })}
                                className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                                <span className="block text-sm font-bold text-blue-900">{t('scraper.smart_start_date', 'Smart Start Date')}</span>
                                <span className="text-xs text-blue-700 opacity-80">{t('scraper.smart_start_date_desc', 'Automatically start from the last successful scrape date')}</span>
                            </div>
                        </label>

                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                            <span className="block text-sm font-bold text-gray-700">{t('scraper.opt_in_features', 'Opt-in Features')}</span>
                            <div className="space-y-2">
                                {[
                                    { id: 'isracard-amex:skipAdditionalTransactionInformation', label: 'Isracard Amex - Skip Additional Info', desc: 'Skips fetching extra details to speed up scraping.' },
                                    { id: 'mizrahi:pendingIfNoIdentifier', label: 'Mizrahi - Pending if no ID', desc: 'Treat transactions without unique identifiers as pending.' },
                                    { id: 'mizrahi:pendingIfHasGenericDescription', label: 'Mizrahi - Pending if generic desc', desc: 'Treat transactions with generic descriptions as pending.' },
                                    { id: 'mizrahi:pendingIfTodayTransaction', label: 'Mizrahi - Pending if today', desc: 'Treat today\'s transactions as pending.' }
                                ].map((feature: any) => (
                                    <label key={feature.id} className="flex items-start gap-2 cursor-pointer group">
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
                                            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div>
                                            <span className="block text-xs font-bold text-gray-700 group-hover:text-blue-700">{feature.label}</span>
                                            <span className="text-[10px] text-gray-500">{feature.desc}</span>
                                        </div>
                                    </label>
                                ))}
                                <div className="pt-2">
                                    <input
                                        type="text"
                                        placeholder={t('scraper.custom_opt_in', 'Add custom opt-in feature (comma separated)...')}
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
                                        className="w-full p-2 bg-white border border-gray-200 rounded-lg text-[11px] focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Post-Scrape Actions */}
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {t('post_scrape.title', 'Post-Scrape Actions')}
                </h3>
                <div className="space-y-6">
                    <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                        <input
                            type="checkbox"
                            checked={config.postScrapeConfig.runCategorization}
                            onChange={(e) => updatePostScrape({ runCategorization: e.target.checked })}
                            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                            <span className="block text-sm font-bold text-gray-700">{t('post_scrape.run_categorization')}</span>
                            <span className="text-xs text-gray-500">{t('post_scrape.run_categorization_desc', 'Automatically categorize new transactions using AI')}</span>
                        </div>
                    </label>

                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
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
                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500">
                                <input
                                    type="checkbox"
                                    checked={config.postScrapeConfig.fraudDetection?.notifyOnIssue}
                                    onChange={(e) => updatePostScrape({ fraudDetection: { ...config.postScrapeConfig.fraudDetection, notifyOnIssue: e.target.checked } })}
                                    className="rounded border-gray-300"
                                />
                                {t('post_scrape.notify_on_issue')}
                            </label>
                        </div>
                        <p className="text-xs text-gray-500 ml-8">{t('post_scrape.fraud_notify_help')}</p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={config.postScrapeConfig.customAI?.enabled}
                                onChange={(e) => updatePostScrape({ customAI: { ...config.postScrapeConfig.customAI, enabled: e.target.checked } })}
                                className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-sm font-bold text-gray-700">{t('post_scrape.custom_ai')}</span>
                        </div>
                        <div className="ml-8 space-y-3">
                            <textarea
                                className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none min-h-[80px]"
                                placeholder={t('post_scrape.custom_ai_query')}
                                value={config.postScrapeConfig.customAI?.query || ''}
                                onChange={(e) => updatePostScrape({ customAI: { ...config.postScrapeConfig.customAI, query: e.target.value } })}
                            />
                            <label className="flex items-center gap-3 text-sm cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.postScrapeConfig.customAI?.notifyOnResult}
                                    onChange={(e) => updatePostScrape({ customAI: { ...config.postScrapeConfig.customAI, notifyOnResult: e.target.checked } })}
                                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-xs font-bold text-gray-600">{t('post_scrape.notify_on_result')}</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-700">{t('post_scrape.notification_channels')}</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {(() => {
                                const channels = new Set([...(availableChannels || []), 'telegram']);
                                return Array.from(channels).map((ch) => {
                                    const isTelegram = ch === 'telegram';
                                    const isActive = isTelegram ? !!telegramStatus?.isActive : (availableChannels || []).includes(ch);
                                    const disabled = isTelegram && !isActive;
                                    const isSelected = (config.postScrapeConfig.notificationChannels || []).includes(ch);

                                    return (
                                        <label key={ch} className={`flex items-center gap-3 p-3 border-2 rounded-xl transition-all ${disabled ? 'opacity-40 grayscale cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'border-purple-600 bg-purple-50' : 'border-gray-100 bg-white hover:border-purple-200'}`}>
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
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-700 capitalize">{ch}</span>
                                                {disabled && <span className="text-[10px] text-red-500 font-bold uppercase">{t('common.not_configured', 'Not Configured')}</span>}
                                            </div>
                                        </label>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            </section>

            <div className="flex justify-end gap-3 sticky bottom-0 bg-gray-50/80 backdrop-blur-sm py-4 border-t border-gray-200 -mx-6 px-6 z-10">
                {error && <div className="mr-auto text-sm text-red-600 font-bold flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                </div>}
                
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`px-8 py-3 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 ${saving ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-200'}`}
                >
                    {saving ? t('common.saving') : t('common.save')}
                </button>
            </div>

            {toast && (
                <div className="fixed right-6 bottom-6 bg-green-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-bold flex items-center gap-3 animate-in fade-in slide-in-from-right-10 z-50">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                    {toast}
                </div>
            )}
        </div>
    );
}
