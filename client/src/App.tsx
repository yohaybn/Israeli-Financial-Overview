import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogViewer } from './components/LogViewer';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { ImportModal } from './components/ImportModal';
import { FinancialCommandCenter } from './components/dashboard/FinancialCommandCenter';
import { useScrapeResults, useUpdateTransactionCategory, useRecategorizeAll } from './hooks/useScraper';
import { useSocket } from './hooks/useSocket';
import { useUnifiedData } from './hooks/useUnifiedData';
import { ScrapeWorkspace } from './components/scrape/ScrapeWorkspace';
import { AppLockBanner } from './components/AppLockBanner';


function App() {
    const { t, i18n } = useTranslation();
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
    const { categorizationFailure, clearCategorizationFailure } = useSocket();
    const { mutate: recategorizeAll, isPending: isRecategorizingCat } = useRecategorizeAll();

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

    const openAiSettingsTab = () => {
        sessionStorage.setItem('configOpenTab', 'ai');
        setView('configuration');
    };

    return (
        <>
            <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
                <header className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 w-full">
                    <div className="container mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span className="text-blue-600 text-2xl">₪</span> {t('common.title')}
                            </h1>
                        </div>

                        {/* View Switcher and Language Switcher */}
                        <div className="flex items-center gap-2 overflow-x-auto max-w-full">
                            <div className="flex bg-gray-100 p-1 rounded-lg shrink-0">
                                <button
                                    onClick={() => setView('dashboard')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {t('common.dashboard')}
                                </button>
                                <button
                                    onClick={() => setView('scrape')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'scrape' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {t('common.scrape')}
                                </button>
                                <button
                                    onClick={() => setView('logs')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'logs' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {t('common.logs')}
                                </button>
                                <button
                                    onClick={() => setView('configuration')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'configuration' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    title={t('common.configuration')}
                                >
                                    {t('common.configuration')}
                                </button>
                            </div>

                            <button
                                onClick={() => window.open('/GUIDE.html', '_blank')}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-xs font-bold text-gray-600 transition-colors border border-gray-200 flex items-center gap-1.5"
                                title={t('common.help')}
                            >
                                [?]
                            </button>
                            <button
                                onClick={toggleLanguage}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-xs font-bold text-gray-600 transition-colors border border-gray-200"
                            >
                                {i18n.language === 'he' ? 'EN' : 'HE'}
                            </button>
                        </div>

                        <div className="text-sm text-gray-500 hidden md:block">
                            {t('common.version')}
                        </div>
                    </div>
                </header>

                <AppLockBanner />

                {categorizationFailure && (
                    <div
                        className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-3 text-amber-950 flex flex-wrap items-center gap-3 justify-between"
                        role="alert"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm">{t('categorization.banner_title')}</p>
                            <p className="text-sm text-amber-900/90 break-words">
                                {t('categorization.banner_detail', { error: categorizationFailure.error })}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                                type="button"
                                disabled={isRecategorizingCat}
                                onClick={() =>
                                    recategorizeAll(false, {
                                        onSuccess: (data) => {
                                            clearCategorizationFailure();
                                            if (data.error) {
                                                window.alert(t('ai_settings.recategorize_ai_failed', { error: data.error, count: data.count }));
                                            }
                                        },
                                        onError: (err: unknown) => {
                                            window.alert(
                                                t('common.error_with_message', {
                                                    error: err instanceof Error ? err.message : t('common.unknown_error'),
                                                })
                                            );
                                        },
                                    })
                                }
                                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50"
                            >
                                {isRecategorizingCat ? t('common.loading') : t('categorization.retry')}
                            </button>
                            <button
                                type="button"
                                onClick={openAiSettingsTab}
                                className="px-3 py-1.5 rounded-lg border border-amber-300 text-sm font-medium hover:bg-amber-100"
                            >
                                {t('categorization.open_ai_settings')}
                            </button>
                            <button
                                type="button"
                                onClick={clearCategorizationFailure}
                                className="px-3 py-1.5 text-sm text-amber-900/80 hover:underline"
                            >
                                {t('categorization.dismiss')}
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 overflow-hidden relative bg-gray-50/50">
                        <div className={view === 'dashboard' ? 'h-full overflow-y-auto p-4' : 'hidden'}>
                            <FinancialCommandCenter
                                selectedMonth={selectedMonth}
                                onMonthChange={setSelectedMonth}
                                onNavigateToLogs={handleNavigateToAILogs}
                                onUpdateCategory={handleUpdateCategory}
                            />
                        </div>
                        <div className={view === 'scrape' ? 'h-full overflow-y-auto' : 'hidden'}>
                            <ScrapeWorkspace onOpenImport={() => setIsImportModalOpen(true)} />
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
