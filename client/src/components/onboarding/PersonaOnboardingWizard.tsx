import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Sparkles, Users } from 'lucide-react';
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
import { WizardShell } from './WizardShell';

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

    const footer = (
        <>
            <div className="flex gap-2">
                {step === 'details' && (
                    <button type="button" onClick={goBack} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-white">
                        <ArrowLeft className="w-4 h-4" />
                        {t('onboarding.back')}
                    </button>
                )}
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
                <button type="button" onClick={skipEntire} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">
                    {t('onboarding.skip_step')}
                </button>
                {step === 'about' ? (
                    <button type="button" disabled={extractLoading} onClick={goPersonaAboutNext} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50">
                        {t('onboarding.persona_continue_to_details')}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button type="button" disabled={isSavingPersona} onClick={handlePersonaSaveAndFinish} className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-50">
                        <CheckCircle2 className="w-4 h-4" />
                        {isSavingPersona ? t('common.loading') : t('onboarding.finish')}
                    </button>
                )}
            </div>
        </>
    );

    return (
        <WizardShell
            titleId="persona-onboarding-title"
            badge={t('onboarding.persona_setup_badge')}
            stepIndex={flow.indexOf(step)}
            stepCount={flow.length}
            onClose={skipEntire}
            closeLabel={t('onboarding.persona_setup_skip_all')}
            icon={step === 'about' ? <FileText className="w-6 h-6" /> : <Users className="w-6 h-6" />}
            title={step === 'about' ? t('onboarding.steps.persona_about_title') : t('onboarding.steps.persona_title')}
            body={step === 'about' ? t('onboarding.steps.step_persona_about_body') : t('onboarding.steps.step_persona_body')}
            error={saveError}
            footer={footer}
            footerHint={t('onboarding.footer_hint')}
        >
            {step === 'about' && (
                <div className="space-y-4">
                    <p className="text-sm text-slate-600 leading-relaxed">{t('onboarding.persona_setup_after_restart_hint')}</p>
                    <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">{t('onboarding.persona_narrative_label')}</label>
                        <textarea value={personaNarrative} onChange={(e) => setPersonaNarrative(e.target.value)} disabled={extractLoading} rows={6} placeholder={t('onboarding.persona_narrative_placeholder')} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm leading-relaxed resize-y min-h-[7rem]" />
                        <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{t('onboarding.persona_narrative_hint')}</p>
                    </div>
                    <button type="button" disabled={extractLoading || !personaNarrative.trim()} onClick={() => void extractPersonaFacts()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-800 text-sm font-bold border border-indigo-100 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed">
                        <Sparkles className="w-4 h-4 shrink-0" />
                        {extractLoading ? t('common.loading') : t('onboarding.persona_extract_facts')}
                    </button>
                    {extractedFacts.length > 0 && (
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                            <p className="text-xs font-bold text-emerald-900 mb-2">{t('onboarding.persona_extracted_facts')}</p>
                            <ul className="text-sm text-emerald-950 space-y-1.5 list-disc list-inside">
                                {extractedFacts.map((fact, index) => <li key={index}>{fact}</li>)}
                            </ul>
                            <p className="text-[11px] text-emerald-800/90 mt-2 leading-snug">{t('onboarding.persona_extract_next_hint')}</p>
                        </div>
                    )}
                </div>
            )}
            {step === 'details' && (
                <div className="max-h-[45vh] overflow-y-auto pr-1">
                    <PersonaAlignmentForm value={personaDraft} onChange={setPersonaDraft} disabled={isSavingPersona} compact includeAiPreferencesSection />
                </div>
            )}
        </WizardShell>
    );
}
