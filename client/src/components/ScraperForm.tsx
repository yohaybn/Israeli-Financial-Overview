import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import {
    ScrapeRequest,
    ScraperOptions,
    ScrapeResult,
    Profile,
    GlobalScrapeConfig,
    parseExcludedAccountNumbersInput,
} from '@app/shared';
import { ProfileManager } from './ProfileManager';
import { useCreateProfile } from '../hooks/useProfiles';
import { useAppLockStatus } from '../hooks/useAppLock';
import { useProviders, getProviderDisplayName } from '../hooks/useProviders';

// Run a scrape with full options
function useRunScrape() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (request: ScrapeRequest) => {
            const { data } = await api.post<{ success: boolean; data: ScrapeResult; filename: string }>('/scrape', request);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
        },
    });
}

// Fetch global scrape configuration
function useGlobalConfig() {
    return useQuery({
        queryKey: ['globalConfig'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: GlobalScrapeConfig }>('/config');
            return data.data;
        },
    });
}


export function ScraperForm({ onOpenSettings }: { onOpenSettings?: () => void }) {
    const { t, i18n } = useTranslation();
    const { data: appLock } = useAppLockStatus();
    const restricted = Boolean(appLock?.restricted);
    const { data: providers, isLoading: isLoadingProviders } = useProviders();
    const { mutate: runScrape, isPending, isSuccess, isError, error, reset } = useRunScrape();

    const { data: globalConfig } = useGlobalConfig();
    const { mutate: createProfile, isPending: isCreating } = useCreateProfile();

    // Form state
    const [selectedProvider, setSelectedProvider] = useState('');
    const [credentials, setCredentials] = useState<Record<string, string>>({});
    const [options, setOptions] = useState<ScraperOptions>({
        showBrowser: false,
        verbose: true,
        combineInstallments: false,
        timeout: 120000,
    });
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [loadedProfileName, setLoadedProfileName] = useState<string | undefined>(undefined);
    const [profileId, setProfileId] = useState<string | undefined>(undefined);
    const [showForm, setShowForm] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);

    const toggleForm = () => setShowForm(prev => !prev);

    // Initialize options from global config when it loads
    useEffect(() => {
        if (globalConfig?.scraperOptions) {
            setOptions(prev => ({
                ...prev,
                ...globalConfig.scraperOptions,
            }));
        }
    }, [globalConfig]);

    const getFieldLabel = (label: string, labelHe?: string): string => {
        return i18n.language === 'he' ? (labelHe || label) : label;
    };

    const getFieldPlaceholder = (placeholder?: string, placeholderHe?: string): string | undefined => {
        return i18n.language === 'he' ? (placeholderHe || placeholder) : placeholder;
    };

    // Auto-select first provider when loaded
    useEffect(() => {
        if (providers && providers.length > 0 && !selectedProvider) {
            setSelectedProvider(providers[0].id);
        }
    }, [providers, selectedProvider]);

    // Reset credentials when provider changes
    useEffect(() => {
        setCredentials({});
        reset();
    }, [selectedProvider, reset]);

    const currentProvider = providers?.find(p => p.id === selectedProvider);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProvider) return;
        if (restricted) return;

        const request: ScrapeRequest = {
            companyId: selectedProvider,
            credentials: profileId ? {} : credentials,
            options,
            profileName: loadedProfileName,
            profileId,
        };
        runScrape(request);
    };

    const updateCredential = (name: string, value: string) => {
        setCredentials(prev => ({ ...prev, [name]: value }));
        // Manual change clears the profile context
        setProfileId(undefined);
        setLoadedProfileName(undefined);
    };

    const updateOption = <K extends keyof ScraperOptions>(key: K, value: ScraperOptions[K]) => {
        setOptions(prev => ({ ...prev, [key]: value }));
    };

    const handleLoadProfile = useCallback((profile: Profile) => {
        setProfileId(profile.id);
        setLoadedProfileName(profile.name);
        setSelectedProvider(profile.companyId);
        // We explicitly don't fill credentials here as requested
        setCredentials({}); 
        setShowForm(false);
        // Still load options as they are non-credential settings
        setOptions(prev => ({
            ...prev,
            ...profile.options,
        }));
    }, []);

    const handleAddNewProfile = () => {
        setProfileId(undefined);
        setLoadedProfileName(undefined);
        setCredentials({});
        setShowForm(true);
    };

    const handleSaveProfile = () => {
        if (!newProfileName.trim() || !selectedProvider) return;

        createProfile({
            name: newProfileName.trim(),
            companyId: selectedProvider,
            credentials: credentials,
            options: { ...options, startDate: undefined }, // Explicitly exclude startDate from profile
        }, {
            onSuccess: (profile) => {
                setNewProfileName('');
                setShowSaveInput(false);
                setProfileId(profile.id);
                setLoadedProfileName(profile.name);
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                alert(t('profiles.save_failed', { error: errorMsg }));
            }
        });
    };

    if (isLoadingProviders) {
        return <div className="p-4 text-gray-500">{t('common.loading')}</div>;
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-6">
            <div className="flex items-center justify-between gap-3 border-b pb-2">
                <h2 className="text-lg font-bold text-gray-800">{t('scraper.dashboard')}</h2>
                {onOpenSettings && (
                    <button
                        type="button"
                        onClick={onOpenSettings}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-indigo-600"
                        title={t('scraper.config_title')}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Profile Management Section */}
            <ProfileManager
                currentCompanyId={selectedProvider}
                currentCredentials={credentials}
                currentOptions={{ ...options, startDate: undefined }} // Explicitly exclude startDate from profile
                selectedProfileId={profileId}
                onLoadProfile={handleLoadProfile}
                onAddNewProfile={handleAddNewProfile}
                hideSaveButton={true}
                restrictNewProfile={restricted}
            />

            <div className={`border-t pt-4 space-y-4`}>
                <div className="flex items-center justify-between cursor-pointer group" onClick={toggleForm}>
                    <h3 className="text-md font-semibold text-gray-700">{t('scraper.new_scrape')}</h3>
                    <div
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-all text-gray-400 group-hover:text-blue-600 flex items-center gap-2"
                    >
                        <span className="text-xs font-medium uppercase tracking-wider">{showForm ? t('common.hide') : t('common.show')}</span>
                        <svg className={`w-5 h-5 transition-transform ${showForm ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
                
                {showForm && (
                    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Provider Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700">{t('scraper.provider')}</label>
                            <select
                                value={selectedProvider}
                                onChange={(e) => setSelectedProvider(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                            >
                                {providers?.map((p) => (
                                    <option key={p.id} value={p.id}>{getProviderDisplayName(p.id, providers, i18n.language)}</option>
                                ))}
                            </select>
                        </div>

                        {/* Dynamic Credential Fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {currentProvider?.credentialFields.map((field) => (
                                <div key={field.name}>
                                    <label className="block text-sm font-medium text-gray-700">{getFieldLabel(field.label, field.labelHe)}</label>
                                    <input
                                        type={field.type === 'password' ? 'password' : 'text'}
                                        value={credentials[field.name] || ''}
                                        onChange={(e) => updateCredential(field.name, e.target.value)}
                                        placeholder={getFieldPlaceholder(field.placeholder, field.placeholderHe)}
                                        required={field.required}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-50">
                            {/* Save Profile Button */}
                            {!showSaveInput ? (
                                <button
                                    type="button"
                                    onClick={() => setShowSaveInput(true)}
                                    className="flex-1 flex justify-center items-center gap-2 py-2 px-4 border border-blue-600 rounded-md shadow-sm text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                    </svg>
                                    {t('profiles.save_current')}
                                </button>
                            ) : (
                                <div className="flex-1 flex gap-2">
                                    <input
                                        type="text"
                                        value={newProfileName}
                                        onChange={(e) => setNewProfileName(e.target.value)}
                                        placeholder={t('profiles.name_placeholder')}
                                        className="flex-1 text-sm p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-400 outline-none"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSaveProfile}
                                        disabled={isCreating || !newProfileName.trim()}
                                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
                                    >
                                        {isCreating ? t('common.saving') : t('common.save')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowSaveInput(false)}
                                        className="px-2 text-gray-400 hover:text-gray-600"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="sm:w-24 flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Always available Scrape Button */}
            <div className={`pt-2 border-t mt-4 space-y-4`}>
                {/* Start Date & Advanced Options - Now near scan button */}

                {/* Advanced Options */}
                {showAdvanced && (
                    <div className="space-y-5 p-4 bg-gray-50 rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {/* General Settings */}
                            <div className="space-y-3">
                                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('scraper.general_settings')}</h4>
                                <div className="space-y-2 bg-white p-3 rounded-md border border-gray-100 shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="showBrowser"
                                            checked={options.showBrowser || false}
                                            onChange={(e) => updateOption('showBrowser', e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                        />
                                        <label htmlFor="showBrowser" className="text-sm text-gray-700 cursor-pointer">{t('scraper.show_browser')}</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="verbose"
                                            checked={options.verbose ?? true}
                                            onChange={(e) => updateOption('verbose', e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                        />
                                        <label htmlFor="verbose" className="text-sm text-gray-700 cursor-pointer">{t('scraper.verbose')}</label>
                                    </div>
                                    <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                                        <input
                                            type="checkbox"
                                            id="autoCategorize"
                                            checked={options.autoCategorize || false}
                                            onChange={(e) => updateOption('autoCategorize', e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                        />
                                        <label htmlFor="autoCategorize" className="text-sm text-gray-700 cursor-pointer font-medium">{t('scraper.auto_categorize')}</label>
                                    </div>
                                </div>
                            </div>

                            {/* Data Options */}
                            <div className="space-y-3">
                                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('scraper.data_options')}</h4>
                                <div className="space-y-2 bg-white p-3 rounded-md border border-gray-100 shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="combineInstallments"
                                            checked={options.combineInstallments || false}
                                            onChange={(e) => updateOption('combineInstallments', e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                        />
                                        <label htmlFor="combineInstallments" className="text-sm text-gray-700 cursor-pointer">{t('scraper.combine_installments')}</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="additionalInfo"
                                            checked={options.additionalTransactionInformation || false}
                                            onChange={(e) => updateOption('additionalTransactionInformation', e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                        />
                                        <label htmlFor="additionalInfo" className="text-sm text-gray-700 cursor-pointer">{t('scraper.additional_info')}</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="includeRaw"
                                            checked={options.includeRawTransaction || false}
                                            onChange={(e) => updateOption('includeRawTransaction', e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                        />
                                        <label htmlFor="includeRaw" className="text-sm text-gray-700 cursor-pointer">{t('scraper.include_raw')}</label>
                                    </div>
                                    <div className="pt-2 border-t border-gray-50">
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1" htmlFor="excludedAccountsScrape">
                                            {t('scraper.excluded_accounts')}
                                        </label>
                                        <textarea
                                            id="excludedAccountsScrape"
                                            rows={2}
                                            value={(options.excludedAccountNumbers || []).join('\n')}
                                            onChange={(e) =>
                                                updateOption(
                                                    'excludedAccountNumbers',
                                                    parseExcludedAccountNumbersInput(e.target.value)
                                                )
                                            }
                                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs p-2 border font-mono"
                                        />
                                        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{t('scraper.excluded_accounts_hint')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Limits & Retries */}
                            <div className="space-y-3">
                                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('scraper.limits_retries')}</h4>
                                <div className="space-y-3 bg-white p-3 rounded-md border border-gray-100 shadow-sm">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">{t('scraper.timeout')} (ms)</label>
                                        <input
                                            type="number"
                                            value={options.timeout || 120000}
                                            onChange={(e) => updateOption('timeout', parseInt(e.target.value))}
                                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs p-2 border"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">{t('scraper.navigation_retries')}</label>
                                        <input
                                            type="number"
                                            value={options.navigationRetryCount || 0}
                                            onChange={(e) => updateOption('navigationRetryCount', parseInt(e.target.value))}
                                            min={0}
                                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs p-2 border"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">{t('scraper.future_months')}</label>
                                        <input
                                            type="number"
                                            value={options.futureMonthsToScrape || 0}
                                            onChange={(e) => updateOption('futureMonthsToScrape', parseInt(e.target.value))}
                                            min={0}
                                            max={12}
                                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs p-2 border"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Opt-in Features */}
                            <div className="space-y-3">
                                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('scraper.opt_in_features')}</h4>
                                <div className="space-y-3 bg-white p-3 rounded-md border border-gray-100 shadow-sm">
                                    <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                                        {[
                                            { id: 'isracard-amex:skipAdditionalTransactionInformation', label: t('scraper.feature_skip_additional_info') },
                                            { id: 'mizrahi:pendingIfNoIdentifier', label: t('scraper.feature_mizrahi_pending_no_id') },
                                            { id: 'mizrahi:pendingIfHasGenericDescription', label: t('scraper.feature_mizrahi_pending_generic') },
                                            { id: 'mizrahi:pendingIfTodayTransaction', label: t('scraper.feature_mizrahi_pending_today') }
                                        ].map((feature: any) => (
                                            <label key={feature.id} className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={(options.optInFeatures || []).includes(feature.id)}
                                                    onChange={(e) => {
                                                        const current = options.optInFeatures || [];
                                                        const next = e.target.checked
                                                            ? [...current, feature.id]
                                                            : current.filter((id: string) => id !== feature.id);
                                                        updateOption('optInFeatures', next);
                                                    }}
                                                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
                                                />
                                                <span className="text-[11px] text-gray-600 group-hover:text-gray-900 transition-colors">{feature.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="pt-2 border-t border-gray-50">
                                        <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">{t('scraper.custom_opt_in')}</label>
                                        <input
                                            type="text"
                                            placeholder={t('scraper.custom_opt_in')}
                                            value={(options.optInFeatures || []).filter((f: string) => ![
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
                                                const currentKnown = (options.optInFeatures || []).filter((f: string) => known.includes(f));
                                                const custom = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean);
                                                updateOption('optInFeatures', [...new Set([...currentKnown, ...custom])]);
                                            }}
                                            className="w-full rounded border-gray-200 focus:border-blue-400 focus:ring-0 text-[10px] p-1.5 bg-gray-50"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Scrape Button */}
                {(profileId || (showForm && selectedProvider && currentProvider?.credentialFields.every(f => !f.required || !!credentials[f.name]))) && (
                    <div>
                        <div className="flex flex-col gap-5 mt-4">
                            <div className="flex flex-col sm:flex-row items-start justify-between gap-6 p-4 bg-blue-50/40 rounded-xl border border-blue-100/60 shadow-sm">
                                {/* Start Date */}
                                <div className="w-full sm:flex-1">
                                    <label className="block text-[10px] font-bold text-blue-800/60 mb-1.5 ml-1 uppercase tracking-widest italic">{t('scraper.start_date')}</label>
                                    <div className="relative group">
                                        <input
                                            type="date"
                                            value={options.startDate || ''}
                                            onChange={(e) => updateOption('startDate', e.target.value || undefined)}
                                            className="block w-full rounded-lg border-blue-200 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-sm p-2.5 border bg-white transition-all group-hover:border-blue-300"
                                        />
                                    </div>
                                    <p className="text-[11px] text-blue-600/80 mt-2 ml-1 leading-snug">
                                        {options.startDate
                                            ? t('scraper.start_date_hint')
                                            : (globalConfig?.useSmartStartDate
                                                ? t('scraper.smart_start_date_active')
                                                : t('scraper.start_date_hint'))}
                                    </p>
                                </div>

                                {/* Advanced Options Toggle */}
                                <div className="w-full sm:w-auto self-start pt-5">
                                    <button
                                        type="button"
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        className={`w-full sm:w-auto text-xs flex items-center justify-center gap-2.5 font-bold px-4 py-2.5 rounded-lg transition-all border shadow-sm ${showAdvanced ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-600/20' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 hover:border-blue-300'}`}
                                    >
                                        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] shadow-inner transition-colors ${showAdvanced ? 'bg-white/20 text-white' : 'bg-blue-600 text-white'}`}>
                                            {showAdvanced ? '▼' : '▶'}
                                        </span>
                                        {t('scraper.advanced_options')}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={isPending || restricted}
                                title={restricted ? t('app_lock.locked_title') : undefined}
                                className={`w-full flex justify-center py-4 px-6 border border-transparent rounded-xl shadow-lg text-lg font-black text-white transition-all transform hover:scale-[1.01] active:scale-[0.98] ${isPending || restricted ? 'bg-blue-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'}`}
                            >
                                {isPending ? (
                                    <span className="flex items-center gap-3">
                                        <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('scraper.scraping')}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        {t('scraper.start_scrape')}
                                    </span>
                                )}
                            </button>
                        </div>
                        {!showForm && profileId && loadedProfileName && (
                            <p className="text-center text-xs text-gray-500 mt-2 italic">
                                {t('scraper.using_profile', { name: loadedProfileName, defaultValue: `Using profile: ${loadedProfileName}` })}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Status Messages */}
            {isSuccess && (
                <div className="mt-4 p-2 bg-green-50 text-green-700 text-sm rounded border border-green-200">
                    {t('scraper.scrape_success')}
                </div>
            )}
            {isError && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
                    <div className="font-bold mb-1">{t('scraper.scrape_error', { message: '' })}</div>
                    <div className="whitespace-pre-wrap">{(error as any)?.response?.data?.error || error?.message || t('common.error')}</div>

                    {((error as any)?.response?.data?.error?.includes('Block Automation') || (error as any)?.response?.data?.error?.includes('429')) && (
                        <div className="mt-2 pt-2 border-t border-red-200 text-xs italic">
                            <strong>{t('common.tip')}:</strong> {t('scraper.isracard_block_tip')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
