import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AISettings } from './AISettings';
import { ScrapeSettings } from './ScrapeSettings';
import { MaintenancePanel } from './MaintenancePanel';
import { GoogleSettings } from './GoogleSettings';
import { GoogleSheetsSync } from './GoogleSheetsSync';
import { FraudSettings } from './FraudSettings';
import { TelegramSettings } from './TelegramSettings';
import { MqttSettings } from './MqttSettings';
import { CategorySettings } from './CategorySettings';
import { InsightRulesSettings } from './InsightRulesSettings';
import type { ConfigTabId } from '../utils/appUrlState';
import { BudgetExportSettings } from './BudgetExportSettings';
import { InvestmentSettings } from './InvestmentSettings';
import { FinancialReportSettings } from './FinancialReportSettings';
import { AuxiliarySchedulerSections } from './SchedulerSettings';
import {
    ADVANCED_MODE_KEY,
    BASIC_ONBOARDING_TABS,
    requiresAdvancedMode,
    visibleConfigTabs,
} from './config/configMode';
import { visibleConfigGroups } from './config/configGroups';

export interface ConfigurationPanelProps {
    activeTab: ConfigTabId;
    onTabChange: (tab: ConfigTabId) => void;
    onOpenBudgetExports?: () => void;
    /** When set with insight-rules tab, open this rule in the editor after load. */
    openInsightRuleId?: string | null;
    onOpenInsightRuleConsumed?: () => void;
}

const CONFIG_SECTIONS: { id: ConfigTabId }[] = [
    { id: 'ai' },
    { id: 'insight-rules' },
    { id: 'categories' },
    { id: 'scheduler' },
    { id: 'financial-report' },
    { id: 'scrape' },
    { id: 'sheets' },
    { id: 'budget-exports' },
    { id: 'investments' },
    { id: 'telegram' },
    { id: 'mqtt' },
    { id: 'maintenance' },
];



