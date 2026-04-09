import { useTranslation } from 'react-i18next';
import {
    estimateTypicalAnalystCallInputTokens,
    sliceTransactionsForAnalyst,
    type Transaction,
} from '@app/shared';
import { CollapsibleCard } from './CollapsibleCard';

type LocalAiSettings = Record<string, unknown>;

interface AdvancedAISettingsProps {
    localSettings: LocalAiSettings;
    persistSettings: (next: LocalAiSettings) => void;
    isPending: boolean;
    models?: string[];
    unifiedTransactions: Transaction[] | undefined;
    onCloseModal?: () => void;
    isInline?: boolean;
}

const labelClass = 'text-xs font-bold text-gray-400 uppercase tracking-wider';
const inputClass =
    'w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const textareaClass =
    'w-full min-h-[88px] px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y';

function optNumField(
    key: string,
    min: number,
    max: number,
    localSettings: LocalAiSettings,
    persistSettings: (n: LocalAiSettings) => void,
    base: LocalAiSettings,
    isPending: boolean
) {
    const raw = localSettings[key];
    const display = raw === undefined || raw === null ? '' : String(raw);
    return (
        <input
            type="number"
            min={min}
            max={max}
            step="any"
            inputMode="decimal"
            disabled={isPending}
            placeholder="—"
            value={display}
            onChange={(e) => {
                const v = e.target.value.trim();
                if (v === '') {
                    persistSettings({ ...base, [key]: null });
                    return;
                }
                const n = parseFloat(v);
                if (!Number.isFinite(n)) return;
                persistSettings({ ...base, [key]: Math.max(min, Math.min(max, n)) });
            }}
            className={inputClass}
        />
    );
}

