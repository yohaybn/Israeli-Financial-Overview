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
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { OnboardingResumeBanner } from './components/onboarding/OnboardingResumeBanner';
import { useOnboarding } from './contexts/OnboardingContext';
import { DashboardAlertsDropdown } from './components/dashboard/DashboardAlertsDropdown';
import { isDemoMode } from './demo/isDemo';


function App() {
    const { t, i18n } = useTranslation();
    const onboarding = useOnboarding();
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
    const { categorizationFailure, clearCategorizationFailure, transactionReviewAlert, clearTransactionReviewAlert } =
        useSocket();
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
            <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
                <header className="bg-white border-b border-gray-200/80 shadow-sm z-10 w-full">
                    <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                            <h1 className="text-base sm:text-lg font-bold text-emerald-800 tracking-tight truncate min-w-0 flex-1">
                                {t('common.title')}
                            </h1>
                            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                                {view === 'dashboard' && <DashboardAlertsDropdown selectedMonth={selectedMonth} />}

                                <div className="flex items-center gap-0.5 border-s border-gray-200 ps-1.5 ms-0.5">
                                    <button
                                        type="button"
                                        onClick={toggleLanguage}
                                        className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-emerald-800 hover:bg-emerald-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                        aria-label={t('common.language_toggle_aria')}
                                        title={i18n.language === 'he' ? t('common.english') : t('common.hebrew')}
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={1.75}
                                                d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => window.open(`${import.meta.env.BASE_URL}GUIDE.html`, '_blank')}
                                        className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-emerald-800 hover:bg-emerald-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                        title={t('common.help')}
                                        aria-label={t('common.help')}
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={1.75}
                                                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                    </button>
                                    {onboarding.completed ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (window.confirm(t('onboarding.rerun_confirm'))) {
                                                    onboarding.restartWizard();
                                                }
                                            }}
                                            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                            title={t('onboarding.rerun_wizard')}
                                            aria-label={t('onboarding.rerun_wizard')}
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={1.75}
                                                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                                                />
                                            </svg>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setView('configuration')}
                                            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-emerald-800 hover:bg-emerald-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                            title={t('common.configuration')}
                                            aria-label={t('common.open_configuration_aria')}
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={1.75}
                                                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                                />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <nav
                            className="flex flex-nowrap overflow-x-auto scrollbar-none items-stretch gap-0.5 sm:gap-3 min-w-0 w-full justify-start sm:justify-center -mx-1 px-1"
                            role="tablist"
                            aria-label={t('common.main_navigation_aria')}
                        >
                            {(
                                [
                                    ['dashboard', t('common.dashboard')] as const,
                                    ['scrape', t('common.scrape')] as const,
                                    ['logs', t('common.logs')] as const,
                                    ['configuration', t('common.configuration')] as const,
                                ] as const
                            ).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={view === key}
                                    onClick={() => setView(key)}
                                    className={`shrink-0 px-2 sm:px-3 py-2 text-sm transition-colors border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 rounded-t ${
                                        view === key
                                            ? 'font-semibold text-emerald-800 border-emerald-600'
                                            : 'font-medium text-gray-500 border-transparent hover:text-gray-800'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </header>

                {isDemoMode() && (
                    <div
                        className="shrink-0 bg-violet-50 border-b border-violet-200 text-violet-950 text-center text-sm py-2 px-4"
                        role="status"
                    >
                        {t('common.demo_banner')}
                    </div>
                )}

                <AppLockBanner />

                {onboarding.showResumeBanner && <OnboardingResumeBanner />}

                {transactionReviewAlert && transactionReviewAlert.count > 0 && (
                    <div
                        className="shrink-0 bg-sky-50 border-b border-sky-200 px-4 py-3 text-sky-950 flex flex-wrap items-center gap-3 justify-between"
                        role="alert"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm">{t('transaction_review.banner_title')}</p>
                            <p className="text-sm text-sky-900/90 break-words">
                                {t('transaction_review.banner_detail', { count: transactionReviewAlert.count })}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setView('dashboard')}
                                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium"
                            >
                                {t('transaction_review.open_dashboard')}
                            </button>
                            <button
                                type="button"
                                onClick={clearTransactionReviewAlert}
                                className="px-3 py-1.5 text-sm text-sky-900/80 hover:underline"
                            >
                                {t('transaction_review.dismiss')}
                            </button>
                        </div>
                    </div>
                )}

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
                    <div className="flex-1 overflow-hidden relative bg-white">
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

            {onboarding.showModal && <OnboardingWizard />}
        </>
    );
}

export default App;
