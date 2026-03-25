import { useTranslation } from 'react-i18next';
import { Map } from 'lucide-react';
import { useGettingStarted } from '../../contexts/GettingStartedContext';

export function GettingStartedResumeBanner() {
    const { t } = useTranslation();
    const { resume, step, complete } = useGettingStarted();

    return (
        <div className="shrink-0 bg-teal-50 border-b border-teal-100 px-4 py-2.5">
            <div className="container mx-auto max-w-[1600px] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-teal-950 min-w-0">
                    <Map className="w-4 h-4 shrink-0 text-teal-600" />
                    <span className="font-medium">
                        {t('getting_started.resume_banner', { step: step + 1 })}
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={complete}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1"
                    >
                        {t('getting_started.dismiss_tour')}
                    </button>
                    <button
                        type="button"
                        onClick={resume}
                        className="px-4 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-black hover:bg-teal-700 shadow-sm"
                    >
                        {t('getting_started.resume')}
                    </button>
                </div>
            </div>
        </div>
    );
}
