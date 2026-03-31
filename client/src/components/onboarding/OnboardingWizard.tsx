import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CheckCircle2,
    KeyRound,
    Lock,
    MessageCircle,
    Sparkles,
    X
} from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useAppLockStatus, useSetupAppLock } from '../../hooks/useAppLock';
import { useUpdateEnvConfig, useRestartServer } from '../../hooks/useConfig';
import { getApiRoot } from '../../lib/api';
import { markPersonaSetupPendingAfterRestart } from '../../utils/personaSetupWizardStorage';
import type { OnboardingStepId } from '../../hooks/useOnboardingState';

export function OnboardingWizard() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { stepId, setStepId, complete, continueLater } = useOnboarding();

    const { data: lockStatus } = useAppLockStatus();
    const { mutate: setupLock, isPending: isSettingUpLock, error: setupLockError } = useSetupAppLock();
    const { mutate: updateEnv, isPending: isSavingEnv } = useUpdateEnvConfig();
    const { mutate: restartServer, isPending: isRestarting } = useRestartServer();

    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [telegramToken, setTelegramToken] = useState('');
    const [envDirty, setEnvDirty] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSavingTelegram, setIsSavingTelegram] = useState(false);

    const { data: telegramConfig } = useQuery({
        queryKey: ['telegramConfig', 'onboarding'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/telegram/config`);
            const data = await res.json();
            return data.data as { botToken?: string } | undefined;
        },
        enabled: stepId === 'telegram'
    });

    const flow: OnboardingStepId[] = ['welcome', 'lock', 'gemini', 'telegram', 'done'];

    useEffect(() => {
        const tok = telegramConfig?.botToken;
        if (tok && !tok.startsWith('***')) {
            setTelegramToken(tok);
        }
    }, [telegramConfig]);

    const progressLabel = `${Math.max(1, flow.indexOf(stepId) + 1)} / ${flow.length}`;

    const handleContinueLater = () => {
        continueLater();
    };

    const skipEntireSetup = () => {
        complete();
    };

    const handleTelegramStepContinue = async () => {
        setSaveError(null);
        const trimmed = telegramToken.trim();
        if (!trimmed || trimmed.includes('***')) {
            setStepId('done');
            return;
        }
        setIsSavingTelegram(true);
        try {
            const res = await fetch(`${getApiRoot()}/telegram/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botToken: trimmed })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('onboarding.save_failed'));
            setStepId('done');
        } catch (e: unknown) {
            setSaveError(e instanceof Error ? e.message : t('onboarding.save_failed'));
        } finally {
            setIsSavingTelegram(false);
        }
    };

    const applyGeminiAndAdvance = () => {
        setSaveError(null);
        const trimmed = geminiKey.trim();
        if (trimmed && !trimmed.includes('***')) {
            updateEnv(
                { GEMINI_API_KEY: trimmed },
                {
                    onSuccess: async () => {
                        await queryClient.refetchQueries({ queryKey: ['env-config'] });
                        setEnvDirty(true);
                        setStepId('telegram');
                        window.setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('toggle-help-widget', { detail: { open: true } }));
                        }, 0);
                    },
                    onError: (e: unknown) => {
                        setSaveError(e instanceof Error ? e.message : t('onboarding.save_failed'));
                    }
                }
            );
            return;
        }
        if (trimmed.includes('***')) {
            setStepId('telegram');
            return;
        }
        setStepId('telegram');
    };

    const handleSetupLock = (e: React.FormEvent) => {
        e.preventDefault();
        if (pw.length < 8 || pw !== pw2) return;
        setupLock(pw, {
            onSuccess: () => {
                setPw('');
                setPw2('');
                setStepId('gemini');
            }
        });
    };

    const goBack = () => {
        setSaveError(null);
        switch (stepId) {
            case 'lock':
                setStepId('welcome');
                break;
            case 'gemini':
                setStepId('lock');
                break;
            case 'telegram':
                setStepId('gemini');
                break;
            case 'done':
                setStepId('telegram');
                break;
            default:
                break;
        }
    };

    const stepTitle = (id: OnboardingStepId) => {
        const keys: Record<OnboardingStepId, string> = {
            welcome: 'onboarding.steps.welcome_title',
            lock: 'onboarding.steps.lock_title',
            telegram: 'onboarding.steps.telegram_title',
            gemini: 'onboarding.steps.gemini_title',
            done: 'onboarding.steps.done_title'
        };
        return t(keys[id]);
    };

    const stepBody = (id: OnboardingStepId) => {
        const keys: Partial<Record<OnboardingStepId, string>> = {
            welcome: 'onboarding.steps.step_0_body',
            lock: 'onboarding.steps.step_1_body',
            gemini: 'onboarding.steps.step_3_body',
            telegram: 'onboarding.steps.step_2_body',
            done: 'onboarding.steps.step_6_body'
        };
        const k = keys[id];
        return k ? t(k) : '';
    };

    const iconForStep = (id: OnboardingStepId) => {
        switch (id) {
            case 'welcome':
                return <Sparkles className="w-6 h-6" />;
            case 'lock':
                return <Lock className="w-6 h-6" />;
            case 'gemini':
                return <KeyRound className="w-6 h-6" />;
            case 'telegram':
                return <MessageCircle className="w-6 h-6" />;
            case 'done':
                return <CheckCircle2 className="w-6 h-6" />;
            default:
                return <Sparkles className="w-6 h-6" />;
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
        >
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
                            {t('onboarding.badge')}
                        </span>
                        <span className="text-xs font-bold text-slate-500 truncate">{progressLabel}</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleContinueLater}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        title={t('onboarding.continue_later')}
                        aria-label={t('onboarding.continue_later')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">{iconForStep(stepId)}</div>
                        <div className="min-w-0 flex-1">
                            <h2 id="onboarding-title" className="text-xl font-black text-slate-900 leading-tight">
                                {stepTitle(stepId)}
                            </h2>
                            <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">{stepBody(stepId)}</p>
                        </div>
                    </div>

                    {saveError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{saveError}</div>
                    )}

                    {stepId === 'welcome' && (
                        <div className="space-y-4">
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 flex gap-2 text-sm text-slate-600">
                                <BookOpen className="w-5 h-5 shrink-0 text-slate-400" />
                                <p>{t('onboarding.steps.welcome_tip')}</p>
                            </div>
                        </div>
                    )}

                    {stepId === 'telegram' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-600 block">{t('onboarding.telegram_token_label')}</label>
                                <input
                                    type="password"
                                    value={telegramToken}
                                    onChange={(e) => setTelegramToken(e.target.value)}
                                    placeholder={t('onboarding.telegram_token_placeholder')}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono"
                                    autoComplete="off"
                                />
                                <a
                                    href="https://t.me/BotFather"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex text-sm font-bold text-indigo-600 hover:underline"
                                >
                                    {t('onboarding.open_botfather')}
                                </a>
                            </div>
                        </div>
                    )}

                    {stepId === 'lock' && (
                        <div className="space-y-4">
                            {lockStatus?.lockConfigured ? (
                                <p className="text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                                    {t('onboarding.lock_already_configured')}
                                </p>
                            ) : (
                                <form onSubmit={handleSetupLock} className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 block mb-1">{t('onboarding.lock_password')}</label>
                                        <input
                                            type="password"
                                            value={pw}
                                            onChange={(e) => setPw(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm"
                                            minLength={8}
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 block mb-1">{t('onboarding.lock_confirm')}</label>
                                        <input
                                            type="password"
                                            value={pw2}
                                            onChange={(e) => setPw2(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm"
                                            minLength={8}
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    {setupLockError && (
                                        <p className="text-xs text-red-600">
                                            {(setupLockError as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                                                t('onboarding.save_failed')}
                                        </p>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={isSettingUpLock || pw.length < 8 || pw !== pw2}
                                        className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50"
                                    >
                                        {isSettingUpLock ? t('common.loading') : t('onboarding.save_and_continue')}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {stepId === 'gemini' && (
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-600 block">{t('onboarding.gemini_label')}</label>
                            <input
                                type="password"
                                value={geminiKey}
                                onChange={(e) => setGeminiKey(e.target.value)}
                                placeholder={t('onboarding.gemini_placeholder')}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono"
                                autoComplete="off"
                            />
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex text-sm font-bold text-indigo-600 hover:underline"
                            >
                                {t('onboarding.open_ai_studio')}
                            </a>
                            <p className="text-[11px] text-slate-600 leading-snug rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2">
                                {t('onboarding.gemini_assistant_after_save')}
                            </p>
                        </div>
                    )}

                    {stepId === 'done' && (
                        <div className="space-y-4">
                            <ul className="text-sm text-slate-700 space-y-2 list-disc list-inside">
                                <li>{t('onboarding.done_next_scrape')}</li>
                                <li>{t('onboarding.done_next_config')}</li>
                                <li>{t('onboarding.done_next_telegram')}</li>
                            </ul>
                            {envDirty && (
                                <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-950 space-y-2">
                                    <p className="font-bold">{t('onboarding.restart_after_setup_title')}</p>
                                    <p className="text-xs leading-relaxed text-amber-950/95">{t('onboarding.restart_after_setup_body')}</p>
                                    <button
                                        type="button"
                                        disabled={isRestarting}
                                        onClick={() =>
                                            restartServer(undefined, {
                                                onSuccess: () => {
                                                    markPersonaSetupPendingAfterRestart();
                                                    window.alert(t('env.restart_in_progress'));
                                                },
                                                onError: (err: unknown) => {
                                                    window.alert(
                                                        t('env.restart_failed', {
                                                            error:
                                                                err instanceof Error ? err.message : t('common.unknown_error')
                                                        })
                                                    );
                                                }
                                            })
                                        }
                                        className="mt-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-black hover:bg-amber-700 disabled:opacity-50"
                                    >
                                        {isRestarting ? t('common.loading') : t('env.restart_server')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center gap-2 justify-between bg-slate-50/80 rounded-b-2xl shrink-0">
                    <div className="flex gap-2">
                        {stepId !== 'welcome' && (
                            <button
                                type="button"
                                onClick={goBack}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-white"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                {t('onboarding.back')}
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                        {stepId === 'welcome' && (
                            <>
                                <button
                                    type="button"
                                    onClick={skipEntireSetup}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_all')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStepId('lock')}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700"
                                >
                                    {t('onboarding.get_started')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {stepId === 'lock' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setStepId('gemini')}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                {lockStatus?.lockConfigured ? (
                                    <button
                                        type="button"
                                        onClick={() => setStepId('gemini')}
                                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black"
                                    >
                                        {t('onboarding.next')}
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                ) : null}
                            </>
                        )}
                        {stepId === 'telegram' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setStepId('done')}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSavingTelegram}
                                    onClick={() => void handleTelegramStepContinue()}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {isSavingTelegram ? t('common.loading') : t('onboarding.next')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {stepId === 'gemini' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setStepId('telegram')}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSavingEnv}
                                    onClick={applyGeminiAndAdvance}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50"
                                >
                                    {isSavingEnv ? t('common.loading') : t('onboarding.next')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {stepId === 'done' && (
                            <button
                                type="button"
                                onClick={complete}
                                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                {t('onboarding.finish')}
                            </button>
                        )}
                    </div>
                </div>

                <p className="px-6 pb-4 text-center text-[11px] text-slate-400">{t('onboarding.footer_hint')}</p>
            </div>
        </div>
    );
}
