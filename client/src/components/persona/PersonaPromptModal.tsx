import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { UserPersonaContext } from '@app/shared';
import {
    EMPTY_USER_PERSONA_CONTEXT,
    isUserPersonaEmpty,
    migrateLegacyPersonaFields,
    personaNeedsLegacyMigration,
    stripLegacyPersonaFieldsIfSuperseded
} from '@app/shared';
import { PersonaAlignmentForm } from './PersonaAlignmentForm';
import { useAISettings, useUpdateAISettings } from '../../hooks/useScraper';

const DISMISS_KEY = 'bank-scraper-persona-prompt-dismissed-v1';

export function isPersonaPromptDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        return false;
    }
}

export function dismissPersonaPrompt() {
    try {
        localStorage.setItem(DISMISS_KEY, '1');
    } catch {
        /* ignore */
    }
}

export interface PersonaPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenAiSettings: () => void;
}

export function PersonaPromptModal({ isOpen, onClose, onOpenAiSettings }: PersonaPromptModalProps) {
    const { t } = useTranslation();
    const { data: settings } = useAISettings();
    const { mutate: updateSettings, isPending } = useUpdateAISettings();
    const [draft, setDraft] = useState<UserPersonaContext>(EMPTY_USER_PERSONA_CONTEXT);

    useEffect(() => {
        if (!isOpen) return;
        const raw = settings?.userContext ?? EMPTY_USER_PERSONA_CONTEXT;
        const migrated = personaNeedsLegacyMigration(raw) ? migrateLegacyPersonaFields(raw) : raw;
        setDraft(migrated);
    }, [isOpen, settings]);

    useEffect(() => {
        if (isOpen && settings?.userContext && !isUserPersonaEmpty(settings.userContext)) {
            onClose();
        }
    }, [isOpen, settings, onClose]);

    if (!isOpen) return null;

    const handleSave = () => {
        const toSave = stripLegacyPersonaFieldsIfSuperseded(draft);
        updateSettings(
            { userContext: toSave },
            {
                onSuccess: () => {
                    dismissPersonaPrompt();
                    onClose();
                },
                onError: (err: Error) => {
                    alert(t('common.save_failed_with_error', { error: err?.message || t('common.unknown_error') }));
                }
            }
        );
    };

    const handleLater = () => {
        dismissPersonaPrompt();
        onClose();
    };

    const handleOpenAi = () => {
        onOpenAiSettings();
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="persona-prompt-title"
        >
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <h2 id="persona-prompt-title" className="text-lg font-black text-slate-900">
                        {t('onboarding.persona_prompt_title')}
                    </h2>
                    <button
                        type="button"
                        onClick={handleLater}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        aria-label={t('onboarding.persona_prompt_later')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-600 leading-relaxed">{t('onboarding.persona_prompt_body')}</p>
                    <PersonaAlignmentForm value={draft} onChange={setDraft} disabled={isPending} compact />
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end bg-slate-50/80 rounded-b-2xl">
                    <button
                        type="button"
                        onClick={handleLater}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                    >
                        {t('onboarding.persona_prompt_later')}
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenAi}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-indigo-600 hover:bg-indigo-50"
                    >
                        {t('onboarding.persona_prompt_open_ai')}
                    </button>
                    <button
                        type="button"
                        disabled={isPending}
                        onClick={handleSave}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {isPending ? t('common.saving') : t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}
