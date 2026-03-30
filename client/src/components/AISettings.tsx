import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { estimateTypicalAnalystCallInputTokens, sliceTransactionsForAnalyst } from '@app/shared';
import { CollapsibleCard } from './CollapsibleCard';
import { GeminiApiKeyCard } from './GeminiApiKeyCard';
import { AIMemorySettings } from './AIMemorySettings';
import { InsightRulesSettings } from './InsightRulesSettings';
import { CategorySettings } from './CategorySettings';
import { PersonaAlignmentSettings } from './persona/PersonaAlignmentSettings';
import { useAISettings, useUpdateAISettings, useAIModels } from '../hooks/useScraper';
import { useUnifiedData } from '../hooks/useUnifiedData';

interface AISettingsProps {
    isOpen?: boolean;
    onClose?: () => void;
    isInline?: boolean;
}

export function AISettings({ isOpen, onClose, isInline }: AISettingsProps) {
    const { t } = useTranslation();
    const { data: settings } = useAISettings();
    const { data: models } = useAIModels();
    const { data: unifiedTransactions } = useUnifiedData();
    const { mutate: updateSettings, isPending } = useUpdateAISettings();

    const [localSettings, setLocalSettings] = useState<any>(null);

    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
        }
    }, [settings]);

    if (!isInline && (!isOpen || !localSettings)) return null;
    if (isInline && !localSettings) return <div className="p-8 text-center text-gray-500">{t('ai_settings.loading')}</div>;

    const persistSettings = (next: any) => {
        setLocalSettings(next);
        updateSettings(next, {
            onError: (err: Error) => {
                alert(t('common.save_failed_with_error', { error: err?.message || t('common.unknown_error') }));
            },
        });
    };

    const showCategoriesInModal = !isInline;

    const totalUnifiedRows = unifiedTransactions?.length ?? 0;
    const maxRowsSetting = Number(localSettings.analystMaxTransactionRows ?? 0) || 0;
    const rowsSent = sliceTransactionsForAnalyst(unifiedTransactions ?? [], maxRowsSetting).length;
    const estInputTokens =
        totalUnifiedRows === 0 ? null : estimateTypicalAnalystCallInputTokens(rowsSent);

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

            {isInline && <GeminiApiKeyCard />}

            {isInline && <PersonaAlignmentSettings />}

            <CollapsibleCard
                title={t('ai_settings.models_heading')}
                subtitle={t('ai_settings.models_subtitle')}
                defaultOpen
                bodyClassName="px-6 pb-6 pt-0"
            >
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            {t('ai_settings.categorization_model')}
                        </label>
                        <select
                            value={localSettings.categorizationModel}
                            onChange={(e) => persistSettings({ ...localSettings, categorizationModel: e.target.value })}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            {models?.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            )) || (
                                <>
                                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                </>
                            )}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('ai_settings.analyst_model')}</label>
                        <select
                            value={localSettings.chatModel}
                            onChange={(e) => persistSettings({ ...localSettings, chatModel: e.target.value })}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            {models?.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            )) || (
                                <>
                                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                </>
                            )}
                        </select>
                    </div>
                </div>
            </CollapsibleCard>

            <CollapsibleCard
                title={t('ai_settings.quota_heading')}
                subtitle={t('ai_settings.quota_subtitle')}
                defaultOpen={false}
                bodyClassName="px-6 pb-6 pt-0 space-y-4"
            >
                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider" htmlFor="analyst-max-rows">
                        {t('ai_settings.quota_max_rows_label')}
                    </label>
                    <input
                        id="analyst-max-rows"
                        type="number"
                        min={0}
                        max={500000}
                        inputMode="numeric"
                        placeholder={t('ai_settings.quota_max_rows_placeholder')}
                        value={localSettings.analystMaxTransactionRows ?? 0}
                        onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                                persistSettings({ ...localSettings, analystMaxTransactionRows: 0 });
                                return;
                            }
                            const v = parseInt(raw, 10);
                            if (!Number.isFinite(v)) return;
                            persistSettings({
                                ...localSettings,
                                analystMaxTransactionRows: Math.max(0, Math.min(500_000, v)),
                            });
                        }}
                        className="w-full max-w-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700 space-y-2">
                    <p className="text-xs font-semibold text-slate-600">{t('ai_settings.quota_est_intro')}</p>
                    <p>
                        {estInputTokens == null
                            ? '—'
                            : t('ai_settings.quota_est_rows', {
                                  count: rowsSent,
                                  tokens: estInputTokens.toLocaleString(),
                              })}
                    </p>
                    <p className="text-xs text-slate-500">{t('ai_settings.quota_est_note')}</p>
                    <div className="space-y-1.5 pt-0.5 border-t border-slate-200/80">
                        <p className="text-xs text-slate-600 leading-relaxed">{t('ai_settings.quota_ai_logs_hint')}</p>
                        <button
                            type="button"
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('open-ai-logs'));
                                if (!isInline) onClose?.();
                            }}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                        >
                            {t('ai_settings.quota_link_ai_logs')}
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                        {t('ai_settings.quota_rate_limits_explainer')}
                        <a
                            href="https://ai.google.dev/gemini-api/docs/rate-limits#how-rate-limits-work"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                            {t('ai_settings.quota_link_how_it_works')}
                        </a>
                        .
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">{t('ai_settings.quota_free_tier_note')}</p>
                    <a
                        href="https://aistudio.google.com/rate-limit?timeRange=last-28-days"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                    >
                        {t('ai_settings.quota_link_ai_studio')}
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                </div>
            </CollapsibleCard>

            {!isInline && <GeminiApiKeyCard />}

            <AIMemorySettings isInline={true} embeddedInAiTab />

            <InsightRulesSettings isInline />

            {showCategoriesInModal && <CategorySettings />}
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
