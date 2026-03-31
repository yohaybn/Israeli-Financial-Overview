import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Sparkles, Users, X } from 'lucide-react';
import type { UserPersonaContext } from '@app/shared';
import {
    EMPTY_USER_PERSONA_CONTEXT,
    mergeUserPersonaContext,
    migrateLegacyPersonaFields,
    personaNeedsLegacyMigration,
    stripLegacyPersonaFieldsIfSuperseded
} from '@app/shared';
import { useAISettings, useUpdateAISettings } from '../../hooks/useScraper';
import { getApiRoot } from '../../lib/api';
import { markPersonaSetupWizardFinished } from '../../utils/personaSetupWizardStorage';
import { PersonaAlignmentForm } from '../persona/PersonaAlignmentForm';

type PersonaStep = 'about' | 'details';

export function PersonaOnboardingWizard() {
    const { t } = useTranslation();
    const { data: aiSettings } = useAISettings();
    const { mutate: updateAISettings, isPending: isSavingPersona } = useUpdateAISettings();

    const [step, setStep] = useState<PersonaStep>('about');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [personaDraft, setPersonaDraft] = useState<UserPersonaContext>(EMPTY_USER_PERSONA_CONTEXT);
    const [personaNarrative, setPersonaNarrative] = useState('');
    const [extractedFacts, setExtractedFacts] = useState<string[]>([]);
    const [extractLoading, setExtractLoading] = useState(false);
    const aboutHydratedRef = useRef(false);

    useEffect(() => {
        if (step !== 'about') return;
        if (aboutHydratedRef.current) return;
        if (!aiSettings) return;
        aboutHydratedRef.current = true;
        const raw = aiSettings.userContext ?? EMPTY_USER_PERSONA_CONTEXT;
        const migrated = personaNeedsLegacyMigration(raw) ? migrateLegacyPersonaFields(raw) : raw;
        setPersonaDraft(migrated);
        setPersonaNarrative(migrated.profile?.narrativeNotes ?? '');
        setExtractedFacts([]);
    }, [step, aiSettings]);

    const flow: PersonaStep[] = ['about', 'details'];
    const progressLabel = `${flow.indexOf(step) + 1} / ${flow.length}`;

    const extractPersonaFacts = async () => {
        setSaveError(null);
        setExtractLoading(true);
        try {
            const res = await fetch(`${getApiRoot()}/ai/persona/extract`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ narrative: personaNarrative })
            });
            const json = (await res.json()) as {
                success?: boolean;
                error?: string;
                data?: { persona: UserPersonaContext; facts: string[] };
            };
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

    const goPersonaAboutNext = () => {
        setSaveError(null);
        setPersonaDraft((prev) =>
            mergeUserPersonaContext(prev, {
                profile: { narrativeNotes: personaNarrative.trim() || undefined }
            })
        );
        setStep('details');
    };

    const handlePersonaSaveAndFinish = () => {
        setSaveError(null);
        const toSave = stripLegacyPersonaFieldsIfSuperseded(personaDraft);
        updateAISettings(
            { userContext: toSave },
            {
                onSuccess: () => {
                    markPersonaSetupWizardFinished();
                },
                onError: (e: Error) => {
                    setSaveError(e?.message || t('onboarding.save_failed'));
                }
            }
        );
    };

    const skipEntire = () => {
        markPersonaSetupWizardFinished();
    };

    const goBack = () => {
        setSaveError(null);
        if (step === 'details') {
            setPersonaNarrative(personaDraft.profile?.narrativeNotes ?? '');
            setStep('about');
        }
    };

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="persona-onboarding-title"
        >
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
                            {t('onboarding.persona_setup_badge')}
                        </span>
                        <span className="text-xs font-bold text-slate-500 truncate">{progressLabel}</span>
                    </div>
                    <button
                        type="button"
                        onClick={skipEntire}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        title={t('onboarding.persona_setup_skip_all')}
                        aria-label={t('onboarding.persona_setup_skip_all')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                            {step === 'about' ? <FileText className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 id="persona-onboarding-title" className="text-xl font-black text-slate-900 leading-tight">
                                {step === 'about'
                                    ? t('onboarding.steps.persona_about_title')
                                    : t('onboarding.steps.persona_title')}
                            </h2>
                            <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">
                                {step === 'about'
                                    ? t('onboarding.steps.step_persona_about_body')
                                    : t('onboarding.steps.step_persona_body')}
                            </p>
                        </div>
                    </div>

                    {saveError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{saveError}</div>
                    )}

                    {step === 'about' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600 leading-relaxed">{t('onboarding.persona_setup_after_restart_hint')}</p>
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

                    {step === 'details' && (
                        <div className="max-h-[45vh] overflow-y-auto pr-1">
                            <PersonaAlignmentForm value={personaDraft} onChange={setPersonaDraft} disabled={isSavingPersona} compact />
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center gap-2 justify-between bg-slate-50/80 rounded-b-2xl shrink-0">
                    <div className="flex gap-2">
                        {step === 'details' && (
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
                        {step === 'about' && (
                            <>
                                <button
                                    type="button"
                                    onClick={skipEntire}
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
                        {step === 'details' && (
                            <>
                                <button
                                    type="button"
                                    onClick={skipEntire}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('onboarding.skip_step')}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSavingPersona}
                                    onClick={handlePersonaSaveAndFinish}
                                    className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    {isSavingPersona ? t('common.loading') : t('onboarding.finish')}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <p className="px-6 pb-4 text-center text-[11px] text-slate-400">{t('onboarding.footer_hint')}</p>
            </div>
        </div>
    );
}
