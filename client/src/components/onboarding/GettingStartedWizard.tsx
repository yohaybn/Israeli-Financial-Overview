import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    LayoutDashboard,
    Map,
    PlayCircle,
    ScrollText,
    Settings2,
    Sparkles,
    Landmark,
    X
} from 'lucide-react';
import { useGettingStarted } from '../../contexts/GettingStartedContext';
import type { AppUrlState } from '../../utils/appUrlState';
import { GETTING_STARTED_STEP_COUNT } from '../../hooks/useGettingStartedState';

const NAV_BY_STEP: (Partial<AppUrlState> | null)[] = [
    null,
    { view: 'scrape' },
    { view: 'scrape' },
    { view: 'dashboard' },
    { view: 'logs', logType: 'server', logEntryId: null },
    { view: 'configuration', configTab: 'scrape' }
];

export interface GettingStartedWizardProps {
    onNavigate: (patch: Partial<AppUrlState>) => void;
}

export function GettingStartedWizard({ onNavigate }: GettingStartedWizardProps) {
    const { t } = useTranslation();
    const { step, nextStep, prevStep, complete, continueLater } = useGettingStarted();

    useEffect(() => {
        const patch = NAV_BY_STEP[step];
        if (patch) {
            onNavigate(patch);
        }
    }, [step, onNavigate]);

    const stepIcon = (s: number) => {
        const cls = 'w-6 h-6';
        switch (s) {
            case 0:
                return <Sparkles className={cls} />;
            case 1:
                return <Landmark className={cls} />;
            case 2:
                return <PlayCircle className={cls} />;
            case 3:
                return <LayoutDashboard className={cls} />;
            case 4:
                return <ScrollText className={cls} />;
            case 5:
                return <Settings2 className={cls} />;
            default:
                return <Map className={cls} />;
        }
    };

    const totalSteps = GETTING_STARTED_STEP_COUNT;
    const progressLabel = `${Math.min(step + 1, totalSteps)} / ${totalSteps}`;

    const skipEntireTour = () => {
        complete();
    };

    return (
        <div
            className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="getting-started-title"
        >
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-teal-600 shrink-0">
                            {t('getting_started.badge')}
                        </span>
                        <span className="text-xs font-bold text-slate-500 truncate">{progressLabel}</span>
                    </div>
                    <button
                        type="button"
                        onClick={continueLater}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        title={t('getting_started.continue_later')}
                        aria-label={t('getting_started.continue_later')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-teal-50 text-teal-700 shrink-0">{stepIcon(step)}</div>
                        <div className="min-w-0 flex-1">
                            <h2 id="getting-started-title" className="text-xl font-black text-slate-900 leading-tight">
                                {t(`getting_started.step_${step}_title`)}
                            </h2>
                            <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">
                                {t(`getting_started.step_${step}_body`)}
                            </p>
                        </div>
                    </div>
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
                                {t('getting_started.back')}
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                        {step === 0 && (
                            <>
                                <button
                                    type="button"
                                    onClick={skipEntireTour}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('getting_started.skip_all')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => nextStep()}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700"
                                >
                                    {t('getting_started.next')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {step > 0 && step < totalSteps - 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={skipEntireTour}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('getting_started.skip_all')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => nextStep()}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700"
                                >
                                    {t('getting_started.next')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {step === totalSteps - 1 && (
                            <button
                                type="button"
                                onClick={() => complete()}
                                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                {t('getting_started.finish')}
                            </button>
                        )}
                    </div>
                </div>

                <p className="px-6 pb-4 text-center text-[11px] text-slate-400">{t('getting_started.footer_hint')}</p>
            </div>
        </div>
    );
}
