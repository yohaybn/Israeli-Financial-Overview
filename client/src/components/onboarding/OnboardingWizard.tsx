import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CheckCircle2,
    KeyRound,
    Lock,
    Sparkles,
    Cloud,
    FolderOpen,
    X
} from 'lucide-react';
import { ONBOARDING_STEP_COUNT } from '../../hooks/useOnboardingState';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useAppLockStatus, useSetupAppLock } from '../../hooks/useAppLock';
import { useEnvConfig, useUpdateEnvConfig, useRestartServer } from '../../hooks/useConfig';

export function OnboardingWizard() {
    const { t } = useTranslation();
    const {
        step,
        nextStep,
        prevStep,
        complete,
        setStep,
        continueLater
    } = useOnboarding();

    const { data: lockStatus } = useAppLockStatus();
    const { mutate: setupLock, isPending: isSettingUpLock, error: setupLockError } = useSetupAppLock();
    const { data: envConfig, isLoading: envLoading } = useEnvConfig();
    const { mutate: updateEnv, isPending: isSavingEnv } = useUpdateEnvConfig();
    const { mutate: restartServer, isPending: isRestarting } = useRestartServer();

    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [googleId, setGoogleId] = useState('');
    const [googleSecret, setGoogleSecret] = useState('');
    const [redirectUri, setRedirectUri] = useState('');
    const [driveFolder, setDriveFolder] = useState('');
    const [envDirty, setEnvDirty] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (!envConfig || envLoading) return;
        setGoogleId(envConfig.GOOGLE_CLIENT_ID || '');
        setGoogleSecret('');
        if (envConfig.GOOGLE_REDIRECT_URI) {
            setRedirectUri(envConfig.GOOGLE_REDIRECT_URI);
        }
        setDriveFolder(envConfig.DRIVE_FOLDER_ID || '');
    }, [envConfig, envLoading]);

    useEffect(() => {
        if (step === 3 && !redirectUri) {
            setRedirectUri(`${window.location.origin}/api/auth/google/callback`);
        }
    }, [step, redirectUri]);

    const defaultRedirect = `${window.location.origin}/api/auth/google/callback`;

    const skipEntireSetup = () => {
        complete();
    };

    const handleContinueLater = () => {
        continueLater();
    };

    const applyGeminiAndAdvance = () => {
        setSaveError(null);
        const trimmed = geminiKey.trim();
        if (!trimmed) {
            nextStep();
            return;
        }
        if (trimmed.includes('***')) {
            nextStep();
            return;
        }
        updateEnv(
            { GEMINI_API_KEY: trimmed },
            {
                onSuccess: () => {
                    setEnvDirty(true);
                    nextStep();
                },
                onError: (e: unknown) => {
                    setSaveError(e instanceof Error ? e.message : t('onboarding.save_failed'));
                }
            }
        );
    };

    const applyGoogleAndAdvance = () => {
        setSaveError(null);
        const updates: Record<string, string> = {};
        if (googleId.trim()) updates.GOOGLE_CLIENT_ID = googleId.trim();
        if (googleSecret.trim() && !googleSecret.includes('***')) {
            updates.GOOGLE_CLIENT_SECRET = googleSecret.trim();
        }
        const r = (redirectUri || defaultRedirect).trim();
        if (r) updates.GOOGLE_REDIRECT_URI = r;

        if (Object.keys(updates).length === 0) {
            nextStep();
            return;
        }
        updateEnv(updates, {
            onSuccess: () => {
                setEnvDirty(true);
                nextStep();
            },
            onError: (e: unknown) => {
                setSaveError(e instanceof Error ? e.message : t('onboarding.save_failed'));
            }
        });
    };

    const applyDriveAndAdvance = () => {
        setSaveError(null);
        const trimmed = driveFolder.trim();
        if (!trimmed) {
            nextStep();
            return;
        }
        updateEnv(
            { DRIVE_FOLDER_ID: trimmed },
            {
                onSuccess: () => {
                    setEnvDirty(true);
                    nextStep();
                },
                onError: (e: unknown) => {
                    setSaveError(e instanceof Error ? e.message : t('onboarding.save_failed'));
                }
            }
        );
    };

    const handleSetupLock = (e: React.FormEvent) => {
        e.preventDefault();
        if (pw.length < 8 || pw !== pw2) return;
        setupLock(pw, {
            onSuccess: () => {
                setPw('');
                setPw2('');
                nextStep();
            }
        });
    };

    const stepTitle = (s: number) => {
        const keys = [
            'onboarding.steps.welcome_title',
            'onboarding.steps.lock_title',
            'onboarding.steps.gemini_title',
            'onboarding.steps.google_title',
            'onboarding.steps.drive_title',
            'onboarding.steps.done_title'
        ];
        return t(keys[s] || keys[0]);
    };

    const progressLabel = `${Math.min(step + 1, ONBOARDING_STEP_COUNT)} / ${ONBOARDING_STEP_COUNT}`;

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
                        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                            {step === 0 && <Sparkles className="w-6 h-6" />}
                            {step === 1 && <Lock className="w-6 h-6" />}
                            {step === 2 && <KeyRound className="w-6 h-6" />}
                            {step === 3 && <Cloud className="w-6 h-6" />}
                            {step === 4 && <FolderOpen className="w-6 h-6" />}
                            {step === 5 && <CheckCircle2 className="w-6 h-6" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 id="onboarding-title" className="text-xl font-black text-slate-900 leading-tight">
                                {stepTitle(step)}
                            </h2>
                            <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">
                                {t(`onboarding.steps.step_${step}_body`)}
                            </p>
                        </div>
                    </div>

                    {saveError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                            {saveError}
                        </div>
                    )}

                    {step === 0 && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 flex gap-2 text-sm text-slate-600">
                            <BookOpen className="w-5 h-5 shrink-0 text-slate-400" />
                            <p>{t('onboarding.steps.welcome_tip')}</p>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-4">
                            {lockStatus?.lockConfigured ? (
                                <p className="text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                                    {t('onboarding.lock_already_configured')}
                                </p>
                            ) : (
                                <form onSubmit={handleSetupLock} className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 block mb-1">
                                            {t('onboarding.lock_password')}
                                        </label>
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
                                        <label className="text-xs font-bold text-slate-600 block mb-1">
                                            {t('onboarding.lock_confirm')}
                                        </label>
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
                                            {(setupLockError as { response?: { data?: { error?: string } } })?.response?.data
                                                ?.error || t('onboarding.save_failed')}
                                        </p>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={
                                            isSettingUpLock || pw.length < 8 || pw !== pw2
                                        }
                                        className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50"
                                    >
                                        {isSettingUpLock ? t('common.loading') : t('onboarding.save_and_continue')}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-600 block">
                                {t('onboarding.gemini_label')}
                            </label>
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
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">
                                    {t('onboarding.google_client_id')}
                                </label>
                                <input
                                    value={googleId}
                                    onChange={(e) => setGoogleId(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">
                                    {t('onboarding.google_client_secret')}
                                </label>
                                <input
                                    type="password"
                                    value={googleSecret}
                                    onChange={(e) => setGoogleSecret(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm"
                                    placeholder={t('onboarding.leave_blank_unchanged')}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">
                                    {t('onboarding.redirect_uri')}
                                </label>
                                <input
                                    value={redirectUri || defaultRedirect}
                                    onChange={(e) => setRedirectUri(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-mono"
                                />
                            </div>
                            <a
                                href="https://console.cloud.google.com/apis/credentials"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex text-sm font-bold text-indigo-600 hover:underline"
                            >
                                {t('onboarding.open_google_console')}
                            </a>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-600 block">
                                {t('onboarding.drive_folder_label')}
                            </label>
                            <input
                                value={driveFolder}
                                onChange={(e) => setDriveFolder(e.target.value)}
                                placeholder={t('onboarding.drive_folder_placeholder')}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm"
                            />
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-4">
                            <ul className="text-sm text-slate-700 space-y-2 list-disc list-inside">
                                <li>{t('onboarding.done_next_scrape')}</li>
                                <li>{t('onboarding.done_next_config')}</li>
                                <li>{t('onboarding.done_next_telegram')}</li>
                            </ul>
                            {envDirty && (
                                <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-950">
                                    <p className="font-bold">{t('onboarding.restart_recommended')}</p>
                                    <button
                                        type="button"
                                        disabled={isRestarting}
                                        onClick={() =>
                                            restartServer(undefined, {
                                                onSuccess: () => {
                                                    window.alert(t('env.restart_in_progress'));
                                                },
                                                onError: (err: unknown) => {
                                                    window.alert(
                                                        t('env.restart_failed', {
                                                            error:
                                                                err instanceof Error
                                                                    ? err.message
                                                                    : t('common.unknown_error')
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
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={prevStep}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-white"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                {t('onboarding.back')}
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                        {step === 0 && (
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
                                    onClick={() => setStep(1)}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700"
                                >
                                    {t('onboarding.get_started')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {step === 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => nextStep()}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                {lockStatus?.lockConfigured ? (
                                    <button
                                        type="button"
                                        onClick={() => nextStep()}
                                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black"
                                    >
                                        {t('onboarding.next')}
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                ) : null}
                            </>
                        )}
                        {step === 2 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => nextStep()}
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
                        {step === 3 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => nextStep()}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSavingEnv}
                                    onClick={applyGoogleAndAdvance}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50"
                                >
                                    {isSavingEnv ? t('common.loading') : t('onboarding.next')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {step === 4 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => nextStep()}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSavingEnv}
                                    onClick={applyDriveAndAdvance}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50"
                                >
                                    {isSavingEnv ? t('common.loading') : t('onboarding.next')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {step === 5 && (
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

                <p className="px-6 pb-4 text-center text-[11px] text-slate-400">
                    {t('onboarding.footer_hint')}
                </p>
            </div>
        </div>
    );
}
