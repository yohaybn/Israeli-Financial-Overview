import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ResultsExplorer } from './components/ResultsExplorer';
import { ScraperForm } from './components/ScraperForm';
import { ScrapeProgress } from './components/ScrapeProgress';
import { GoogleSheetsSync } from './components/GoogleSheetsSync';
import { LogViewer } from './components/LogViewer';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { ImportModal } from './components/ImportModal';
import { FinancialCommandCenter } from './components/dashboard/FinancialCommandCenter';
import { DashboardSidebar } from './components/dashboard/DashboardSidebar';
import { useScrapeResults, useUpdateTransactionCategory } from './hooks/useScraper';
import { useUnifiedData } from './hooks/useUnifiedData';
import { useEffect } from 'react';


function App() {
    const { t, i18n } = useTranslation();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [view, setView] = useState<'dashboard' | 'scrape' | 'logs' | 'configuration'>('dashboard');
    const [initialLogType, setInitialLogType] = useState<'server' | 'client' | 'ai'>('server');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<string>(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const { data: scrapeResults, isLoading: isLoadingScrape } = useScrapeResults();
    const { data: unifiedTransactions, isLoading: isLoadingUnified } = useUnifiedData();
    const [hasCheckedData, setHasCheckedData] = useState(false);

    // Default to scrape view if no data exists
    useEffect(() => {
        if (!hasCheckedData && !isLoadingScrape && !isLoadingUnified && scrapeResults && unifiedTransactions) {
            const noData = scrapeResults.length === 0 && unifiedTransactions.length === 0;
            if (noData) {
                setView('scrape');
            }
            setHasCheckedData(true);
        }
    }, [scrapeResults, unifiedTransactions, isLoadingScrape, isLoadingUnified, hasCheckedData]);

    const { mutate: updateCategory } = useUpdateTransactionCategory();

    const handleUpdateCategory = (transactionId: string, category: string) => {
        updateCategory({ transactionId, category });
    };

    const toggleLanguage = () => {
        const newLng = i18n.language === 'he' ? 'en' : 'he';
        i18n.changeLanguage(newLng);
    };

    const handleNavigateToAILogs = () => {
        setInitialLogType('ai');
        setView('logs');
    };

    return (
        <>
            <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
                <header className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 w-full">
                    <div className="container mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                                title={isSidebarCollapsed ? t('common.expand_sidebar') : t('common.collapse_sidebar')}
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span className="text-blue-600 text-2xl">₪</span> {t('common.title')}
                            </h1>
                        </div>

                        {/* View Switcher and Language Switcher */}
                        <div className="flex items-center gap-2 overflow-x-auto">
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setView('dashboard')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                    {t('dashboard.title', 'Dashboard')}
                                </button>
                                <button
                                    onClick={() => setView('scrape')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'scrape' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                    </svg>
                                    {t('common.scrape', 'Scrape')}
                                </button>
                                <button
                                    onClick={() => setView('logs')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'logs' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    {t('common.logs')}
                                </button>
                                <button
                                    onClick={() => setView('configuration')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'configuration' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    title={t('common.configuration')}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {t('common.configuration')}
                                </button>
                            </div>

                            <button
                                onClick={() => window.open('/GUIDE.html', '_blank')}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-xs font-bold text-gray-600 transition-colors border border-gray-200 flex items-center gap-1.5"
                                title={t('common.help')}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                ?
                            </button>
                            <button
                                onClick={toggleLanguage}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-xs font-bold text-gray-600 transition-colors border border-gray-200"
                            >
                                {i18n.language === 'he' ? t('common.english') : t('common.hebrew')}
                            </button>
                        </div>

                        <div className="text-sm text-gray-500 hidden md:block">
                            {t('common.version')}
                        </div>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    <div className={`transition-all duration-300 ease-in-out border-r border-gray-200 bg-gray-50 overflow-y-auto overflow-x-hidden ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-80 p-4 space-y-4 opacity-100'}`}>
                        {view === 'dashboard' ? (
                            <DashboardSidebar selectedMonth={selectedMonth} />
                        ) : view === 'scrape' ? (
                            <>
                                <ScraperForm />
                                <ScrapeProgress />

                                <button
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white border-2 border-dashed border-blue-200 rounded-lg text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-all font-medium shadow-sm group"
                                >
                                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    {t('explorer.import_files')}
                                </button>

                                <GoogleSheetsSync selectedFile={null} />
                                <div className="p-4 bg-yellow-50 rounded border border-yellow-200 text-xs text-yellow-800">
                                    <strong>{t('common.note')}:</strong> {t('common.prototype_note')}
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-gray-400 py-10">
                                <p className="text-sm">{t('common.sidebar_placeholder')}</p>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-hidden relative bg-gray-50/50">
                        <div className={view === 'dashboard' ? 'h-full overflow-y-auto p-4' : 'hidden'}>
                            <FinancialCommandCenter
                                selectedMonth={selectedMonth}
                                onMonthChange={setSelectedMonth}
                                onNavigateToLogs={handleNavigateToAILogs}
                                onUpdateCategory={handleUpdateCategory}
                            />
                        </div>
                        <div className={view === 'scrape' ? 'h-full' : 'hidden'}>
                            <ResultsExplorer onOpenImport={() => setIsImportModalOpen(true)} />
                        </div>
                        <div className={view === 'configuration' ? 'h-full' : 'hidden'}>
                            <ConfigurationPanel />
                        </div>
                        <div className={view === 'logs' ? 'h-full' : 'hidden'}>
                            <LogViewer initialType={initialLogType} />
                        </div>
                    </div>
                </div>
            </div>
            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={(results) => {
                    console.log('Import successful:', results);
                    // The query invalidation happens via the shared queryClient if we had a central one,
                    // but since ResultsExplorer handles its own state, we might need a way to trigger refresh.
                    // For now, simple success logging.
                }}
            />
        </>
    );
}

export default App;
