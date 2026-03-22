import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { useFinancialSummary } from '../../hooks/useFinancialSummary';
import { useUnifiedData } from '../../hooks/useUnifiedData';
import { useAISettings } from '../../hooks/useScraper';
import { useDashboardConfig } from '../../hooks/useDashboardConfig';
import { ExpenseProgressCenter } from './ExpenseProgressCenter';
import { IncomeProgressCenter } from './IncomeProgressCenter';
import { TransferDetectionBanner } from './TransferDetectionBanner';
import { AnalyticsDashboard, AnalyticsDayFilter } from '../AnalyticsDashboard';
import { BudgetHealthScore } from './BudgetHealthScore';
import { AnomalyAlerts } from './AnomalyAlerts';
import { CCPaymentDateSettings } from './CCPaymentDateSettings';
import { DashboardAIChat } from './DashboardAIChat';
import { CategoryDetailsModal } from './CategoryDetailsModal';
import { SubscriptionList } from './SubscriptionList';
import { MonthlyTransactionsCard } from './MonthlyTransactionsCard';
import { DayTransactionsModal } from './DayTransactionsModal';

interface FinancialCommandCenterProps {
    // Optional: if provided, uses these transactions (for backward compatibility or specific file view)
    // If not provided, fetches unified data internally.
    transactions?: Transaction[];
    selectedMonth: string;
    onMonthChange: (month: string) => void;
    onUpdateCategory?: (transactionId: string, category: string) => void;
    categories?: string[];
    onNavigateToLogs?: () => void;
}

