import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CheckCircle2,
    FileText,
    KeyRound,
    Lock,
    MessageCircle,
    Sparkles,
    Cloud,
    FolderOpen,
    X,
    Users
} from 'lucide-react';
import type { UserPersonaContext } from '@app/shared';
import {
    EMPTY_USER_PERSONA_CONTEXT,
    mergeUserPersonaContext,
    migrateLegacyPersonaFields,
    personaNeedsLegacyMigration,
    stripLegacyPersonaFieldsIfSuperseded
} from '@app/shared';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useAppLockStatus, useSetupAppLock } from '../../hooks/useAppLock';
import { useEnvConfig, useUpdateEnvConfig, useRestartServer } from '../../hooks/useConfig';
import { useAISettings, useUpdateAISettings } from '../../hooks/useScraper';
import { getApiRoot, getGoogleOAuthCallbackUrl } from '../../lib/api';
import { isGeminiApiKeyConfigured } from '../../utils/geminiKeyConfigured';
import type { OnboardingStepId } from '../../hooks/useOnboardingState';
import { PersonaAlignmentForm } from '../persona/PersonaAlignmentForm';

export function OnboardingWizard() {
    const { t } = useTranslation();
    const { stepId, setStepId, complete, continueLater } = useOnboarding();

    const { data: lockStatus } = useAppLockStatus();
    const { mutate: setupLock, isPending: isSettingUpLock, error: setupLockError } = useSetupAppLock();
    const { data: envConfig, isLoading: envLoading } = useEnvConfig();
    const { mutate: updateEnv, isPending: isSavingEnv } = useUpdateEnvConfig();
    const { mutate: restartServer, isPending: isRestarting } = useRestartServer();
    const { data: aiSettings } = useAISettings();
    const { mutate: updateAISettings, isPending: isSavingPersona } = useUpdateAISettings();

    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [googleId, setGoogleId] = useState('');
    const [googleSecret, setGoogleSecret] = useState('');
    const [redirectUri, setRedirectUri] = useState('');
    const [driveFolder, setDriveFolder] = useState('');
    const [telegramToken, setTelegramToken] = useState('');
    const [envDirty, setEnvDirty] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSavingTelegram, setIsSavingTelegram] = useState(false);
    const [personaDraft, setPersonaDraft] = useState<UserPersonaContext>(EMPTY_USER_PERSONA_CONTEXT);
    const [personaNarrative, setPersonaNarrative] = useState('');
    const [extractedFacts, setExtractedFacts] = useState<string[]>([]);
    const [extractLoading, setExtractLoading] = useState(false);
    /** Avoid jumping away from the persona step before env refetch shows the new Gemini key. */
    const personaStepAfterNewKeyRef = useRef(false);
    const prevOnboardingStepRef = useRef<OnboardingStepId | null>(null);
    const personaAboutHydratedRef = useRef(false);

    const { data: telegramConfig } = useQuery({
        queryKey: ['telegramConfig', 'onboarding'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/telegram/config`);
            const data = await res.json();
            return data.data as { botToken?: string } | undefined;
        },
        enabled: stepId === 'telegram'
    });

    const showPersonaStep = isGeminiApiKeyConfigured(envConfig?.GEMINI_API_KEY);

    const showDriveStep = useMemo(() => {
        const fromEnv = envConfig?.GOOGLE_CLIENT_ID?.trim() || '';
        const fromForm = googleId.trim();
        return Boolean(fromEnv || fromForm);
    }, [envConfig?.GOOGLE_CLIENT_ID, googleId]);

    const flow = useMemo((): OnboardingStepId[] => {
        const f: OnboardingStepId[] = ['welcome', 'lock', 'telegram', 'gemini'];
        if (showPersonaStep) f.push('persona_about', 'persona');
        f.push('google');
        if (showDriveStep) f.push('drive');
        f.push('done');
        return f;
    }, [showPersonaStep, showDriveStep]);

    useLayoutEffect(() => {
        if (stepId === 'drive' && !showDriveStep) setStepId('done');
        if ((stepId === 'persona_about' || stepId === 'persona') && !showPersonaStep) {
            if (personaStepAfterNewKeyRef.current) return;
            setStepId('google');
        }
        if ((stepId === 'persona_about' || stepId === 'persona') && showPersonaStep) {
            personaStepAfterNewKeyRef.current = false;
        }
    }, [stepId, showPersonaStep, showDriveStep, setStepId]);

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
        const tok = telegramConfig?.botToken;
        if (tok && !tok.startsWith('***')) {
            setTelegramToken(tok);
        }
    }, [telegramConfig]);

    useEffect(() => {
        if (stepId === 'google' && !redirectUri) {
            setRedirectUri(getGoogleOAuthCallbackUrl());
        }
    }, [stepId, redirectUri]);

    useEffect(() => {
        if (stepId === 'welcome') {
            personaAboutHydratedRef.current = false;
        }
    }, [stepId]);

    useEffect(() => {
        if (stepId !== 'persona_about') return;
        if (personaAboutHydratedRef.current) return;
        if (!aiSettings) return;
        personaAboutHydratedRef.current = true;
        const raw = aiSettings.userContext ?? EMPTY_USER_PERSONA_CONTEXT;
        const migrated = personaNeedsLegacyMigration(raw) ? migrateLegacyPersonaFields(raw) : raw;
        setPersonaDraft(migrated);
        setPersonaNarrative(migrated.profile?.narrativeNotes ?? '');
        setExtractedFacts([]);
    }, [stepId, aiSettings]);

    useEffect(() => {
        const prev = prevOnboardingStepRef.current;
        prevOnboardingStepRef.current = stepId;
        if (stepId !== 'persona') return;
        if (!aiSettings) return;
        if (prev === 'persona_about') return;
        if (prev === 'persona') return;
        const raw = aiSettings.userContext ?? EMPTY_USER_PERSONA_CONTEXT;
        const migrated = personaNeedsLegacyMigration(raw) ? migrateLegacyPersonaFields(raw) : raw;
        setPersonaDraft(migrated);
    }, [stepId, aiSettings]);

    const defaultRedirect = getGoogleOAuthCallbackUrl();

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
            setStepId('gemini');
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
            setStepId('gemini');
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
                    onSuccess: () => {
                        personaStepAfterNewKeyRef.current = true;
                        setEnvDirty(true);
                        setStepId('persona_about');
                    },
                    onError: (e: unknown) => {
                        setSaveError(e instanceof Error ? e.message : t('onboarding.save_failed'));
                    }
                }
            );
            return;
        }
        if (trimmed.includes('***')) {
            setStepId(showPersonaStep ? 'persona_about' : 'google');
            return;
        }
        if (isGeminiApiKeyConfigured(envConfig?.GEMINI_API_KEY)) {
            setStepId('persona_about');
        } else {
            setStepId('google');
        }
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
            if (showDriveStep) setStepId('drive');
            else setStepId('done');
            return;
        }
        updateEnv(updates, {
            onSuccess: () => {
                setEnvDirty(true);
                if (showDriveStep) setStepId('drive');
                else setStepId('done');
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
            setStepId('done');
            return;
        }
        updateEnv(
            { DRIVE_FOLDER_ID: trimmed },
            {
                onSuccess: () => {
                    setEnvDirty(true);
                    setStepId('done');
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
                setStepId('telegram');
            }
        });
    };

    const goBack = () => {
        setSaveError(null);
        switch (stepId) {
            case 'lock':
                setStepId('welcome');
                break;
            case 'telegram':
                setStepId('lock');
                break;
            case 'gemini':
                setStepId('telegram');
                break;
            case 'persona':
                setPersonaNarrative(personaDraft.profile?.narrativeNotes ?? '');
                setStepId('persona_about');
                break;
            case 'persona_about':
                setStepId('gemini');
                break;
            case 'google':
                setStepId(showPersonaStep ? 'persona' : 'gemini');
                break;
            case 'drive':
                setStepId('google');
                break;
            case 'done':
                if (showDriveStep) setStepId('drive');
                else setStepId('google');
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
            persona_about: 'onboarding.steps.persona_about_title',
            persona: 'onboarding.steps.persona_title',
            google: 'onboarding.steps.google_title',
            drive: 'onboarding.steps.drive_title',
            done: 'onboarding.steps.done_title'
        };
        return t(keys[id]);
    };

    const stepBody = (id: OnboardingStepId) => {
        if (id === 'persona_about') return t('onboarding.steps.step_persona_about_body');
        if (id === 'persona') return t('onboarding.steps.step_persona_body');
        const idx = ['welcome', 'lock', 'telegram', 'gemini', 'google', 'drive', 'done'].indexOf(id);
        if (idx >= 0) return t(`onboarding.steps.step_${idx}_body`);
        return '';
    };

    const iconForStep = (id: OnboardingStepId) => {
        switch (id) {
            case 'welcome':
                return <Sparkles className="w-6 h-6" />;
            case 'lock':
                return <Lock className="w-6 h-6" />;
            case 'telegram':
                return <MessageCircle className="w-6 h-6" />;
            case 'gemini':
                return <KeyRound className="w-6 h-6" />;
            case 'persona_about':
                return <FileText className="w-6 h-6" />;
            case 'persona':
                return <Users className="w-6 h-6" />;
            case 'google':
                return <Cloud className="w-6 h-6" />;
            case 'drive':
                return <FolderOpen className="w-6 h-6" />;
            case 'done':
                return <CheckCircle2 className="w-6 h-6" />;
            default:
                return <Sparkles className="w-6 h-6" />;
        }
    };

    const handlePersonaNext = () => {
        setSaveError(null);
        const toSave = stripLegacyPersonaFieldsIfSuperseded(personaDraft);
        updateAISettings(
            { userContext: toSave },
            {
                onSuccess: () => {
                    setStepId('google');
                },
                onError: (e: Error) => {
                    setSaveError(e?.message || t('onboarding.save_failed'));
                }
            }
        );
    };

    const skipPersona = () => {
        setStepId('google');
    };

    const goPersonaAboutNext = () => {
        setSaveError(null);
        setPersonaDraft((prev) =>
            mergeUserPersonaContext(prev, {
                profile: { narrativeNotes: personaNarrative.trim() || undefined }
            })
        );
        setStepId('persona');
    };

    const extractPersonaFacts = async () => {
        setSaveError(null);
        setExtractLoading(true);
        try {
            const res = await fetch(`${getApiRoot()}/ai/persona/extract`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ narrative: personaNarrative })
            });
            const json = (await res.json()) as { success?: boolean; error?: string; data?: { persona: UserPersonaContext; facts: string[] } };
            if (!res.ok || !json.success || !json.data) {
                throw new Error(json.error || t('onboarding.persona_extract_failed'));
            }
            const { persona, facts } = json.data;
            setPersonaDraft((prev) => {
                const merged = mergeUserPersonaContext(prev, persona);
                return mergeUserPersonaContext(merged, {
                    profile: { narrativeNotes: personaNarrative.trim() || undefined }
                });
            });
            setExtractedFacts(facts ?? []);
        } catch (e: unknown) {
            setSaveError(e instanceof Error ? e.message : t('onboarding.persona_extract_failed'));
        } finally {
            setExtractLoading(false);
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

                    {stepId === 'persona_about' && (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">
                                    {t('onboarding.persona_narrative_label')}
                                </label>
                                <textarea
                                    value={personaNarrative}
                                    onChange={(e) => setPersonaNarrative(e.target.value)}
                                    disabled={extractLoading}
                                    rows={6}
                                    placeholder={t('onboarding.persona_narrative_placeholder')}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm leading-relaxed resize-y min-h-[7rem]"
                                />
                                <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{t('onboarding.persona_narrative_hint')}</p>
                            </div>
                            <div>
                                <button
                                    type="button"
                                    disabled={extractLoading || !personaNarrative.trim()}
                                    onClick={() => void extractPersonaFacts()}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-800 text-sm font-bold border border-indigo-100 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Sparkles className="w-4 h-4 shrink-0" />
                                    {extractLoading ? t('common.loading') : t('onboarding.persona_extract_facts')}
                                </button>
                            </div>
                            {extractedFacts.length > 0 && (
                                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                                    <p className="text-xs font-bold text-emerald-900 mb-2">{t('onboarding.persona_extracted_facts')}</p>
                                    <ul className="text-sm text-emerald-950 space-y-1.5 list-disc list-inside">
                                        {extractedFacts.map((f, i) => (
                                            <li key={i}>{f}</li>
                                        ))}
                                    </ul>
                                    <p className="text-[11px] text-emerald-800/90 mt-2 leading-snug">{t('onboarding.persona_extract_next_hint')}</p>
                                </div>
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
                        </div>
                    )}

                    {stepId === 'persona' && (
                        <div className="max-h-[45vh] overflow-y-auto pr-1">
                            <PersonaAlignmentForm value={personaDraft} onChange={setPersonaDraft} disabled={isSavingPersona} compact />
                        </div>
                    )}

                    {stepId === 'google' && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">{t('onboarding.google_client_id')}</label>
                                <input
                                    value={googleId}
                                    onChange={(e) => setGoogleId(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">{t('onboarding.google_client_secret')}</label>
                                <input
                                    type="password"
                                    value={googleSecret}
                                    onChange={(e) => setGoogleSecret(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm"
                                    placeholder={t('onboarding.leave_blank_unchanged')}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">{t('onboarding.redirect_uri')}</label>
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

                    {stepId === 'drive' && showDriveStep && (
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-600 block">{t('onboarding.drive_folder_label')}</label>
                            <input
                                value={driveFolder}
                                onChange={(e) => setDriveFolder(e.target.value)}
                                placeholder={t('onboarding.drive_folder_placeholder')}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm"
                            />
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
                                    onClick={() => setStepId('telegram')}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                {lockStatus?.lockConfigured ? (
                                    <button
                                        type="button"
                                        onClick={() => setStepId('telegram')}
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
                                    onClick={() => setStepId('gemini')}
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
                                    onClick={() =>
                                        setStepId(isGeminiApiKeyConfigured(envConfig?.GEMINI_API_KEY) ? 'persona_about' : 'google')
                                    }
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
                        {stepId === 'persona_about' && (
                            <>
                                <button
                                    type="button"
                                    onClick={skipPersona}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                <button
                                    type="button"
                                    disabled={extractLoading}
                                    onClick={goPersonaAboutNext}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50"
                                >
                                    {t('onboarding.persona_continue_to_details')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {stepId === 'persona' && (
                            <>
                                <button
                                    type="button"
                                    onClick={skipPersona}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSavingPersona}
                                    onClick={handlePersonaNext}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50"
                                >
                                    {isSavingPersona ? t('common.loading') : t('onboarding.next')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {stepId === 'google' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (showDriveStep) setStepId('drive');
                                        else setStepId('done');
                                    }}
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
                        {stepId === 'drive' && showDriveStep && (
                            <>
                                <button type="button" onClick={() => setStepId('done')} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">
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
