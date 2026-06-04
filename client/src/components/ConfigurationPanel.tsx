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

const ADVANCED_VISIBILITY_KEY = 'config-advanced-visibility-v1';
const BASIC_ONBOARDING_TABS: ConfigTabId[] = ['ai', 'scrape', 'categories', 'financial-report'];
const ADVANCED_SIDEBAR_TABS: ConfigTabId[] = [
    'insight-rules',
    'scheduler',
    'sheets',
    'budget-exports',
    'investments',
    'telegram',
    'mqtt',
    'maintenance',
];

export function ConfigurationPanel({
    activeTab,
    onTabChange,
    onOpenBudgetExports,
    openInsightRuleId,
    onOpenInsightRuleConsumed,
}: ConfigurationPanelProps) {
    const { t } = useTranslation();
    const [advancedVisibleByTab, setAdvancedVisibleByTab] = useState<Partial<Record<ConfigTabId, boolean>>>(() => {
        try {
            const raw = localStorage.getItem(ADVANCED_VISIBILITY_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw) as Partial<Record<ConfigTabId, boolean>>;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    });

    const sectionLabel = (id: ConfigTabId) => t(`config_tabs.${id}`);
    const isBasicScopeTab = useMemo(() => BASIC_ONBOARDING_TABS.includes(activeTab), [activeTab]);
    const showAdvancedForActiveTab = Boolean(advancedVisibleByTab[activeTab]);
    const [showAdvancedSidebarTabs, setShowAdvancedSidebarTabs] = useState(false);
    const isAdvancedSidebarTabActive = useMemo(() => ADVANCED_SIDEBAR_TABS.includes(activeTab), [activeTab]);
    const visibleConfigSections = useMemo(() => {
        const shouldShowAdvanced = showAdvancedSidebarTabs || isAdvancedSidebarTabActive;
        return CONFIG_SECTIONS.filter(
            ({ id }) => !ADVANCED_SIDEBAR_TABS.includes(id) || shouldShowAdvanced
        );
    }, [showAdvancedSidebarTabs, isAdvancedSidebarTabActive]);

    useEffect(() => {
        try {
            localStorage.setItem(ADVANCED_VISIBILITY_KEY, JSON.stringify(advancedVisibleByTab));
        } catch {
            // Ignore storage errors in private mode.
        }
    }, [advancedVisibleByTab]);

    useEffect(() => {
        const onOpenAdvanced = (event: Event) => {
            const custom = event as CustomEvent<{ tab?: ConfigTabId }>;
            const tab = custom.detail?.tab;
            if (!tab || !BASIC_ONBOARDING_TABS.includes(tab)) return;
            setAdvancedVisibleByTab((prev) => ({ ...prev, [tab]: true }));
            onTabChange(tab);
        };
        window.addEventListener('configuration-open-advanced', onOpenAdvanced as EventListener);
        return () => window.removeEventListener('configuration-open-advanced', onOpenAdvanced as EventListener);
    }, [onTabChange]);

    const toggleAdvancedForActiveTab = () => {
        setAdvancedVisibleByTab((prev) => ({ ...prev, [activeTab]: !prev[activeTab] }));
    };

    const renderPanelBody = () => (
        <>
            {activeTab === 'ai' && <AISettings isInline={true} showAdvanced={showAdvancedForActiveTab} />}
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
            {activeTab === 'categories' && <CategorySettings showAdvanced={showAdvancedForActiveTab} />}
            {activeTab === 'scheduler' && <AuxiliarySchedulerSections isInline />}
            {activeTab === 'financial-report' && <FinancialReportSettings showAdvanced={showAdvancedForActiveTab} />}
            {activeTab === 'scrape' && (
                <div className="space-y-10">
                    <ScrapeSettings
                        isInline={true}
                        onOpenBudgetExports={onOpenBudgetExports}
                        showAdvanced={showAdvancedForActiveTab}
                    />
                    <div id="fraud-alerts-section">
                        <FraudSettings isInline={true} showAdvanced={showAdvancedForActiveTab} />
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

    return (
        <div
            className="flex flex-col md:flex-row h-full min-h-0 bg-gray-50"
            data-testid="configuration-panel"
            onInputCapture={() => window.dispatchEvent(new CustomEvent('configuration-dirty'))}
            onChangeCapture={() => window.dispatchEvent(new CustomEvent('configuration-dirty'))}
        >
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
                    {visibleConfigSections.map(({ id }) => (
                        <option key={id} value={id}>
                            {sectionLabel(id)}
                        </option>
                    ))}
                </select>
                {!isAdvancedSidebarTabActive && (
                    <button
                        type="button"
                        onClick={() => setShowAdvancedSidebarTabs((prev) => !prev)}
                        className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        {showAdvancedSidebarTabs ? t('config_sidebar.hide_extra_sections') : t('config_sidebar.show_extra_sections')}
                    </button>
                )}
            </div>

            {/* Desktop: vertical sidebar */}
            <aside className="hidden md:flex w-56 shrink-0 flex-col border-e border-gray-200 bg-white">
                <nav
                    className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3"
                    aria-label={t('config_sidebar.nav_aria')}
                >
                    {visibleConfigSections.map(({ id }) => {
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
                </nav>
                {!isAdvancedSidebarTabActive && (
                    <div className="border-t border-gray-100 p-3">
                        <button
                            type="button"
                            onClick={() => setShowAdvancedSidebarTabs((prev) => !prev)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            {showAdvancedSidebarTabs
                                ? t('config_sidebar.hide_extra_sections')
                                : t('config_sidebar.show_extra_sections')}
                        </button>
                    </div>
                )}
            </aside>

            <main className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6">
                <div className="max-w-4xl mx-auto space-y-4">
                    {isBasicScopeTab && (
                        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-gray-800">{t('config_sidebar.mode_label')}</p>
                                <p className="text-xs text-gray-500">
                                    {showAdvancedForActiveTab
                                        ? t('config_sidebar.mode_advanced_hint')
                                        : t('config_sidebar.mode_basic_hint')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={toggleAdvancedForActiveTab}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                {showAdvancedForActiveTab ? t('config_sidebar.hide_advanced') : t('config_sidebar.show_advanced')}
                            </button>
                        </div>
                    )}
                    {renderPanelBody()}
                </div>
            </main>
        </div>
    );
}
