import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AISettings } from './AISettings';
import { ScrapeSettings } from './ScrapeSettings';
import { MaintenancePanel } from './MaintenancePanel';
import { SchedulerSettings } from './SchedulerSettings';
import { GoogleSettings } from './GoogleSettings';
import { EnvironmentSettings } from './EnvironmentSettings';
import { TelegramSettings } from './TelegramSettings';

type ConfigTab = 'ai' | 'scheduler' | 'scrape' | 'sheets' | 'telegram' | 'maintenance' | 'environment';

export function ConfigurationPanel() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<ConfigTab>('ai');

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <header className="bg-white border-b border-gray-200 p-6 shrink-0">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900">{t('common.configuration', 'Configuration')}</h1>
                        <p className="text-gray-500">{t('common.configuration_desc', 'Manage system settings and integrations')}</p>
                    </div>
                </div>

                <nav className="flex gap-2 scrollbar-hide overflow-x-auto pb-2">
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'ai' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        🧠 {t('ai_settings.title', 'AI Settings')}
                    </button>
                    <button
                        onClick={() => setActiveTab('scheduler')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'scheduler' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        ⏱️ {t('scheduler.title', 'Scheduler')}
                    </button>
                    <button
                        onClick={() => setActiveTab('scrape')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'scrape' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        ⚙️ {t('scraper.config_title', 'Scrape Configuration')}
                    </button>
                    <button
                        onClick={() => setActiveTab('sheets')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'sheets' ? 'bg-green-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        📊 {t('google_settings.title', 'Google Sheets')}
                    </button>
                    <button
                        onClick={() => setActiveTab('telegram')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'telegram' ? 'bg-cyan-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        📱 {t('telegram.settings_title', 'Telegram')}
                    </button>
                    <button
                        onClick={() => setActiveTab('environment')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'environment' ? 'bg-slate-700 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        🌐 {t('common.environment', 'Environment')}
                    </button>
                    <button
                        onClick={() => setActiveTab('maintenance')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'maintenance' ? 'bg-amber-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        🛠️ {t('common.maintenance', 'Maintenance')}
                    </button>
                </nav>
            </header>

            <main className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto">
                    {activeTab === 'ai' && <AISettings isInline={true} />}
                    {activeTab === 'scheduler' && <SchedulerSettings isInline={true} />}
                    {activeTab === 'scrape' && <ScrapeSettings isInline={true} />}
                    {activeTab === 'sheets' && <GoogleSettings isInline={true} />}
                    {activeTab === 'telegram' && <TelegramSettings isInline={true} />}
                    {activeTab === 'environment' && <EnvironmentSettings />}
                    {activeTab === 'maintenance' && <MaintenancePanel />}
                </div>
            </main>
        </div>
    );
}
