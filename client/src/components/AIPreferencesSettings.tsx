import { useTranslation } from 'react-i18next';
import type { UserPersonaContext } from '@app/shared';
import { mergeUserPersonaContext, PERSONA_COMMUNICATION_OPTIONS, PERSONA_REPORTING_DEPTH_OPTIONS } from '@app/shared';
import { CollapsibleCard } from './CollapsibleCard';
import { useAISettings, useUpdateAISettings } from '../hooks/useScraper';

/**
 * Communication style and reporting depth (stored under userContext.aiPreferences).
 * Shown under Configuration → AI → AI Settings tab.
 */
export function AIPreferencesSettings() {
    const { t } = useTranslation();
    const { data: settings } = useAISettings();
    const { mutate: updateSettings, isPending } = useUpdateAISettings();
    const ap = settings?.userContext?.aiPreferences ?? {};

    const persist = (patch: Partial<NonNullable<UserPersonaContext['aiPreferences']>>) => {
        if (!settings) return;
        const uc = mergeUserPersonaContext(settings.userContext ?? {}, { aiPreferences: patch });
        updateSettings(
            { userContext: uc },
            {
                onError: (err: Error) => {
                    alert(t('common.save_failed_with_error', { error: err?.message || t('common.unknown_error') }));
                },
            }
        );
    };

    const label = 'text-xs font-bold text-slate-600 block mb-1';
    const select =
        'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white disabled:opacity-50';

    const opt = (prefix: string, keys: readonly string[]) =>
        keys.map((k) => (
            <option key={k} value={k}>
                {t(`${prefix}.${k}`)}
            </option>
        ));

    return (
        <CollapsibleCard
            title={t('ai_settings.ai_preferences_heading')}
            subtitle={t('ai_settings.ai_preferences_subtitle')}
            defaultOpen
            bodyClassName="px-6 pb-6 pt-0"
        >
            <div className="space-y-3">
                <div>
                    <label className={label}>{t('ai_settings.persona.communication_style')}</label>
                    <select
                        disabled={isPending}
                        className={select}
                        value={ap.communicationStyle ?? ''}
                        onChange={(e) => persist({ communicationStyle: e.target.value || undefined })}
                    >
                        <option value="">{t('ai_settings.persona.placeholder_select')}</option>
                        {opt('ai_settings.persona.options.communication', PERSONA_COMMUNICATION_OPTIONS)}
                    </select>
                </div>
                <div>
                    <label className={label}>{t('ai_settings.persona.reporting_depth')}</label>
                    <select
                        disabled={isPending}
                        className={select}
                        value={ap.reportingDepth ?? ''}
                        onChange={(e) => persist({ reportingDepth: e.target.value || undefined })}
                    >
                        <option value="">{t('ai_settings.persona.placeholder_select')}</option>
                        {opt('ai_settings.persona.options.depth', PERSONA_REPORTING_DEPTH_OPTIONS)}
                    </select>
                </div>
            </div>
        </CollapsibleCard>
    );
}
