import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AdvancedAISettings } from './AdvancedAISettings';
import { GeminiApiKeyCard } from './GeminiApiKeyCard';
import { AIMemorySettings } from './AIMemorySettings';
import { AIPreferencesSettings } from './AIPreferencesSettings';
import { CategorySettings } from './CategorySettings';
import { PersonaAlignmentSettings } from './persona/PersonaAlignmentSettings';
import { useAISettings, useUpdateAISettings, useAIModels } from '../hooks/useScraper';
import { useUnifiedData } from '../hooks/useUnifiedData';
import { LLMProviderCard } from './config/sections/LLMProviderCard';
import { PromptEngineeringCard } from './config/sections/PromptEngineeringCard';
import { ConfigStatusBanner } from './config/ConfigStatusBanner';

interface AISettingsProps {
    isOpen?: boolean;
    onClose?: () => void;
    isInline?: boolean;
    showAdvanced?: boolean;
}

export function AISettings({ isOpen, onClose, isInline, showAdvanced = true }: AISettingsProps) {
    const { t } = useTranslation();
    const { data: settings } = useAISettings();
    const { data: models } = useAIModels();
    const { data: unifiedTransactions } = useUnifiedData();
    const { mutate: updateSettings, isPending } = useUpdateAISettings();

    const [localSettings, setLocalSettings] = useState<any>(null);
    const [aiSubTab, setAiSubTab] = useState<'settings' | 'memory'>('settings');
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
        }
    }, [settings]);

    useEffect(() => {
        if (!showAdvanced && aiSubTab === 'memory') {
            setAiSubTab('settings');
        }
    }, [showAdvanced, aiSubTab]);

    if (!isInline && (!isOpen || !localSettings)) return null;
    if (isInline && !localSettings) return <div className="p-8 text-center text-gray-500">{t('ai_settings.loading')}</div>;

    const persistSettings = (next: any) => {
        setLocalSettings(next);
        setSaveError(null);
        updateSettings(next, {
            onError: (err: Error) => {
                setSaveError(t('common.save_failed_with_error', { error: err?.message || t('common.unknown_error') }));
            },
            onSuccess: () => window.dispatchEvent(new CustomEvent('configuration-saved')),
        });
    };

    const showCategoriesInModal = !isInline;

    const subTabBar = (
        <div className="flex gap-2 p-1 rounded-xl bg-slate-100/90 border border-slate-200/80" role="tablist" aria-label={t('ai_settings.title')}>
            <button
                type="button"
                role="tab"
                aria-selected={aiSubTab === 'settings'}
                id="ai-config-subtab-settings"
                onClick={() => setAiSubTab('settings')}
                className={`flex-1 min-w-0 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    aiSubTab === 'settings' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
                {t('ai_settings.subtab_settings')}
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={aiSubTab === 'memory'}
                id="ai-config-subtab-memory"
                disabled={!showAdvanced}
                onClick={() => setAiSubTab('memory')}
                className={`flex-1 min-w-0 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    aiSubTab === 'memory'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : showAdvanced
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 cursor-not-allowed'
                }`}
            >
                {t('ai_settings.subtab_memory')}
            </button>
        </div>
    );

    const settingsTabContent = (
        <>
            <GeminiApiKeyCard />

            <LLMProviderCard
                models={models}
                disabled={isPending}
                initialValues={{
                    categorizationModel: String(localSettings.categorizationModel ?? ''),
                    chatModel: String(localSettings.chatModel ?? ''),
                    llmTemperature: Number(localSettings.analyticsTemperature ?? 1),
                }}
                onSave={(values) =>
                    persistSettings({
                        ...localSettings,
                        categorizationModel: values.categorizationModel,
                        chatModel: values.chatModel,
                        analyticsTemperature: values.llmTemperature,
                    })
                }
            />

            {showAdvanced && (
                <>
                    <AdvancedAISettings
                        localSettings={localSettings}
                        persistSettings={persistSettings}
                        isPending={isPending}
                        models={models}
                        unifiedTransactions={unifiedTransactions}
                        onCloseModal={onClose}
                        isInline={isInline}
                    />

                    <PromptEngineeringCard
                        systemPrompt={String(localSettings.analyticsSystemInstructionExtra ?? '')}
                        analyticsPromptExtra={String(localSettings.analyticsPromptExtra ?? '')}
                        disabled={isPending}
                        onSystemPromptChange={(value) =>
                            persistSettings({
                                ...localSettings,
                                analyticsSystemInstructionExtra: value ? value : null,
                            })
                        }
                        onAnalyticsPromptExtraChange={(value) =>
                            persistSettings({
                                ...localSettings,
                                analyticsPromptExtra: value ? value : null,
                            })
                        }
                    />
                </>
            )}

            <AIPreferencesSettings />

            {showCategoriesInModal && <CategorySettings />}
        </>
    );

    const inner = (
        <div className={`${isInline ? 'space-y-6' : 'space-y-6 max-h-[90vh] overflow-y-auto p-6'}`}>
            {!isInline && (
                <div className="p-6 bg-indigo-600 text-white flex justify-between items-center shrink-0 -m-6 mb-0 rounded-t-3xl">
                    <div>
                        <h3 className="text-xl font-bold">{t('ai_settings.title')}</h3>
                        <p className="text-indigo-100 text-sm">{t('ai_settings.description')}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            <div className={!isInline ? 'pt-2' : ''}>{subTabBar}</div>

            <ConfigStatusBanner state={saveError ? 'error' : isPending ? 'saving' : 'idle'} message={saveError} />

            {isPending && (
                <div className="flex justify-end">
                    <span className="text-xs text-indigo-600 flex items-center gap-1.5 font-medium">
                        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" aria-hidden>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                        </svg>
                        {t('ai_settings.saving')}
                    </span>
                </div>
            )}

            {aiSubTab === 'settings' && settingsTabContent}

            {aiSubTab === 'memory' && (
                <div className="space-y-6">
                    <PersonaAlignmentSettings />
                    <AIMemorySettings isInline={true} embeddedInAiTab />
                </div>
            )}
        </div>
    );

    const content = (
        <div
            className={`${
                isInline ? '' : 'bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200'
            }`}
        >
            {inner}
        </div>
    );

    if (isInline) return content;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            {content}
        </div>
    );
}
