import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';

export function OnboardingResumeBanner() {
    const { t } = useTranslation();
    const { resume, resumeStepNumber, complete } = useOnboarding();

    return (
        <div className="shrink-0 bg-indigo-50 border-b border-indigo-100 px-4 py-2.5">
            <div className="container mx-auto max-w-[1600px] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-indigo-950 min-w-0">
                    <Sparkles className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="font-medium">
                        {t('onboarding.resume_banner', { step: resumeStepNumber })}
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={complete}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1"
                    >
                        {t('onboarding.dismiss_setup')}
                    </button>
                    <button
                        type="button"
                        onClick={resume}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 shadow-sm"
                    >
                        {t('onboarding.resume')}
                    </button>
                </div>
            </div>
        </div>
    );
}
