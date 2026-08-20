import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingBag } from 'lucide-react';
import { Transaction } from '@app/shared';
import { TransactionTable } from '../TransactionTable';
import { VariableForecastModal } from './VariableForecastModal';
import { CategoryIcon } from '../../utils/categoryIcons';
import { DashboardCardHeader, dashboardCardShellClass } from './DashboardCardChrome';

interface ExpenseProgressCenterProps {
    alreadySpent: number;
    alreadySpentTxns?: Transaction[];
    remainingPlanned: number;
    remainingPlannedTxns?: Transaction[];
    variableForecast?: number;
    expenseTxnCount?: number;
    historicalAvgMonthlyTxnCount?: number;
    expectedTxnCountToDate?: number;
    isCurrentMonth?: boolean;
    monthsAnalyzed?: number;
    remainingDays?: number;
    totalProjected: number;
    byCategory: {
        name: string;
        spent: number;
        projected: number;
        historicalAvg?: number;
        historicalStdDev?: number;
        transactions?: Transaction[];
        upcomingBillsAmount?: number;
        variableForecastAmount?: number;
        upcomingBills?: any[];
    }[];
    categories?: string[];
    onUpdateCategory?: (transactionId: string, category: string) => void;
    onCategoryClick?: (categoryName: string) => void;
    /** When true, section body starts collapsed (e.g. mobile default). */
    defaultCollapsed?: boolean;
    collapseAllSignal?: number;
}

type Health = 'healthy' | 'caution' | 'critical';

function categoryHealth(cat: ExpenseProgressCenterProps['byCategory'][0]): Health {
    if (cat.projected > 0 && cat.spent > cat.projected) return 'critical';
    if (cat.historicalAvg && cat.historicalAvg > 0 && cat.spent > cat.historicalAvg * 1.12) return 'critical';
    if (cat.historicalAvg && cat.historicalAvg > 0 && cat.spent > cat.historicalAvg * 1.05) return 'caution';
    return 'healthy';
}

