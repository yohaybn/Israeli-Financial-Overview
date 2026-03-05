import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReloadDatabase, useResetToDefaults } from '../hooks/useScraper';
import { AISettings } from './AISettings';
import { PipelineSettings } from './PipelineSettings';
import { GoogleSettings } from './GoogleSettings';

type ConfigTab = 'ai' | 'pipeline' | 'sheets' | 'maintenance';

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

                <nav className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'ai' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        🧠 {t('ai_settings.title', 'AI Settings')}
                    </button>
                    <button
                        onClick={() => setActiveTab('pipeline')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'pipeline' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        ⚙️ {t('pipeline.title', 'Pipeline')}
                    </button>
                    <button
                        onClick={() => setActiveTab('sheets')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'sheets' ? 'bg-green-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        📊 {t('google_settings.title', 'Google Sheets')}
                    </button>
                    <button
                        onClick={() => setActiveTab('maintenance')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'maintenance' ? 'bg-amber-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        🛠️ {t('common.maintenance', 'Maintenance')}
                    </button>
                </nav>
            </header>

            <main className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto">
                    {activeTab === 'ai' && <AISettings isInline={true} />}
                    {activeTab === 'pipeline' && <PipelineSettings />}
                    {activeTab === 'sheets' && <GoogleSettings isInline={true} />}
                    {activeTab === 'maintenance' && <MaintenancePanel />}
                </div>
            </main>
        </div>
    );
}

function MaintenancePanel() {
    const { t } = useTranslation();
    const { mutate: reloadDb, isPending } = useReloadDatabase();
    const { mutate: resetAll, isPending: isResetting } = useResetToDefaults();

    const handleReload = () => {
        if (window.confirm(t('maintenance.confirm_reload'))) {
            reloadDb(undefined, {
                onSuccess: () => {
                    alert(t('maintenance.reload_success'));
                },
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                    alert(`Reload failed: ${errorMsg}`);
                }
            });
        }
    };

    const handleReset = () => {
        console.log('handleReset clicked');
        const confirmMsg = t('table.confirm_reset_all');
        if (window.confirm(confirmMsg)) {
            console.log('Confirmation received, calling resetAll mutation...');
            resetAll(undefined, {
                onSuccess: () => {
                    console.log('Reset mutation success');
                    alert(t('maintenance.reset_success'));
                },
                onError: (err: any) => {
                    console.error('Reset mutation failed:', err);
                    const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                    alert(`Reset failed: ${errorMsg}`);
                }
            });
        } else {
            console.log('Reset cancelled by user');
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-2">{t('common.maintenance')}</h3>
                <p className="text-gray-600 text-sm mb-6">
                    {t('common.maintenance_desc')}
                </p>

                <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-between mb-6">
                    <div>
                        <h4 className="font-bold text-amber-900 mb-1">{t('maintenance.reload_title')}</h4>
                        <p className="text-amber-800 text-xs opacity-80 max-w-lg">
                            {t('maintenance.reload_desc')}
                        </p>
                    </div>

                    <button
                        onClick={handleReload}
                        disabled={isPending}
                        className="bg-white text-amber-600 border-2 border-amber-200 hover:border-amber-600 px-6 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isPending ? t('common.loading') : t('table.reset_columns')}
                    </button>
                </div>

                <div className="p-6 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-between">
                    <div>
                        <h4 className="font-bold text-red-900 mb-1">{t('table.reset_all')}</h4>
                        <p className="text-red-800 text-xs opacity-80 max-w-lg">
                            {t('table.reset_all_desc')}
                        </p>
                    </div>

                    <button
                        onClick={handleReset}
                        disabled={isResetting}
                        className="bg-white text-red-600 border-2 border-red-200 hover:border-red-600 px-6 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isResetting ? t('common.loading') : t('common.reset_to_defaults')}
                    </button>
                </div>
            </div>
        </div>
    );
}
