import { useTranslation } from 'react-i18next';
import { AISettings } from './AISettings';
import { ScrapeSettings } from './ScrapeSettings';
import { MaintenancePanel } from './MaintenancePanel';
import { SchedulerSettings } from './SchedulerSettings';
import { GoogleSettings } from './GoogleSettings';
import { GoogleSheetsSync } from './GoogleSheetsSync';
import { EnvironmentSettings } from './EnvironmentSettings';
import { FraudSettings } from './FraudSettings';
import { TelegramSettings } from './TelegramSettings';
import { AIMemorySettings } from './AIMemorySettings';
import type { ConfigTabId } from '../utils/appUrlState';

export interface ConfigurationPanelProps {
    activeTab: ConfigTabId;
    onTabChange: (tab: ConfigTabId) => void;
}

export function ConfigurationPanel({ activeTab, onTabChange }: ConfigurationPanelProps) {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col h-full bg-gray-50" data-testid="configuration-panel">
            <header className="bg-white border-b border-gray-200 p-6 shrink-0">
                <nav className="flex gap-2 scrollbar-hide overflow-x-auto pb-2">
                    <button
                        onClick={() => onTabChange('ai')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'ai' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        {t('ai_settings.title')}
                    </button>
                    <button
                        onClick={() => onTabChange('memory')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'memory' ? 'bg-violet-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        {t('ai_memory.title')}
                    </button>
                    <button
                        onClick={() => onTabChange('scheduler')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'scheduler' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        {t('scheduler.title')}
                    </button>
                    <button
                        onClick={() => onTabChange('scrape')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'scrape' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        {t('scraper.config_title')}
                    </button>
                    <button
                        onClick={() => onTabChange('fraud')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                            activeTab === 'fraud' ? 'bg-rose-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'
                        }`}
                    >
                        {t('fraud_settings.title')}
                    </button>
                    <button
                        onClick={() => onTabChange('sheets')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'sheets' ? 'bg-green-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        {t('google_settings.title')}
                    </button>
                    <button
                        onClick={() => onTabChange('telegram')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'telegram' ? 'bg-cyan-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        {t('telegram.settings_title')}
                    </button>
                    <button
                        onClick={() => onTabChange('environment')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'environment' ? 'bg-slate-700 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        {t('common.environment')}
                    </button>
                    <button
                        onClick={() => onTabChange('maintenance')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'maintenance' ? 'bg-amber-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        {t('common.maintenance')}
                    </button>
                </nav>
            </header>

            <main className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto">
                    {activeTab === 'ai' && <AISettings isInline={true} />}
                    {activeTab === 'memory' && <AIMemorySettings isInline={true} />}
                    {activeTab === 'scheduler' && <SchedulerSettings isInline={true} />}
                    {activeTab === 'scrape' && <ScrapeSettings isInline={true} />}
                    {activeTab === 'fraud' && <FraudSettings isInline={true} />}
                    {activeTab === 'sheets' && (
                        <div className="space-y-6">
                            <GoogleSheetsSync isInline={true} />
                            <GoogleSettings isInline={true} />
                        </div>
                    )}
                    {activeTab === 'telegram' && <TelegramSettings isInline={true} />}
                    {activeTab === 'environment' && <EnvironmentSettings />}
                    {activeTab === 'maintenance' && <MaintenancePanel />}
                </div>
            </main>
        </div>
    );
}
