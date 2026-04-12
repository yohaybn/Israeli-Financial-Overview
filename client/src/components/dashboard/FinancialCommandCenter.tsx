import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { getApiRoot } from '../../lib/api';
import { useFinancialSummary } from '../../hooks/useFinancialSummary';
import { useUnifiedData } from '../../hooks/useUnifiedData';
import { useAISettings } from '../../hooks/useScraper';
import { useDashboardConfig } from '../../hooks/useDashboardConfig';
import { ExpenseProgressCenter } from './ExpenseProgressCenter';
import { IncomeProgressCenter } from './IncomeProgressCenter';
import { AnalyticsDashboard, AnalyticsDayFilter } from '../AnalyticsDashboard';
import { CCPaymentDateSettings } from './CCPaymentDateSettings';
import { CategoryDetailsModal } from './CategoryDetailsModal';
import { SubscriptionList } from './SubscriptionList';
import { MonthlyTransactionsCard } from './MonthlyTransactionsCard';
import { DayTransactionsModal } from './DayTransactionsModal';
import { AllTransactionsSearchModal } from './AllTransactionsSearchModal';
import { getInitialCollapsedOnMobile } from '../../hooks/useInitialCollapsedOnMobile';
import { TopInsightsCard } from './TopInsightsCard';

function shiftMonth(ym: string, delta: number): string {
    const d = new Date(ym + '-01');
    d.setMonth(d.getMonth() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface FinancialCommandCenterProps {
    // Optional: if provided, uses these transactions (for backward compatibility or specific file view)
    // If not provided, fetches unified data internally.
    transactions?: Transaction[];
    selectedMonth: string;
    onMonthChange: (month: string) => void;
    onUpdateCategory?: (transactionId: string, category: string) => void;
    categories?: string[];
}

export function FinancialCommandCenter({
    transactions: propTransactions,
    selectedMonth,
    onMonthChange,
    onUpdateCategory,
    categories,
}: FinancialCommandCenterProps) {
    const { t, i18n } = useTranslation();
    const [selectedCategoryForModal, setSelectedCategoryForModal] = useState<string | null>(null);
    const [analyticsDayFilter, setAnalyticsDayFilter] = useState<AnalyticsDayFilter | null>(null);
    const [showAllTransactionsSearch, setShowAllTransactionsSearch] = useState(false);
    const [cardsCollapsedOnMobile] = useState(() => getInitialCollapsedOnMobile());
    const [exportingKey, setExportingKey] = useState<'all-csv' | 'all-json' | 'month-csv' | 'month-json' | null>(null);
    const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
    const downloadMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!downloadMenuOpen) return;
        const onDoc = (e: MouseEvent) => {
            if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
                setDownloadMenuOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setDownloadMenuOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [downloadMenuOpen]);

    // If props provided, use them. Otherwise fetch unified data.
    const { data: unifiedTransactions, isLoading /*, error*/ } = useUnifiedData();
    const { data: aiSettings } = useAISettings();
    const transactions = propTransactions || unifiedTransactions || [];
    const availableCategories = categories || aiSettings?.categories || [];

    const { config } = useDashboardConfig();
    const summary = useFinancialSummary(
        transactions,
        selectedMonth,
        config.ccPaymentDate,
        config.forecastMonths ?? 6,
        config.customCCKeywords ?? []
    );

    // Calculate available months from data
    // const availableMonths = useMemo(() => {
    //     const months = new Set<string>();
    //     transactions.forEach(t => {
    //         if (t.date) months.add(t.date.substring(0, 7));
    //     });
    //     return Array.from(months).sort().reverse();
    // }, [transactions]);

    const formatMonthDate = (dateStr: string) =>
        new Date(dateStr + '-01').toLocaleDateString(
            i18n.language === 'he' ? 'he-IL' : 'en-US',
            { month: 'long', year: 'numeric' }
        );

    const downloadExport = async (scope: 'all' | 'month', format: 'csv' | 'json') => {
        const key = `${scope}-${format}` as const;
        setExportingKey(key);
        try {
            const params = new URLSearchParams({ format });
            if (scope === 'month') params.set('month', selectedMonth);
            const res = await fetch(`${getApiRoot()}/results/export?${params.toString()}`);
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const disp = res.headers.get('Content-Disposition');
            let filename = `transactions.${format}`;
            const m = disp && /filename="([^"]+)"/.exec(disp);
            if (m) filename = m[1];
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch {
            window.alert(t('dashboard.export_failed'));
        } finally {
            setExportingKey(null);
        }
    };

    const runDownload = (scope: 'all' | 'month', format: 'csv' | 'json') => {
        setDownloadMenuOpen(false);
        void downloadExport(scope, format);
    };

    const adjacentMonths = useMemo(
        () => [shiftMonth(selectedMonth, -1), selectedMonth, shiftMonth(selectedMonth, 1)] as const,
        [selectedMonth]
    );

    const parseTransactionDate = (dateValue: string) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return new Date(`${dateValue}T12:00:00`);
        }
        return new Date(dateValue);
    };

    const monthTransactions = useMemo(
        () => transactions.filter(t => t.date.startsWith(selectedMonth)),
        [transactions, selectedMonth]
    );

    const transactionsForTable = useMemo(() => {
        if (!analyticsDayFilter) return monthTransactions;

        return monthTransactions.filter((transaction) => {
            const amount = transaction.chargedAmount ?? transaction.amount ?? 0;
            if (amount >= 0) return false;

            const date = parseTransactionDate(transaction.date);
            if (analyticsDayFilter.kind === 'weekday') {
                return date.getDay() === analyticsDayFilter.value;
            }
            return date.getDate() === analyticsDayFilter.value;
        });
    }, [monthTransactions, analyticsDayFilter]);

    const tableScopeLabel = formatMonthDate(selectedMonth);
    const tableFilterLabel = analyticsDayFilter
        ? t(
            analyticsDayFilter.kind === 'weekday'
                ? 'analytics.weekday_filter_label'
                : 'analytics.month_day_filter_label',
            { label: analyticsDayFilter.label }
        )
        : undefined;
    const dayModalTitle = analyticsDayFilter
        ? t('analytics.transactions_for_day_scope', { filter: tableFilterLabel, scope: tableScopeLabel })
        : '';

    if (isLoading && !propTransactions) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-12">
                <div className="w-12 h-12 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-400">{t('common.loading')}</p>
            </div>
        );
    }

    if (!transactions || transactions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 p-8">
                <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                    <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
                <p className="text-xl font-light text-gray-400">{t('dashboard.select_data')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-1 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between pb-1">
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                        {t('dashboard.overview_title')}
                    </h2>
                </div>
                <div
                    className="flex flex-row flex-wrap items-center justify-center gap-2 sm:gap-3 shrink-0 w-full lg:w-auto lg:justify-end"
                    dir="ltr"
                >
                    <div
                        className="inline-flex max-w-full overflow-x-auto scrollbar-none rounded-full bg-gray-100/90 p-1 border border-gray-200/60 shadow-inner"
                        role="group"
                        aria-label={t('dashboard.month_picker_aria')}
                    >
                        {adjacentMonths.map((ym) => (
                            <button
                                key={ym}
                                type="button"
                                onClick={() => onMonthChange(ym)}
                                className={`px-2.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                                    ym === selectedMonth
                                        ? 'bg-white text-emerald-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-800'
                                }`}
                            >
                                {formatMonthDate(ym)}
                            </button>
                        ))}
                    </div>
                    <div className="relative" ref={downloadMenuRef}>
                        <button
                            type="button"
                            id="dashboard-export-download-trigger"
                            aria-haspopup="menu"
                            aria-expanded={downloadMenuOpen}
                            aria-controls="dashboard-export-download-menu"
                            disabled={exportingKey !== null}
                            onClick={() => setDownloadMenuOpen((o) => !o)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-gray-100/90 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-800 border border-gray-200/60 shadow-inner hover:bg-white hover:text-emerald-800 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 whitespace-nowrap"
                        >
                            {exportingKey !== null ? (
                                '…'
                            ) : (
                                <>
                                    <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                        />
                                    </svg>
                                    {t('dashboard.download')}
                                    <svg
                                        className={`w-4 h-4 opacity-70 transition-transform ${downloadMenuOpen ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        aria-hidden
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </>
                            )}
                        </button>
                        {downloadMenuOpen && exportingKey === null && (
                            <div
                                id="dashboard-export-download-menu"
                                role="menu"
                                aria-labelledby="dashboard-export-download-trigger"
                                className="absolute end-0 top-full z-50 mt-1 min-w-[min(100vw-2rem,16rem)] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                            >
                                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                    {t('dashboard.download_section_all')}
                                </p>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full px-3 py-2 text-start text-sm text-gray-800 hover:bg-emerald-50"
                                    onClick={() => runDownload('all', 'csv')}
                                >
                                    {t('dashboard.download_all_csv')}
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full px-3 py-2 text-start text-sm text-gray-800 hover:bg-emerald-50"
                                    onClick={() => runDownload('all', 'json')}
                                >
                                    {t('dashboard.download_all_json')}
                                </button>
                                <div className="my-1 border-t border-gray-100" />
                                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                    {t('dashboard.download_section_month', { month: formatMonthDate(selectedMonth) })}
                                </p>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full px-3 py-2 text-start text-sm text-gray-800 hover:bg-emerald-50"
                                    onClick={() => runDownload('month', 'csv')}
                                >
                                    {t('dashboard.download_month_csv')}
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full px-3 py-2 text-start text-sm text-gray-800 hover:bg-emerald-50"
                                    onClick={() => runDownload('month', 'json')}
                                >
                                    {t('dashboard.download_month_json')}
                                </button>
                            </div>
                        )}
                    </div>
                    <CCPaymentDateSettings />
                </div>
            </div>

            <div className="animate-fade-in-up max-w-6xl mx-auto w-full" style={{ animationDelay: '90ms' }}>
                <TopInsightsCard />
            </div>

            {/* Income & Detailed spending — same card chrome as Subscriptions / Transactions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start animate-fade-in-up" style={{ animationDelay: '120ms' }}>
                <IncomeProgressCenter
                    alreadyReceived={summary.income.alreadyReceived}
                    alreadyReceivedTxns={summary.income.alreadyReceivedTxns}
                    expectedInflow={summary.income.expectedInflow}
                    expectedInflowTxns={summary.income.expectedInflowTxns}
                    totalProjected={summary.income.totalProjected}
                    upcomingIncome={summary.upcomingFixed.filter(i => i.type === 'income')}
                    categories={availableCategories}
                    onUpdateCategory={onUpdateCategory}
                    defaultCollapsed={cardsCollapsedOnMobile}
                />
                <ExpenseProgressCenter
                    alreadySpent={summary.expenses.alreadySpent}
                    alreadySpentTxns={summary.expenses.alreadySpentTxns}
                    remainingPlanned={summary.expenses.remainingPlanned}
                    remainingPlannedTxns={summary.expenses.remainingPlannedTxns}
                    variableForecast={summary.expenses.variableForecast}
                    expenseTxnCount={summary.expenses.expenseTxnCount}
                    historicalAvgMonthlyTxnCount={summary.expenses.historicalAvgMonthlyTxnCount}
                    expectedTxnCountToDate={summary.expenses.expectedTxnCountToDate}
                    isCurrentMonth={summary.isCurrentMonth}
                    remainingDays={summary.remainingDays}
                    monthsAnalyzed={summary.historicalBaseline?.monthsAnalyzed}
                    totalProjected={summary.expenses.totalProjected}
                    byCategory={summary.expenses.byCategory}
                    categories={availableCategories}
                    onUpdateCategory={onUpdateCategory}
                    onCategoryClick={setSelectedCategoryForModal}
                    defaultCollapsed={cardsCollapsedOnMobile}
                />
            </div>

            {/* Subscriptions & Transactions */}
            <div className="pt-2 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <SubscriptionList
                        subscriptions={summary.subscriptions || []}
                        categories={availableCategories}
                        onUpdateCategory={onUpdateCategory}
                        selectedMonth={selectedMonth}
                        monthExpenseTotal={summary.expenses.alreadySpent}
                        defaultCollapsed={cardsCollapsedOnMobile}
                    />
                    <MonthlyTransactionsCard
                        transactions={transactionsForTable}
                        categories={availableCategories}
                        onUpdateCategory={onUpdateCategory}
                        scopeLabel={tableScopeLabel}
                        filterLabel={tableFilterLabel}
                        onClearFilter={() => setAnalyticsDayFilter(null)}
                        customCCKeywords={config.customCCKeywords ?? []}
                        defaultCollapsed={cardsCollapsedOnMobile}
                        endActions={
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAllTransactionsSearch(true);
                                }}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap"
                            >
                                {t('dashboard.search_all_transactions')}
                            </button>
                        }
                    />
                </div>
            </div>

            {/* Existing Analytics Charts (Category Pie + Monthly Trend + Top Merchants) */}
            <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-blue-500 rounded-lg flex items-center justify-center shadow-sm">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                        {t('dashboard.detailed_analytics')}
                    </h3>
                </div>
                {/* Note: AnalyticsDashboard might need updating to filter by month if it doesn't already, 
                    but passing filtered transactions is a good start. 
                    However, `summary` logic already filters by month, so we should filter 
                    transactions passed to AnalyticsDashboard to match the selected month.
                */}
                <AnalyticsDashboard
                    transactions={monthTransactions}
                    allTransactions={transactions}
                    onCategoryClick={setSelectedCategoryForModal}
                    customCCKeywords={config.customCCKeywords}
                    onDayFilterChange={setAnalyticsDayFilter}
                    activeDayFilter={analyticsDayFilter}
                    categories={availableCategories}
                    categoryMeta={aiSettings?.categoryMeta}
                    chartDefaultSingleMonth={selectedMonth}
                />
            </div>

            {/* Category Details Modal */}
            {selectedCategoryForModal && (
                <CategoryDetailsModal
                    categoryName={selectedCategoryForModal!}
                    transactions={transactions}
                    categories={availableCategories}
                    onUpdateCategory={onUpdateCategory}
                    initialMonth={selectedMonth}
                    customCCKeywords={config.customCCKeywords}
                    onClose={() => setSelectedCategoryForModal(null)}
                />
            )}

            {analyticsDayFilter && (
                <DayTransactionsModal
                    title={dayModalTitle}
                    transactions={transactionsForTable}
                    categories={availableCategories}
                    onUpdateCategory={onUpdateCategory}
                    onClose={() => setAnalyticsDayFilter(null)}
                />
            )}

            {showAllTransactionsSearch && (
                <AllTransactionsSearchModal
                    transactions={transactions}
                    categories={availableCategories}
                    onUpdateCategory={onUpdateCategory}
                    onClose={() => setShowAllTransactionsSearch(false)}
                />
            )}

        </div>
    );
}