export function FinancialCommandCenter({
    transactions: propTransactions,
    selectedMonth,
    onMonthChange,
    onUpdateCategory,
    categories,
    onNavigateToLogs
}: FinancialCommandCenterProps) {
    const { t, i18n } = useTranslation();
    const [showAnomalies, setShowAnomalies] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [selectedCategoryForModal, setSelectedCategoryForModal] = useState<string | null>(null);
    const [analyticsViewRange, setAnalyticsViewRange] = useState<'month' | 'all'>('month');
    const [analyticsDayFilter, setAnalyticsDayFilter] = useState<AnalyticsDayFilter | null>(null);

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

    const changeMonth = (offset: number) => {
        const date = new Date(selectedMonth + '-01');
        date.setMonth(date.getMonth() + offset);
        const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        onMonthChange(newMonth);
    };

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
        const base = analyticsViewRange === 'all' ? transactions : monthTransactions;
        if (!analyticsDayFilter) return base;

        return base.filter((transaction) => {
            const amount = transaction.chargedAmount ?? transaction.amount ?? 0;
            if (amount >= 0) return false;

            const date = parseTransactionDate(transaction.date);
            if (analyticsDayFilter.kind === 'weekday') {
                return date.getDay() === analyticsDayFilter.value;
            }
            return date.getDate() === analyticsDayFilter.value;
        });
    }, [transactions, monthTransactions, analyticsViewRange, analyticsDayFilter]);

    const tableScopeLabel = analyticsViewRange === 'all' ? t('analytics.all_months') : t('analytics.this_month');
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
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
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
            {/* Dashboard Header with Month Selector */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-200 flex-shrink-0">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-black text-gray-900 tracking-tight">
                                {t('dashboard.title')}
                            </h2>
                            <CCPaymentDateSettings />
                            <button
                                onClick={() => setShowAnomalies(!showAnomalies)}
                                className={`relative p-2 rounded-full transition-colors ${showAnomalies ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                title={t('dashboard.toggle_alerts')}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                {(summary.anomalies?.length || 0) > 0 && !showAnomalies && (
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-white" />
                                )}
                            </button>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                            {/* Month Selector Controls */}
                            <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors group">
                                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <span className="text-sm font-bold text-gray-700 min-w-[130px] text-center bg-gray-50/80 px-3 py-1 rounded-lg border border-gray-100">
                                {formatMonthDate(selectedMonth)}
                            </span>
                            <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors group">
                                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quick Stats & Budget Health */}
                <div className="flex-shrink-0 flex items-center gap-4 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                    {/* Safe to Spend KPI */}
                    {summary.safeToSpend !== undefined && (
                        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-emerald-100 shadow-sm px-5 py-3 flex flex-col items-center min-w-[130px]">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                                {t('dashboard.safe_to_spend')}
                            </span>
                            <span className={`text-xl font-black ${summary.safeToSpend >= 0 ? 'text-emerald-600' : 'text-rose-500'
                                }`}>
                                {new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
                                    style: 'currency',
                                    currency: 'ILS',
                                    maximumFractionDigits: 0
                                }).format(summary.safeToSpend)}
                            </span>
                            <span className="text-[9px] text-gray-400 mt-0.5">{t('dashboard.this_month')}</span>
                        </div>
                    )}
                    <BudgetHealthScore health={summary.budgetHealth} />
                </div>
            </div>

            {/* Anomaly Alerts Toggle */}
            {showAnomalies && (summary.anomalies?.length || 0) > 0 && (
                <div className="animate-fade-in-down" style={{ animationDelay: '50ms' }}>
                    <AnomalyAlerts anomalies={summary.anomalies} />
                </div>
            )}
            {showAnomalies && (!summary.anomalies || summary.anomalies.length === 0) && (
                <div className="animate-fade-in-down p-4 mb-4 text-center text-gray-500 text-sm bg-gray-50 rounded-xl border border-gray-100">
                    {t('dashboard.no_alerts')}
                </div>
            )}

            {/* Expense & Income Progress - Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                />
                <IncomeProgressCenter
                    alreadyReceived={summary.income.alreadyReceived}
                    alreadyReceivedTxns={summary.income.alreadyReceivedTxns}
                    expectedInflow={summary.income.expectedInflow}
                    expectedInflowTxns={summary.income.expectedInflowTxns}
                    totalProjected={summary.income.totalProjected}
                    upcomingIncome={summary.upcomingFixed.filter(i => i.type === 'income')}
                    categories={availableCategories}
                    onUpdateCategory={onUpdateCategory}
                />
            </div>
            {/* Internal Transfers Banner - Moved to less prominent location */}
            <div className="pt-2">
                <TransferDetectionBanner
                    count={summary.internalTransfers.count}
                    total={summary.internalTransfers.total}
                    transactions={summary.internalTransfers.transactions}
                />
            </div>

            {/* Subscriptions Section */}
            <div className="pt-2 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <SubscriptionList
                        subscriptions={summary.subscriptions || []}
                        categories={availableCategories}
                        onUpdateCategory={onUpdateCategory}
                    />
                    <MonthlyTransactionsCard
                        transactions={transactionsForTable}
                        categories={availableCategories}
                        onUpdateCategory={onUpdateCategory}
                        scopeLabel={tableScopeLabel}
                        filterLabel={tableFilterLabel}
                        onClearFilter={() => setAnalyticsDayFilter(null)}
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
                    onViewRangeChange={setAnalyticsViewRange}
                    onDayFilterChange={setAnalyticsDayFilter}
                    activeDayFilter={analyticsDayFilter}
                />
            </div>

            {/* Dashboard AI Chat Drawer */}
            <DashboardAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                scope="all"
                contextMonth={selectedMonth}
                onNavigateToLogs={onNavigateToLogs}
            />

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

            {/* Floating AI Chat Button */}
            {!isChatOpen && (
                <button
                    onClick={() => setIsChatOpen(true)}
                    className="fixed bottom-6 right-6 p-4 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all z-40 group"
                    title={t('dashboard.open_ai_chat')}
                >
                    <div className="absolute inset-0 bg-white/20 rounded-full animate-ping opacity-0 group-hover:opacity-100 transition-opacity" />
                    <svg className="w-6 h-6 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 8h.01" />
                    </svg>
                </button>
            )}
        </div>
    );
}
