import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigSectionCard } from './ConfigSectionCard';

interface LLMProviderCardProps {
    models?: string[];
    values: {
        categorizationModel: string;
        chatModel: string;
        llmTemperature: number;
    };
    errors?: Partial<Record<'categorizationModel' | 'chatModel' | 'llmTemperature', string>>;
    isAdvancedOpen: boolean;
    onAdvancedToggle: () => void;
    disabled?: boolean;
    onChange: (patch: Partial<LLMProviderCardProps['values']>) => void;
}

const selectClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100';

export function LLMProviderCard({
    models,
    values,
    errors,
    isAdvancedOpen,
    onAdvancedToggle,
    disabled,
    onChange,
}: LLMProviderCardProps) {
    const { t } = useTranslation();
    const safeModels = useMemo(() => {
        if (models?.length) return models;
        return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    }, [models]);

    return (
        <ConfigSectionCard title={t('ai_settings.models_heading')} subtitle={t('ai_settings.models_subtitle')}>
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('ai_settings.categorization_model')}
                        </label>
                        <select
                            value={values.categorizationModel}
                            onChange={(e) => onChange({ categorizationModel: e.target.value })}
                            className={selectClass}
                            disabled={disabled}
                        >
                            {safeModels.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                        {errors?.categorizationModel && (
                            <p className="text-rose-500 text-xs mt-1">{errors.categorizationModel}</p>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('ai_settings.analyst_model')}
                        </label>
                        <select
                            value={values.chatModel}
                            onChange={(e) => onChange({ chatModel: e.target.value })}
                            className={selectClass}
                            disabled={disabled}
                        >
                            {safeModels.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                        {errors?.chatModel && <p className="text-rose-500 text-xs mt-1">{errors.chatModel}</p>}
                    </div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200/70">
                    <button
                        type="button"
                        onClick={onAdvancedToggle}
                        className="w-full px-4 py-3 text-sm text-slate-700 font-semibold text-left"
                    >
                        {t('config_sidebar.show_advanced')}
                    </button>
                    {isAdvancedOpen && (
                        <div className="px-4 pb-4 space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('ai_settings.analytics_temperature_label')}
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={2}
                                step="0.1"
                                disabled={disabled}
                                value={values.llmTemperature}
                                onChange={(e) => onChange({ llmTemperature: e.target.value === '' ? 0 : Number(e.target.value) })}
                                className={selectClass}
                            />
                            {errors?.llmTemperature && <p className="text-rose-500 text-xs mt-1">{errors.llmTemperature}</p>}
                        </div>
                    )}
                </div>
            </div>
        </ConfigSectionCard>
    );
}
