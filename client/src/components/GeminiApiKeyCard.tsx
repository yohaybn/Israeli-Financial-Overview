import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isUserPersonaEmpty } from '@app/shared';
import { useEnvConfig, useUpdateEnvConfig, useRestartServer } from '../hooks/useConfig';
import { useAISettings } from '../hooks/useScraper';
import { isDemoMode } from '../demo/isDemo';
import { isGeminiApiKeyConfigured } from '../utils/geminiKeyConfigured';
import { CollapsibleCard } from './CollapsibleCard';

/**
 * Gemini API key editor (runtime env). Shown under Configuration → AI.
 */
export function GeminiApiKeyCard() {
    const { t } = useTranslation();
    const { data: env, isLoading } = useEnvConfig();
    const { data: aiSettings } = useAISettings();
    const { mutate: updateEnv, isPending: isUpdating } = useUpdateEnvConfig();
    const { mutate: restartServer, isPending: isRestarting } = useRestartServer();

    const [value, setValue] = useState('');

    useEffect(() => {
        if (env) setValue(env.GEMINI_API_KEY || '');
    }, [env]);

    const save = () => {
        if (!env) return;
        const wasEmpty = !isGeminiApiKeyConfigured(env.GEMINI_API_KEY);
        const nextTrimmed = value.trim();
        const willHaveKey = isGeminiApiKeyConfigured(nextTrimmed);
        updateEnv(
            { ...env, GEMINI_API_KEY: value },
            {
                onSuccess: () => {
                    if (
                        !isDemoMode() &&
                        wasEmpty &&
                        willHaveKey &&
                        isUserPersonaEmpty(aiSettings?.userContext)
                    ) {
                        window.dispatchEvent(new CustomEvent('gemini-api-key-first-configured'));
                    }
                    if (window.confirm(t('env.confirm_restart_after_save'))) {
                        restartServer(undefined, {
                            onSuccess: () => alert(t('env.restart_in_progress')),
                            onError: (err: any) =>
                                alert(t('env.restart_failed', { error: err.message || t('common.unknown_error') })),
                        });
                    }
                },
                onError: (err: any) => {
                    alert(t('env.save_failed', { error: err.message || t('common.unknown_error') }));
                },
            }
        );
    };

    if (isLoading) {
        return (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 text-sm text-gray-500">{t('common.loading')}</div>
        );
    }

    return (
        <CollapsibleCard
            title={t('env.fields.gemini_api_key.label')}
            subtitle={t('gemini_card.subtitle')}
            defaultOpen
            bodyClassName="px-6 pb-6 pt-0 space-y-3"
        >
            <input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm transition-all focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder={t('env.enter_value', { key: 'GEMINI_API_KEY' })}
                autoComplete="off"
            />
            <p className="text-[11px] text-gray-400 leading-tight">
                {t('env.fields.gemini_api_key.help')}{' '}
                <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline font-medium"
                >
                    {t('env.links.google_ai_studio')}
                </a>
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{t('env.restart_required_hint')}</p>
            <div className="flex flex-wrap gap-2 justify-end pt-1">
                <button
                    type="button"
                    onClick={() => restartServer(undefined, {
                        onSuccess: () => alert(t('env.restart_in_progress')),
                        onError: (err: any) =>
                            alert(t('env.restart_failed', { error: err.message || t('common.unknown_error') })),
                    })}
                    disabled={isRestarting}
                    className="px-4 py-2 bg-amber-100 text-amber-800 rounded-xl text-sm font-bold hover:bg-amber-200 disabled:opacity-50"
                >
                    {isRestarting ? t('env.restarting') : t('env.restart_server')}
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={isUpdating}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isUpdating ? t('common.saving') : t('env.save_settings')}
                </button>
            </div>
        </CollapsibleCard>
    );
}