export function ConfigurationPanel({
    activeTab,
    onTabChange,
    onOpenBudgetExports,
    openInsightRuleId,
    onOpenInsightRuleConsumed,
}: ConfigurationPanelProps) {
    const { t } = useTranslation();
    const [advancedMode, setAdvancedMode] = useState(() => {
        try {
            return localStorage.getItem(ADVANCED_MODE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    const sectionLabel = (id: ConfigTabId) => t(`config_tabs.${id}`);
    const isAdvancedSidebarTabActive = useMemo(() => requiresAdvancedMode(activeTab), [activeTab]);
    const visibleConfigSections = useMemo(() => {
        const visibleTabs = visibleConfigTabs(
            CONFIG_SECTIONS.map(({ id }) => id),
            advancedMode
        );
        return CONFIG_SECTIONS.filter(({ id }) => visibleTabs.includes(id));
    }, [advancedMode]);
    const visibleGroups = useMemo(
        () => visibleConfigGroups(visibleConfigSections.map(({ id }) => id)),
        [visibleConfigSections]
    );

    useEffect(() => {
        if (isAdvancedSidebarTabActive && !advancedMode) {
            setAdvancedMode(true);
        }
    }, [advancedMode, isAdvancedSidebarTabActive]);

    useEffect(() => {
        try {
            localStorage.setItem(ADVANCED_MODE_KEY, String(advancedMode));
        } catch {
            // Ignore storage errors in private mode.
        }
    }, [advancedMode]);

    useEffect(() => {
        const onOpenAdvanced = (event: Event) => {
            const custom = event as CustomEvent<{ tab?: ConfigTabId }>;
            const tab = custom.detail?.tab;
            if (!tab || !BASIC_ONBOARDING_TABS.includes(tab)) return;
            setAdvancedMode(true);
            onTabChange(tab);
        };
        window.addEventListener('configuration-open-advanced', onOpenAdvanced as EventListener);
        return () => window.removeEventListener('configuration-open-advanced', onOpenAdvanced as EventListener);
    }, [onTabChange]);

    const toggleAdvancedMode = () => {
        setAdvancedMode((current) => !current);
    };

    const renderPanelBody = () => (
        <>
            {activeTab === 'ai' && <AISettings isInline={true} showAdvanced={advancedMode} />}
            {activeTab === 'insight-rules' && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{t('config_tabs.insight-rules')}</h2>
                        <p className="text-gray-500 text-sm mt-1">{t('insight_rules.subtitle')}</p>
                    </div>
                    <InsightRulesSettings
                        isInline
                        standaloneTab
                        openRuleId={openInsightRuleId ?? null}
                        onOpenRuleConsumed={onOpenInsightRuleConsumed}
                    />
                </div>
            )}
            {activeTab === 'categories' && <CategorySettings showAdvanced={advancedMode} />}
            {activeTab === 'scheduler' && <AuxiliarySchedulerSections isInline />}
            {activeTab === 'financial-report' && <FinancialReportSettings showAdvanced={advancedMode} />}
            {activeTab === 'scrape' && (
                <div className="space-y-10">
                    <ScrapeSettings
                        isInline={true}
                        onOpenBudgetExports={onOpenBudgetExports}
                        showAdvanced={advancedMode}
                    />
                    <div id="fraud-alerts-section">
                        <FraudSettings isInline={true} showAdvanced={advancedMode} />
                    </div>
                </div>
            )}
            {activeTab === 'sheets' && (
                <div className="space-y-6">
                    <GoogleSheetsSync isInline={true} />
                    <GoogleSettings isInline={true} />
                </div>
            )}
            {activeTab === 'budget-exports' && <BudgetExportSettings />}
            {activeTab === 'investments' && <InvestmentSettings isInline />}
            {activeTab === 'telegram' && <TelegramSettings isInline={true} />}
            {activeTab === 'mqtt' && <MqttSettings isInline={true} />}
            {activeTab === 'maintenance' && <MaintenancePanel />}
        </>
    );

    const markConfigurationDirty = () => {
        window.dispatchEvent(new CustomEvent('configuration-dirty'));
    };

    return (
        <div className="flex flex-col md:flex-row min-h-full bg-gray-50" data-testid="configuration-panel">
            {/* Mobile: single section picker — avoids a second horizontal tab strip */}
            <div className="md:hidden shrink-0 border-b border-gray-200 bg-white px-4 py-3">
                <label htmlFor="config-section-select" className="mb-1.5 block text-xs font-medium text-gray-500">
                    {t('config_sidebar.section_select_label')}
                </label>
                <select
                    id="config-section-select"
                    value={activeTab}
                    onChange={(e) => onTabChange(e.target.value as ConfigTabId)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    aria-label={t('config_sidebar.nav_aria')}
                >
                    {visibleGroups.map((group) => (
                        <optgroup key={group.id} label={t(`config_sidebar.groups.${group.id}`)}>
                            {group.tabs.map((id) => (
                                <option key={id} value={id}>
                                    {sectionLabel(id)}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
            </div>

            {/* Desktop: vertical sidebar */}
            <aside className="hidden md:flex w-56 shrink-0 self-start sticky top-0 max-h-screen flex-col border-e border-gray-200 bg-white">
                <nav
                    className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3"
                    aria-label={t('config_sidebar.nav_aria')}
                >
                    {visibleGroups.map((group) => (
                        <div key={group.id} className="mb-3 last:mb-0">
                            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                                {t(`config_sidebar.groups.${group.id}`)}
                            </p>
                            <div className="space-y-0.5">
                                {group.tabs.map((id) => {
                                    const active = activeTab === id;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => onTabChange(id)}
                                            aria-current={active ? 'page' : undefined}
                                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-start text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                                                active
                                                    ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80'
                                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                            }`}
                                        >
                                            <span className="min-w-0">{sectionLabel(id)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

            </aside>

            <main
                className="flex-1 min-w-0 p-4 sm:p-6"
                onInputCapture={markConfigurationDirty}
                onChangeCapture={markConfigurationDirty}
            >
                <div className="max-w-4xl mx-auto space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-gray-800">{t('config_sidebar.mode_label')}</p>
                                <p className="text-xs text-gray-500">
                                    {advancedMode
                                        ? t('config_sidebar.mode_advanced_hint')
                                        : t('config_sidebar.mode_basic_hint')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={toggleAdvancedMode}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                {advancedMode ? t('config_sidebar.hide_advanced') : t('config_sidebar.show_advanced')}
                            </button>
                        </div>
                    {renderPanelBody()}
                </div>
            </main>
        </div>
    );
}