export function ExpenseProgressCenter({
    alreadySpent,
    alreadySpentTxns = [],
    remainingPlanned,
    remainingPlannedTxns = [],
    variableForecast = 0,
    expenseTxnCount = 0,
    historicalAvgMonthlyTxnCount = 0,
    expectedTxnCountToDate = 0,
    isCurrentMonth = false,
    monthsAnalyzed,
    remainingDays = 0,
    totalProjected,
    byCategory,
    categories,
    onUpdateCategory,
    onCategoryClick,
    defaultCollapsed = false,
    collapseAllSignal = 0,
}: ExpenseProgressCenterProps) {
    const { t, i18n } = useTranslation();
    const isHebrew = i18n.language?.startsWith('he');
    const [selectedKpi, setSelectedKpi] = useState<'already_spent' | 'remaining_planned' | null>(null);
    const [showForecastModal, setShowForecastModal] = useState(false);
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    useEffect(() => {
        if (collapseAllSignal > 0) setCollapsed(true);
    }, [collapseAllSignal]);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const spentPercent = totalProjected > 0 ? Math.min((alreadySpent / totalProjected) * 100, 100) : 0;
    const plannedPercent = totalProjected > 0 ? Math.min((remainingPlanned / totalProjected) * 100, 100 - spentPercent) : 0;

    const sortedCategories = useMemo(() => {
        const list = [...byCategory];
        list.sort((a, b) => b.spent - a.spent);
        return list;
    }, [byCategory]);


    return (
        <>
            <div className={dashboardCardShellClass}>
                <DashboardCardHeader
                    collapsed={collapsed}
                    onToggle={() => setCollapsed((c) => !c)}
                    icon={<ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden />}
                    iconTileClassName="bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-200/80"
                    title={t('dashboard.detailed_spending_title', { count: byCategory.length })}
                    subtitle={
                        <>
                            {t('dashboard.total_projected')}:{' '}
                            <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(totalProjected)}</span>
                        </>
                    }
                />

                {!collapsed && (
                    <div className="px-6 pb-8 sm:px-8 space-y-4 pt-0">
                        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center shadow-sm shrink-0">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('dashboard.expense_progress')}</p>
                                        <p className="text-2xl font-black text-gray-900 tabular-nums">{formatCurrency(totalProjected)}</p>
                                        <p className="text-xs text-gray-400">{t('dashboard.total_projected')}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                                <div aria-hidden className="absolute left-0 top-0 h-full bg-gradient-to-r from-rose-500 to-rose-600 rounded-l-full transition-all duration-700" style={{ width: `${spentPercent}%` }} />
                                {plannedPercent > 0 && (
                                    <div
                                        aria-hidden
                                        className="absolute top-0 h-full overflow-hidden transition-all duration-700"
                                        style={{ left: `${spentPercent}%`, width: `${plannedPercent}%` }}
                                    >
                                        <div
                                            className="w-full h-full bg-rose-300"
                                            style={{
                                                backgroundImage:
                                                    'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.4) 4px, rgba(255,255,255,0.4) 8px)',
                                            }}
                                        />
                                    </div>
                                )}
                                {100 - spentPercent - plannedPercent > 0 && (
                                    <div
                                        aria-hidden
                                        className="absolute top-0 h-full rounded-r-full bg-rose-200/50 transition-all duration-700"
                                        style={{ left: `${spentPercent + plannedPercent}%`, width: `${100 - spentPercent - plannedPercent}%` }}
                                    />
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setSelectedKpi('already_spent')}
                                    className="text-gray-600 hover:text-gray-900"
                                >
                                    <span className="font-medium">{t('dashboard.already_spent')}: </span>
                                    <span className="font-bold border-b border-dashed border-gray-300">{formatCurrency(alreadySpent)}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedKpi('remaining_planned')}
                                    className="text-gray-600 hover:text-gray-900"
                                >
                                    <span className="font-medium">{t('dashboard.remaining_planned')}: </span>
                                    <span className="font-bold border-b border-dashed border-gray-300">{formatCurrency(remainingPlanned)}</span>
                                </button>
                                {variableForecast > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowForecastModal(true)}
                                        className="text-gray-500 hover:text-gray-800 italic"
                                    >
                                        {t('dashboard.variable_forecast')}: <span className="font-bold not-italic">{formatCurrency(variableForecast)}</span>
                                    </button>
                                )}
                                <span className="text-gray-400 font-mono ms-auto sm:ms-0">
                                    {Math.round(spentPercent)}% {t('dashboard.spent_label')}
                                </span>
                            </div>
                        </div>

                        {sortedCategories.length > 0 && (
                            <div className="rounded-2xl border border-gray-100 bg-white p-2 sm:p-2.5 max-h-[min(720px,70vh)] overflow-y-auto pr-0.5 custom-scrollbar">
                                <div className="divide-y divide-gray-100">
                                    {sortedCategories.map((cat) => {
                                        const health = categoryHealth(cat);
                                        const budget = cat.projected > 0 ? cat.projected : Math.max(cat.historicalAvg || 0, cat.spent, 1);
                                        const fillPct = Math.min(100, (cat.spent / budget) * 100);
                                        const barFill =
                                            health === 'critical'
                                                ? 'bg-gradient-to-r from-red-500 to-rose-600'
                                                : 'bg-gradient-to-r from-emerald-500 to-emerald-600';

                                        return (
                                            <button
                                                key={cat.name}
                                                type="button"
                                                onClick={() => onCategoryClick?.(cat.name)}
                                                className="w-full px-0.5 py-1 hover:bg-gray-50/60 transition-colors"
                                            >
                                                <div
                                                    dir="ltr"
                                                    className="grid grid-cols-[80px_minmax(0,1fr)_120px] items-center gap-1"
                                                >
                                                    <div className={`${isHebrew ? 'text-left' : 'text-right'} tabular-nums`}>
                                                        <div className="text-[12px] font-semibold text-gray-800 truncate leading-tight">
                                                            {formatCurrency(cat.spent)}
                                                        </div>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-slate-200/80 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${barFill} ${health === 'critical' ? '' : 'opacity-95'}`}
                                                            style={{ width: `${fillPct}%` }}
                                                        />
                                                    </div>
                                                    <div className={`min-w-0 flex items-center gap-1.5 ${isHebrew ? 'justify-end text-right' : 'justify-start text-left'}`}>
                                                        <span className="text-[12px] font-semibold text-slate-700 truncate">
                                                            {cat.name}
                                                        </span>
                                                        <span className="text-rose-700 shrink-0">
                                                            <CategoryIcon category={cat.name} className="w-3.5 h-3.5" />
                                                        </span>

                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {selectedKpi &&
                createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/50 backdrop-blur-sm" onClick={() => setSelectedKpi(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                        </div>
                                        {selectedKpi === 'already_spent' ? t('dashboard.already_spent') : t('dashboard.remaining_planned')}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {t('dashboard.kpi_details')} ({formatCurrency(selectedKpi === 'already_spent' ? alreadySpent : remainingPlanned)})
                                    </p>
                                </div>
                                <button onClick={() => setSelectedKpi(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-0 sm:p-6 bg-gray-50/30">
                                {(selectedKpi === 'already_spent' ? alreadySpentTxns : remainingPlannedTxns).length > 0 ? (
                                    <TransactionTable
                                        transactions={selectedKpi === 'already_spent' ? alreadySpentTxns : remainingPlannedTxns}
                                        categories={categories}
                                        onUpdateCategory={onUpdateCategory}
                                    />
                                ) : (
                                    <div className="text-center text-gray-400 py-10">{t('dashboard.no_transactions')}</div>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            <VariableForecastModal
                isOpen={showForecastModal}
                onClose={() => setShowForecastModal(false)}
                remainingDays={remainingDays || 0}
                categories={byCategory}
                expenseTxnCount={expenseTxnCount}
                historicalAvgMonthlyTxnCount={historicalAvgMonthlyTxnCount}
                expectedTxnCountToDate={expectedTxnCountToDate}
                isCurrentMonth={isCurrentMonth}
                monthsAnalyzed={monthsAnalyzed}
            />
        </>
    );
}
