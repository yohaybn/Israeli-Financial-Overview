import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z, type ZodIssue } from 'zod';
import { ConfigSectionCard } from './ConfigSectionCard';

const llmProviderSchema = z.object({
    categorizationModel: z.string().min(1),
    chatModel: z.string().min(1),
    llmTemperature: z.coerce.number().min(0).max(2),
});

type LlmProviderFormValues = z.infer<typeof llmProviderSchema>;

interface LLMProviderCardProps {
    models?: string[];
    initialValues: {
        categorizationModel: string;
        chatModel: string;
        llmTemperature?: number | null;
    };
    disabled?: boolean;
    onSave: (values: LlmProviderFormValues) => void;
}

const selectClass =
    'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

export function LLMProviderCard({ models, initialValues, disabled, onSave }: LLMProviderCardProps) {
    const { t } = useTranslation();
    const safeModels = useMemo(() => {
        if (models?.length) return models;
        return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    }, [models]);

    const [form, setForm] = useState<LlmProviderFormValues>({
        categorizationModel: initialValues.categorizationModel || safeModels[0],
        chatModel: initialValues.chatModel || safeModels[0],
        llmTemperature: initialValues.llmTemperature ?? 1,
    });
    const validationResult = llmProviderSchema.safeParse(form);
    const isValid = validationResult.success;
    const isDirty =
        form.categorizationModel !== (initialValues.categorizationModel || safeModels[0]) ||
        form.chatModel !== (initialValues.chatModel || safeModels[0]) ||
        form.llmTemperature !== (initialValues.llmTemperature ?? 1);

    const issueToMessage = (issue: ZodIssue): string => {
        if (issue.path[0] === 'llmTemperature') {
            if (issue.code === 'too_small') return t('config_validation.min_value', { min: 0 });
            if (issue.code === 'too_big') return t('config_validation.max_value', { max: 2 });
        }
        return t('config_validation.required');
    };

    const fieldErrors: Partial<Record<keyof LlmProviderFormValues, string>> = {};
    if (!validationResult.success) {
        for (const issue of validationResult.error.issues) {
            const key = issue.path[0] as keyof LlmProviderFormValues;
            if (!fieldErrors[key]) fieldErrors[key] = issueToMessage(issue);
        }
    }

    return (
        <ConfigSectionCard title={t('ai_settings.models_heading')} subtitle={t('ai_settings.models_subtitle')}>
            <form
                className="space-y-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!isValid) return;
                    onSave(form);
                }}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('ai_settings.categorization_model')}
                        </label>
                        <select
                            value={form.categorizationModel}
                            onChange={(e) => setForm((prev) => ({ ...prev, categorizationModel: e.target.value }))}
                            className={selectClass}
                            disabled={disabled}
                        >
                            {safeModels.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                        {fieldErrors.categorizationModel && <p className="text-rose-500 text-xs">{fieldErrors.categorizationModel}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('ai_settings.analyst_model')}
                        </label>
                        <select
                            value={form.chatModel}
                            onChange={(e) => setForm((prev) => ({ ...prev, chatModel: e.target.value }))}
                            className={selectClass}
                            disabled={disabled}
                        >
                            {safeModels.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                        {fieldErrors.chatModel && <p className="text-rose-500 text-xs">{fieldErrors.chatModel}</p>}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('ai_settings.analytics_temperature_label')}
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={2}
                        step="0.1"
                        disabled={disabled}
                        value={form.llmTemperature}
                        onChange={(e) =>
                            setForm((prev) => ({
                                ...prev,
                                llmTemperature: e.target.value === '' ? 0 : Number(e.target.value),
                            }))
                        }
                        className={selectClass}
                    />
                    {fieldErrors.llmTemperature && <p className="text-rose-500 text-xs">{fieldErrors.llmTemperature}</p>}
                </div>
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={disabled || !isDirty || !isValid}
                        className="bg-blue-600 text-white rounded-md hover:bg-blue-700 px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {t('common.save')}
                    </button>
                </div>
            </form>
        </ConfigSectionCard>
    );
}