export function AdvancedAISettings({
    localSettings,
    persistSettings,
    isPending,
    models,
    unifiedTransactions,
    onCloseModal,
    isInline,
}: AdvancedAISettingsProps) {
    const { t } = useTranslation();

    const totalUnifiedRows = unifiedTransactions?.length ?? 0;
    const maxRowsSetting = Number(localSettings.analystMaxTransactionRows ?? 0) || 0;
    const rowsSent = sliceTransactionsForAnalyst(unifiedTransactions ?? [], maxRowsSetting).length;
    const estInputTokens =
        totalUnifiedRows === 0 ? null : estimateTypicalAnalystCallInputTokens(rowsSent);

    const base = localSettings;

    return (
        <CollapsibleCard
            title={t('ai_settings.advanced_heading')}
            subtitle={t('ai_settings.advanced_subtitle')}
            defaultOpen={false}
            bodyClassName="px-6 pb-6 pt-0 space-y-6"
        >
            <div className="space-y-2">
                <label className={labelClass} htmlFor="adv-fallback-model">
                    {t('ai_settings.fallback_model_label')}
                </label>
                <select
                    id="adv-fallback-model"
                    disabled={isPending}
                    value={(localSettings.fallbackModel as string | undefined) ?? ''}
                    onChange={(e) => {
                        const v = e.target.value.trim();
                        persistSettings({ ...base, fallbackModel: v ? v : null });
                    }}
                    className={inputClass}
                >
                    <option value="">{t('ai_settings.fallback_model_none')}</option>
                    {(models ?? []).map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                    ))}
                    {!models?.length && (
                        <>
                            <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                            <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                            <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                        </>
                    )}
                </select>
                <p className="text-xs text-slate-600 leading-relaxed">{t('ai_settings.fallback_model_help')}</p>
            </div>

            <div className="space-y-2 border-t border-gray-100 pt-5">
                <label className={labelClass} htmlFor="adv-analyst-max-rows">
                    {t('ai_settings.quota_max_rows_label')}
                </label>
                <input
                    id="adv-analyst-max-rows"
                    type="number"
                    min={0}
                    max={500000}
                    inputMode="numeric"
                    disabled={isPending}
                    placeholder={t('ai_settings.quota_max_rows_placeholder')}
                    value={Number(localSettings.analystMaxTransactionRows ?? 0) || 0}
                    onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                            persistSettings({ ...base, analystMaxTransactionRows: 0 });
                            return;
                        }
                        const v = parseInt(raw, 10);
                        if (!Number.isFinite(v)) return;
                        persistSettings({
                            ...base,
                            analystMaxTransactionRows: Math.max(0, Math.min(500_000, v)),
                        });
                    }}
                    className="w-full max-w-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
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
                                if (!isInline) onCloseModal?.();
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
            </div>

            <div className="border-t border-gray-100 pt-5 space-y-4">
                <h4 className="text-sm font-bold text-slate-800">{t('ai_settings.advanced_prompts_section')}</h4>
                <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="adv-analytics-prompt-extra">
                        {t('ai_settings.analytics_prompt_extra_label')}
                    </label>
                    <textarea
                        id="adv-analytics-prompt-extra"
                        disabled={isPending}
                        className={textareaClass}
                        value={(localSettings.analyticsPromptExtra as string | undefined) ?? ''}
                        onChange={(e) =>
                            persistSettings({ ...base, analyticsPromptExtra: e.target.value ? e.target.value : null })
                        }
                        placeholder={t('ai_settings.analytics_prompt_extra_placeholder')}
                    />
                    <p className="text-xs text-slate-500">{t('ai_settings.analytics_prompt_extra_help')}</p>
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="adv-analytics-system-extra">
                        {t('ai_settings.analytics_system_extra_label')}
                    </label>
                    <textarea
                        id="adv-analytics-system-extra"
                        disabled={isPending}
                        className={textareaClass}
                        value={(localSettings.analyticsSystemInstructionExtra as string | undefined) ?? ''}
                        onChange={(e) =>
                            persistSettings({
                                ...base,
                                analyticsSystemInstructionExtra: e.target.value ? e.target.value : null,
                            })
                        }
                        placeholder={t('ai_settings.analytics_system_extra_placeholder')}
                    />
                    <p className="text-xs text-slate-500">{t('ai_settings.analytics_system_extra_help')}</p>
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="adv-cat-prompt-extra">
                        {t('ai_settings.categorization_prompt_extra_label')}
                    </label>
                    <textarea
                        id="adv-cat-prompt-extra"
                        disabled={isPending}
                        className={textareaClass}
                        value={(localSettings.categorizationPromptExtra as string | undefined) ?? ''}
                        onChange={(e) =>
                            persistSettings({
                                ...base,
                                categorizationPromptExtra: e.target.value ? e.target.value : null,
                            })
                        }
                        placeholder={t('ai_settings.categorization_prompt_extra_placeholder')}
                    />
                    <p className="text-xs text-slate-500">{t('ai_settings.categorization_prompt_extra_help')}</p>
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="adv-cat-system-extra">
                        {t('ai_settings.categorization_system_extra_label')}
                    </label>
                    <textarea
                        id="adv-cat-system-extra"
                        disabled={isPending}
                        className={textareaClass}
                        value={(localSettings.categorizationSystemInstructionExtra as string | undefined) ?? ''}
                        onChange={(e) =>
                            persistSettings({
                                ...base,
                                categorizationSystemInstructionExtra: e.target.value ? e.target.value : null,
                            })
                        }
                        placeholder={t('ai_settings.categorization_system_extra_placeholder')}
                    />
                    <p className="text-xs text-slate-500">{t('ai_settings.categorization_system_extra_help')}</p>
                </div>
            </div>

            <div className="border-t border-gray-100 pt-5 space-y-4">
                <h4 className="text-sm font-bold text-slate-800">{t('ai_settings.advanced_analyst_gen_section')}</h4>
                <p className="text-xs text-slate-500">{t('ai_settings.advanced_gen_defaults_hint')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className={labelClass}>{t('ai_settings.analytics_temperature_label')}</label>
                        {optNumField('analyticsTemperature', 0, 2, localSettings, persistSettings, base, isPending)}
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelClass}>{t('ai_settings.analytics_top_p_label')}</label>
                        {optNumField('analyticsTopP', 0, 1, localSettings, persistSettings, base, isPending)}
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelClass}>{t('ai_settings.analytics_top_k_label')}</label>
                        {optNumField('analyticsTopK', 1, 500, localSettings, persistSettings, base, isPending)}
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelClass}>{t('ai_settings.analytics_max_tokens_label')}</label>
                        {optNumField('analyticsMaxOutputTokens', 1, 65536, localSettings, persistSettings, base, isPending)}
                    </div>
                </div>
            </div>

            <div className="border-t border-gray-100 pt-5 space-y-4">
                <h4 className="text-sm font-bold text-slate-800">{t('ai_settings.advanced_categorization_gen_section')}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className={labelClass}>{t('ai_settings.categorization_temperature_label')}</label>
                        {optNumField('categorizationTemperature', 0, 2, localSettings, persistSettings, base, isPending)}
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelClass}>{t('ai_settings.categorization_top_p_label')}</label>
                        {optNumField('categorizationTopP', 0, 1, localSettings, persistSettings, base, isPending)}
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelClass}>{t('ai_settings.categorization_top_k_label')}</label>
                        {optNumField('categorizationTopK', 1, 500, localSettings, persistSettings, base, isPending)}
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelClass}>{t('ai_settings.categorization_max_tokens_label')}</label>
                        {optNumField('categorizationMaxOutputTokens', 1, 65536, localSettings, persistSettings, base, isPending)}
                    </div>
                </div>
            </div>
        </CollapsibleCard>
    );
}
