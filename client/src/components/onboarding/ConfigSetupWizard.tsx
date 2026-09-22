import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConfigTabId } from '../../utils/appUrlState';
import { dismissConfigSetupWizard } from '../../utils/configSetupWizardState';

const STEPS: { tab: ConfigTabId; titleKey: string; bodyKey: string }[] = [
    { tab: 'ai', titleKey: 'common.configuration', bodyKey: 'getting_started.step_6_body' },
    { tab: 'scrape', titleKey: 'common.scrape', bodyKey: 'getting_started.step_2_body' },
    { tab: 'categories', titleKey: 'config_tabs.categories', bodyKey: 'getting_started.step_1_body' },
    { tab: 'financial-report', titleKey: 'config_tabs.financial-report', bodyKey: 'getting_started.step_4_body' },
];

interface ConfigSetupWizardProps {
    activeTab: ConfigTabId;
    onNavigate: (tab: ConfigTabId) => void;
}

export function ConfigSetupWizard({ activeTab, onNavigate }: ConfigSetupWizardProps) {
    const { t } = useTranslation();
    const [closed, setClosed] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const currentStep = useMemo(() => {
        const idx = STEPS.findIndex((s) => s.tab === activeTab);
        return idx >= 0 ? idx : 0;
    }, [activeTab]);

    if (closed) return null;

    const dismiss = () => {
        dismissConfigSetupWizard();
        setClosed(true);
    };

    const openAdvancedForActiveStep = () => {
        const step = STEPS[currentStep];
        if (!step) return;
        window.dispatchEvent(new CustomEvent('configuration-open-advanced', { detail: { tab: step.tab } }));
    };

    const step = STEPS[currentStep];

    return (
        <section className="mx-auto mb-4 max-w-4xl rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-900">{t('config_setup_wizard.title')}</h2>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-blue-700">
                            {currentStep + 1} / {STEPS.length}
                        </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-600">
                        {t(step.titleKey)} · {t('config_setup_wizard.subtitle')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {expanded ? t('common.collapse', 'Collapse') : t('common.details', 'Details')}
                </button>
                <button
                    type="button"
                    onClick={dismiss}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-100"
                    aria-label={t('common.dismiss')}
                    title={t('common.dismiss')}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {expanded && (
                <div className="mt-3 border-t border-blue-100 pt-3">
                    <div className="flex flex-wrap gap-2" aria-label={t('config_setup_wizard.title')}>
                        {STEPS.map((item, index) => {
                            const isActive = item.tab === activeTab;
                            const done = index < currentStep;
                            return (
                                <button
                                    key={item.tab}
                                    type="button"
                                    onClick={() => onNavigate(item.tab)}
                                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                        isActive
                                            ? 'bg-blue-600 text-white'
                                            : done
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : 'border border-slate-200 bg-white text-slate-700'
                                    }`}
                                >
                                    {index + 1}. {t(item.titleKey)}
                                </button>
                            );
                        })}
                    </div>
                    <ReactMarkdown
                        components={{
                            p: ({ children }) => <p className="mt-3 text-xs leading-relaxed text-slate-600">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
                        }}
                    >
                        {t(step.bodyKey)}
                    </ReactMarkdown>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onNavigate(step.tab)}
                            className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                            {t('config_setup_wizard.open_step')}
                        </button>
                        <button
                            type="button"
                            onClick={openAdvancedForActiveStep}
                            className="rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                        >
                            {t('config_setup_wizard.open_advanced', 'Open advanced for this step')}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
