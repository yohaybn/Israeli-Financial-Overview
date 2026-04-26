import { useTranslation } from 'react-i18next';
import { AISettings } from './AISettings';
import { ScrapeSettings } from './ScrapeSettings';
import { MaintenancePanel } from './MaintenancePanel';
import { SchedulerSettings } from './SchedulerSettings';
import { GoogleSettings } from './GoogleSettings';
import { GoogleSheetsSync } from './GoogleSheetsSync';
import { FraudSettings } from './FraudSettings';
import { TelegramSettings } from './TelegramSettings';
import { CategorySettings } from './CategorySettings';
import { InsightRulesSettings } from './InsightRulesSettings';
import type { ConfigTabId } from '../utils/appUrlState';
import { BudgetExportSettings } from './BudgetExportSettings';
import { InvestmentSettings } from './InvestmentSettings';
import { FinancialReportSettings } from './FinancialReportSettings';

export interface ConfigurationPanelProps {
    activeTab: ConfigTabId;
    onTabChange: (tab: ConfigTabId) => void;
    onOpenBudgetExports?: () => void;
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
    { id: 'maintenance' },
];

export function ConfigurationPanel({ activeTab, onTabChange, onOpenBudgetExports }: ConfigurationPanelProps) {
    const { t } = useTranslation();

    const sectionLabel = (id: ConfigTabId) => t(`config_tabs.${id}`);

    const renderPanelBody = () => (
        <>
            {activeTab === 'ai' && <AISettings isInline={true} />}
            {activeTab === 'insight-rules' && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{t('config_tabs.insight-rules')}</h2>
                        <p className="text-gray-500 text-sm mt-1">{t('insight_rules.subtitle')}</p>
                    </div>
                    <InsightRulesSettings isInline standaloneTab />
                </div>
            )}
            {activeTab === 'categories' && <CategorySettings />}
            {activeTab === 'scheduler' && <SchedulerSettings isInline={true} />}
            {activeTab === 'financial-report' && <FinancialReportSettings />}
            {activeTab === 'scrape' && (
                <div className="space-y-10">
                    <ScrapeSettings isInline={true} onOpenBudgetExports={onOpenBudgetExports} />
                    <div id="fraud-alerts-section">
                        <FraudSettings isInline={true} />
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
            {activeTab === 'maintenance' && <MaintenancePanel />}
        </>
    );

    return (
        <div className="flex flex-col md:flex-row h-full min-h-0 bg-gray-50" data-testid="configuration-panel">
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
                    {CONFIG_SECTIONS.map(({ id }) => (
                        <option key={id} value={id}>
                            {sectionLabel(id)}
                        </option>
                    ))}
                </select>
            </div>

            {/* Desktop: vertical sidebar */}
            <aside className="hidden md:flex w-56 shrink-0 flex-col border-e border-gray-200 bg-white">
                <nav
                    className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3"
                    aria-label={t('config_sidebar.nav_aria')}
                >
                    {CONFIG_SECTIONS.map(({ id }) => {
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
            </aside>

            <main className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6">
                <div className="max-w-4xl mx-auto">{renderPanelBody()}</div>
            </main>
        </div>
    );
}
