import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfigTabId } from '../../utils/appUrlState';

const STORAGE_KEY = 'config-setup-wizard-dismissed-v1';

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

export function shouldShowConfigSetupWizard(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
        return false;
    }
}

export function ConfigSetupWizard({ activeTab, onNavigate }: ConfigSetupWizardProps) {
    const { t } = useTranslation();
    const [closed, setClosed] = useState(false);

    const currentStep = useMemo(() => {
        const idx = STEPS.findIndex((s) => s.tab === activeTab);
        return idx >= 0 ? idx : 0;
    }, [activeTab]);

    if (closed) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch {
            // ignore
        }
        setClosed(true);
    };

    const openAdvancedForActiveStep = () => {
        const step = STEPS[currentStep];
        if (!step) return;
        window.dispatchEvent(new CustomEvent('configuration-open-advanced', { detail: { tab: step.tab } }));
    };

    return (
        <section className="mx-auto mb-4 max-w-4xl rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold text-slate-900">{t('config_setup_wizard.title')}</h2>
                    <p className="text-sm text-slate-600">{t('config_setup_wizard.subtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={dismiss}
                    className="bg-slate-100 text-slate-600 rounded-md px-3 py-1.5 text-xs font-medium hover:bg-slate-200"
                >
                    {t('common.dismiss')}
                </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {STEPS.map((step, index) => {
                    const isActive = step.tab === activeTab;
                    const done = index < currentStep;
                    return (
                        <button
                            key={step.tab}
                            type="button"
                            onClick={() => onNavigate(step.tab)}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                isActive
                                    ? 'bg-blue-600 text-white'
                                    : done
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-white text-slate-700 border border-slate-200'
                            }`}
                        >
                            {index + 1}. {t(step.titleKey)}
                        </button>
                    );
                })}
            </div>
            <p className="mt-2 text-xs text-slate-600">{t(STEPS[currentStep].bodyKey)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => onNavigate(STEPS[currentStep].tab)}
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
        </section>
    );
}
