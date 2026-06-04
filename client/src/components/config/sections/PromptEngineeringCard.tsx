import { useTranslation } from 'react-i18next';
import { ConfigSectionCard } from './ConfigSectionCard';

interface PromptEngineeringCardProps {
    systemPrompt: string;
    analyticsPromptExtra: string;
    disabled?: boolean;
    onSystemPromptChange: (value: string) => void;
    onAnalyticsPromptExtraChange: (value: string) => void;
}

const textAreaClass =
    'font-mono text-sm bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500 p-3 rounded-md w-full min-h-[96px] outline-none';

export function PromptEngineeringCard({
    systemPrompt,
    analyticsPromptExtra,
    disabled,
    onSystemPromptChange,
    onAnalyticsPromptExtraChange,
}: PromptEngineeringCardProps) {
    const { t } = useTranslation();

    return (
        <ConfigSectionCard title={t('ai_settings.advanced_prompts_section')} subtitle={t('ai_settings.advanced_subtitle')}>
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('ai_settings.analytics_system_extra_label')}
                    </label>
                    <textarea
                        disabled={disabled}
                        value={systemPrompt}
                        onChange={(e) => onSystemPromptChange(e.target.value)}
                        className={textAreaClass}
                        placeholder={t('ai_settings.analytics_system_extra_placeholder')}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('ai_settings.analytics_prompt_extra_label')}
                    </label>
                    <textarea
                        disabled={disabled}
                        value={analyticsPromptExtra}
                        onChange={(e) => onAnalyticsPromptExtraChange(e.target.value)}
                        className={textAreaClass}
                        placeholder={t('ai_settings.analytics_prompt_extra_placeholder')}
                    />
                </div>
            </div>
        </ConfigSectionCard>
    );
}
