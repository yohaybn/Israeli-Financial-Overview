import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
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

const aiConfigSchema = z.object({
    categorizationModel: z.string().trim().min(1),
    chatModel: z.string().trim().min(1),
    llmTemperature: z.number().min(0).max(2),
    systemPrompt: z.string().max(4000),
    analyticsPromptExtra: z.string().max(4000),
});

type AiConfigDraft = z.infer<typeof aiConfigSchema>;

export function AISettings({ isOpen, onClose, isInline, showAdvanced = true }: AISettingsProps) {
    const { t } = useTranslation();
    const { data: settings } = useAISettings();
    const { data: models } = useAIModels();
    const { data: unifiedTransactions } = useUnifiedData();
    const { mutate: updateSettings, isPending } = useUpdateAISettings();

    const [localSettings, setLocalSettings] = useState<any>(null);
    const [aiSubTab, setAiSubTab] = useState<'settings' | 'memory'>('settings');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [draft, setDraft] = useState<AiConfigDraft | null>(null);

    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
            setDraft({
                categorizationModel: String(settings.categorizationModel ?? ''),
                chatModel: String(settings.chatModel ?? ''),
                llmTemperature: Number(settings.analyticsTemperature ?? 1),
                systemPrompt: String(settings.analyticsSystemInstructionExtra ?? ''),
                analyticsPromptExtra: String(settings.analyticsPromptExtra ?? ''),
            });
        }
    }, [settings]);

    useEffect(() => {
        if (!showAdvanced && aiSubTab === 'memory') {
            setAiSubTab('settings');
        }
    }, [showAdvanced, aiSubTab]);

    if (!isInline && (!isOpen || !localSettings)) return null;
    if (isInline && !localSettings) return <div className="p-8 text-center text-gray-500">{t('ai_settings.loading')}</div>;
    if (!draft) return <div className="p-8 text-center text-gray-500">{t('ai_settings.loading')}</div>;

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
    const draftValidation = useMemo(() => aiConfigSchema.safeParse(draft), [draft]);
    const isDraftValid = draftValidation.success;
    const draftFieldErrors: Partial<Record<keyof AiConfigDraft, string>> = {};
    if (!draftValidation.success) {
        for (const issue of draftValidation.error.issues) {
            const key = issue.path[0] as keyof AiConfigDraft;
            if (!draftFieldErrors[key]) {
                if (issue.path[0] === 'llmTemperature' && issue.code === 'too_small') {
                    draftFieldErrors[key] = t('config_validation.min_value', { min: 0 });
                } else if (issue.path[0] === 'llmTemperature' && issue.code === 'too_big') {
                    draftFieldErrors[key] = t('config_validation.max_value', { max: 2 });
                } else if (issue.code === 'too_small') {
                    draftFieldErrors[key] = t('config_validation.required');
                } else if (issue.code === 'too_big') {
                    draftFieldErrors[key] = t('config_validation.max_value', { max: issue.maximum ?? 4000 });
                } else {
                    draftFieldErrors[key] = t('config_validation.required');
                }
            }
        }
    }
    const isDraftDirty =
        draft.categorizationModel !== String(localSettings.categorizationModel ?? '') ||
        draft.chatModel !== String(localSettings.chatModel ?? '') ||
        draft.llmTemperature !== Number(localSettings.analyticsTemperature ?? 1) ||
        draft.systemPrompt !== String(localSettings.analyticsSystemInstructionExtra ?? '') ||
        draft.analyticsPromptExtra !== String(localSettings.analyticsPromptExtra ?? '');

    const saveAiDraft = () => {
        if (!isDraftValid || isPending || !isDraftDirty) return;
        persistSettings({
            ...localSettings,
            categorizationModel: draft.categorizationModel,
            chatModel: draft.chatModel,
            analyticsTemperature: draft.llmTemperature,
            analyticsSystemInstructionExtra: draft.systemPrompt.trim() ? draft.systemPrompt : null,
            analyticsPromptExtra: draft.analyticsPromptExtra.trim() ? draft.analyticsPromptExtra : null,
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
                values={{
                    categorizationModel: draft.categorizationModel,
                    chatModel: draft.chatModel,
                    llmTemperature: draft.llmTemperature,
                }}
                errors={{
                    categorizationModel: draftFieldErrors.categorizationModel,
                    chatModel: draftFieldErrors.chatModel,
                    llmTemperature: draftFieldErrors.llmTemperature,
                }}
                isAdvancedOpen={isAdvancedOpen}
                onAdvancedToggle={() => setIsAdvancedOpen((prev) => !prev)}
                onChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
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
                        systemPrompt={draft.systemPrompt}
                        analyticsPromptExtra={draft.analyticsPromptExtra}
                        disabled={isPending}
                        errors={{
                            systemPrompt: draftFieldErrors.systemPrompt,
                            analyticsPromptExtra: draftFieldErrors.analyticsPromptExtra,
                        }}
                        onSystemPromptChange={(value) => setDraft((prev) => (prev ? { ...prev, systemPrompt: value } : prev))}
                        onAnalyticsPromptExtraChange={(value) =>
                            setDraft((prev) => (prev ? { ...prev, analyticsPromptExtra: value } : prev))
                        }
                    />
                </>
            )}
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={saveAiDraft}
                    disabled={!isDraftDirty || !isDraftValid || isPending}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {t('common.save')}
                </button>
            </div>

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
