import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserPersonaContext } from '@app/shared';
import {
    EMPTY_USER_PERSONA_CONTEXT,
    migrateLegacyPersonaFields,
    personaNeedsLegacyMigration,
    stripLegacyPersonaFieldsIfSuperseded
} from '@app/shared';
import { CollapsibleCard } from '../CollapsibleCard';
import { PersonaAlignmentForm } from './PersonaAlignmentForm';
import { useAISettings, useUpdateAISettings } from '../../hooks/useScraper';

export function PersonaAlignmentSettings() {
    const { t } = useTranslation();
    const { data: settings } = useAISettings();
    const { mutate: updateSettings, isPending } = useUpdateAISettings();
    const [local, setLocal] = useState<UserPersonaContext>(EMPTY_USER_PERSONA_CONTEXT);

    const injectEnabled = settings?.personaInjectionEnabled !== false;
    const formDisabled = isPending || !injectEnabled;

    useEffect(() => {
        if (!settings) return;
        const raw = settings.userContext ?? EMPTY_USER_PERSONA_CONTEXT;
        const migrated = personaNeedsLegacyMigration(raw) ? migrateLegacyPersonaFields(raw) : raw;
        setLocal(migrated);
    }, [settings]);

    const persist = (next: UserPersonaContext) => {
        const toSave = stripLegacyPersonaFieldsIfSuperseded(next);
        setLocal(toSave);
        updateSettings(
            { userContext: toSave },
            {
                onError: (err: Error) => {
                    alert(t('common.save_failed_with_error', { error: err?.message || t('common.unknown_error') }));
                }
            }
        );
    };

    const setInjectionEnabled = (enabled: boolean) => {
        updateSettings(
            { personaInjectionEnabled: enabled },
            {
                onError: (err: Error) => {
                    alert(t('common.save_failed_with_error', { error: err?.message || t('common.unknown_error') }));
                }
            }
        );
    };

    const personaHeaderToggle = (
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 max-w-[min(100%,11rem)] sm:max-w-[min(100%,20rem)]">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-700 text-start leading-snug line-clamp-2">
                {t('ai_settings.persona.include_in_prompts')}
            </span>
            <button
                type="button"
                role="switch"
                aria-checked={injectEnabled}
                aria-label={t('ai_settings.persona.include_in_prompts')}
                disabled={isPending}
                dir="ltr"
                onClick={() => setInjectionEnabled(!injectEnabled)}
                className={`relative inline-flex h-8 w-[3.75rem] shrink-0 items-center justify-start rounded-full transition-colors ${
                    injectEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                } disabled:opacity-50`}
            >
                <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                        injectEnabled ? 'translate-x-9' : 'translate-x-1'
                    }`}
                />
            </button>
        </div>
    );

    return (
        <CollapsibleCard
            title={t('ai_settings.persona.card_title')}
            subtitle={t('ai_settings.persona.card_subtitle')}
            headerExtra={personaHeaderToggle}
            defaultOpen={false}
            bodyClassName="px-6 pb-6 pt-0"
        >
            <p className="text-xs text-slate-500 mb-4 leading-snug">{t('ai_settings.persona.include_in_prompts_help')}</p>
            <div
                className={`transition-[opacity,filter] duration-200 ${
                    injectEnabled ? 'opacity-100' : 'opacity-45 pointer-events-none grayscale'
                }`}
            >
                <PersonaAlignmentForm value={local} onChange={persist} disabled={formDisabled} />
            </div>
        </CollapsibleCard>
    );
}
