import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { ProviderDefinition, ScrapeRequest, ScraperOptions, ScrapeResult, Profile, GlobalScrapeConfig } from '@app/shared';
import { ProfileManager } from './ProfileManager';

// Fetch provider definitions from the server
function useProviders() {
    return useQuery({
        queryKey: ['providers'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: ProviderDefinition[] }>('/definitions');
            return data.data;
        },
    });
}

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


export function ScraperForm() {
    const { t, i18n } = useTranslation();
    const { data: providers, isLoading: isLoadingProviders } = useProviders();
    const { mutate: runScrape, isPending, isSuccess, isError, error, reset } = useRunScrape();

    const { data: globalConfig } = useGlobalConfig();

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

    // Initialize options from global config when it loads
    useEffect(() => {
        if (globalConfig?.scraperOptions) {
            setOptions(prev => ({
                ...prev,
                ...globalConfig.scraperOptions,
            }));
        }
    }, [globalConfig]);

    // Get display text based on current language
    const getProviderName = (provider: ProviderDefinition): string => {
        return i18n.language === 'he' ? (provider.nameHe || provider.name) : provider.name;
    };

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
        setSelectedProvider(profile.companyId);
        setCredentials(profile.credentials);
        setLoadedProfileName(profile.name);
        setProfileId(profile.id);
        setOptions(prev => ({
            ...prev,
            ...profile.options,
        }));
    }, []);

    if (isLoadingProviders) {
        return <div className="p-4 text-gray-500">{t('common.loading')}</div>;
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-6">
            <h2 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">{t('scraper.dashboard')}</h2>

            {/* Profile Management Section */}
            <ProfileManager
                currentCompanyId={selectedProvider}
                currentCredentials={credentials}
                currentOptions={{ ...options, startDate: undefined }} // Explicitly exclude startDate from profile
                onLoadProfile={handleLoadProfile}
            />

            <div className="border-t pt-4">
                <h3 className="text-md font-semibold mb-4 text-gray-700">{t('scraper.new_scrape')}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Provider Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('scraper.provider')}</label>
                        <select
                            value={selectedProvider}
                            onChange={(e) => setSelectedProvider(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                        >
                            {providers?.map((p) => (
                                <option key={p.id} value={p.id}>{getProviderName(p)}</option>
                            ))}
                        </select>
                    </div>

                    {/* Dynamic Credential Fields */}
                    {currentProvider?.credentialFields.map((field) => (
                        <div key={field.name}>
                            <label className="block text-sm font-medium text-gray-700">{getFieldLabel(field.label, field.labelHe)}</label>
                            <input
                                type={field.type}
                                value={credentials[field.name] || ''}
                                onChange={(e) => updateCredential(field.name, e.target.value)}
                                placeholder={getFieldPlaceholder(field.placeholder, field.placeholderHe)}
                                required={field.required}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                            />
                        </div>
                    ))}

                    {/* Start Date */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('scraper.start_date')}</label>
                        <input
                            type="date"
                            value={options.startDate || ''}
                            onChange={(e) => updateOption('startDate', e.target.value || undefined)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {options.startDate 
                                ? t('scraper.start_date_hint') 
                                : (globalConfig?.useSmartStartDate 
                                    ? t('scraper.smart_start_date_active', '✨ Smart start date active (will start from last successful scrape)') 
                                    : t('scraper.start_date_hint'))}
                        </p>
                    </div>

                    {/* Advanced Options Toggle */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                            {showAdvanced ? '▼' : '▶'} {t('scraper.advanced_options')}
                        </button>
                    </div>

                    {/* Advanced Options */}
                    {/* Advanced Options */}
                    {showAdvanced && (
                        <div className="space-y-4 pt-4 border-t border-gray-100">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="showBrowser"
                                            checked={options.showBrowser || false}
                                            onChange={(e) => updateOption('showBrowser', e.target.checked)}
                                            className="rounded border-gray-300"
                                        />
                                        <label htmlFor="showBrowser" className="text-sm text-gray-700">{t('scraper.show_browser')}</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="verbose"
                                            checked={options.verbose ?? true}
                                            onChange={(e) => updateOption('verbose', e.target.checked)}
                                            className="rounded border-gray-300"
                                        />
                                        <label htmlFor="verbose" className="text-sm text-gray-700">{t('scraper.verbose', 'Verbose Logging')}</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="combineInstallments"
                                            checked={options.combineInstallments || false}
                                            onChange={(e) => updateOption('combineInstallments', e.target.checked)}
                                            className="rounded border-gray-300"
                                        />
                                        <label htmlFor="combineInstallments" className="text-sm text-gray-700">{t('scraper.combine_installments')}</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="additionalInfo"
                                            checked={options.additionalTransactionInformation || false}
                                            onChange={(e) => updateOption('additionalTransactionInformation', e.target.checked)}
                                            className="rounded border-gray-300"
                                        />
                                        <label htmlFor="additionalInfo" className="text-sm text-gray-700">{t('scraper.additional_info', 'Additional Info')}</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="includeRaw"
                                            checked={options.includeRawTransaction || false}
                                            onChange={(e) => updateOption('includeRawTransaction', e.target.checked)}
                                            className="rounded border-gray-300"
                                        />
                                        <label htmlFor="includeRaw" className="text-sm text-gray-700">{t('scraper.include_raw', 'Include Raw data')}</label>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">{t('scraper.timeout')} (ms)</label>
                                        <input
                                            type="number"
                                            value={options.timeout || 120000}
                                            onChange={(e) => updateOption('timeout', parseInt(e.target.value))}
                                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs p-1.5 border"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">{t('scraper.navigation_retries', 'Retry Count')}</label>
                                        <input
                                            type="number"
                                            value={options.navigationRetryCount || 0}
                                            onChange={(e) => updateOption('navigationRetryCount', parseInt(e.target.value))}
                                            min={0}
                                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs p-1.5 border"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">{t('scraper.future_months')}</label>
                                        <input
                                            type="number"
                                            value={options.futureMonthsToScrape || 0}
                                            onChange={(e) => updateOption('futureMonthsToScrape', parseInt(e.target.value))}
                                            min={0}
                                            max={12}
                                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs p-1.5 border"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="block text-xs font-bold text-gray-600 mb-2">{t('scraper.opt_in_features', 'Opt-in Features')}</label>
                                <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded border border-gray-100">
                                    {[
                                        { id: 'isracard-amex:skipAdditionalTransactionInformation', label: 'Isracard Amex - Skip Additional Info' },
                                        { id: 'mizrahi:pendingIfNoIdentifier', label: 'Mizrahi - Pending if no ID' },
                                        { id: 'mizrahi:pendingIfHasGenericDescription', label: 'Mizrahi - Pending if generic desc' },
                                        { id: 'mizrahi:pendingIfTodayTransaction', label: 'Mizrahi - Pending if today' }
                                    ].map((feature: any) => (
                                        <label key={feature.id} className="flex items-center gap-2 cursor-pointer">
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
                                            <span className="text-[11px] text-gray-700">{feature.label}</span>
                                        </label>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    placeholder={t('scraper.custom_opt_in', 'Custom opt-in (comma separated)...')}
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
                                    className="mt-2 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-[10px] p-1.5 border"
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="autoCategorize"
                                    checked={options.autoCategorize || false}
                                    onChange={(e) => updateOption('autoCategorize', e.target.checked)}
                                    className="rounded border-gray-300"
                                />
                                <label htmlFor="autoCategorize" className="text-sm text-gray-700">{t('scraper.auto_categorize')}</label>
                            </div>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isPending}
                        className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${isPending ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isPending ? t('scraper.scraping') : t('scraper.start_scrape')}
                    </button>
                </form>

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
                                <strong>Tip:</strong> Isracard often blocks automated requests. Try enabling <strong>"Show Browser"</strong> in Advanced Options to bypass basic bot detection.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
