import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { TransactionTable } from '../TransactionTable';
import { VariableForecastModal } from './VariableForecastModal';

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
    onCategoryClick
}: ExpenseProgressCenterProps) {
    const { t, i18n } = useTranslation();
    const [selectedKpi, setSelectedKpi] = useState<'already_spent' | 'remaining_planned' | null>(null);
    const [showForecastModal, setShowForecastModal] = useState(false);


    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const spentPercent = totalProjected > 0 ? Math.min((alreadySpent / totalProjected) * 100, 100) : 0;
    const plannedPercent = totalProjected > 0 ? Math.min((remainingPlanned / totalProjected) * 100, 100 - spentPercent) : 0;

    return (
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-red-100/50 p-6 overflow-hidden group hover:shadow-xl transition-all duration-500">
            {/* Decorative gradient */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-red-50 to-transparent rounded-bl-full opacity-60" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-red-400 to-rose-500 rounded-xl flex items-center justify-center shadow-md shadow-red-200">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                                {t('dashboard.expense_progress')}
                            </h3>
                            <p className="text-xs text-gray-400">{t('dashboard.monthly_overview')}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black text-gray-900">{formatCurrency(totalProjected)}</p>
                        <p className="text-xs text-gray-400">{t('dashboard.total_projected')}</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden mb-4 shadow-inner">
                    {/* Already Spent - solid fill */}
                    <div
                        className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-400 to-rose-500 rounded-l-full transition-all duration-1000 ease-out"
                        style={{ width: `${spentPercent}%` }}
                    >
                        <div className="absolute inset-0 bg-white/10 animate-pulse" />
                    </div>
                    {/* Remaining Planned (Fixed Bills) - striped fill */}
                    {plannedPercent > 0 && (
                        <div
                            className="absolute top-0 h-full overflow-hidden transition-all duration-1000 ease-out"
                            style={{ left: `${spentPercent}%`, width: `${plannedPercent}%` }}
                        >
                            <div className="w-full h-full bg-rose-300" style={{
                                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.4) 4px, rgba(255,255,255,0.4) 8px)',
                            }} />
                        </div>
                    )}
                    {/* Variable Forecast - translucent fill */}
                    {100 - spentPercent - plannedPercent > 0 && (
                        <div
                            className="absolute top-0 h-full rounded-r-full overflow-hidden transition-all duration-1000 ease-out bg-rose-200/50"
                            style={{ left: `${spentPercent + plannedPercent}%`, width: `${100 - spentPercent - plannedPercent}%` }}
                        />
                    )}
                </div>

                {/* Legend */}
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                        <div
                            className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50/50 p-1 -m-1 rounded transition-colors"
                            onClick={() => setSelectedKpi('already_spent')}
                            title={t('dashboard.view_transactions')}
                        >
                            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-red-400 to-rose-500 shadow-sm" />
                            <span className="text-gray-600 font-medium">
                                {t('dashboard.already_spent')}: <span className="font-bold text-gray-900 border-b border-dashed border-gray-300">{formatCurrency(alreadySpent)}</span>
                            </span>
                        </div>
                        <div
                            className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50/50 p-1 -m-1 rounded transition-colors"
                            onClick={() => setSelectedKpi('remaining_planned')}
                            title={t('dashboard.view_transactions')}
                        >
                            <div className="w-3 h-3 rounded-full bg-rose-200 shadow-sm border border-rose-300" style={{
                                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.7) 2px, rgba(255,255,255,0.7) 4px)',
                            }} />
                            <span className="text-gray-600 font-medium">
                                {t('dashboard.remaining_planned')}: <span className="font-bold text-gray-900 border-b border-dashed border-gray-300">{formatCurrency(remainingPlanned)}</span>
                            </span>
                        </div>
                        {variableForecast > 0 && (
                            <div
                                className="flex items-center gap-1.5 p-1 -m-1 rounded cursor-pointer hover:bg-gray-50/50 transition-colors flex-shrink-0"
                                title={t('dashboard.forecast_details_modal_hint')}
                                onClick={() => setShowForecastModal(true)}
                            >
                                <div className="w-3 h-3 rounded-full bg-rose-100 shadow-sm border border-rose-200 flex-shrink-0" />
                                <span className="text-gray-500 font-medium italic whitespace-nowrap">
                                    {t('dashboard.variable_forecast')}: <span className="font-bold text-gray-700 border-b border-dashed border-gray-300">{formatCurrency(variableForecast)}</span>
                                </span>
                            </div>
                        )}
                    </div>
                    <span className="text-gray-400 font-mono font-medium bg-gray-100 px-2 py-0.5 rounded text-[10px]">{Math.round(spentPercent)}% {t('dashboard.spent_label')}</span>
                </div>

                {/* Category Mini-bars */}
                {byCategory.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-gray-100 space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                {t('dashboard.by_category')}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                <span className="flex items-center gap-1"><div className="w-0.5 h-3 bg-gray-400"></div> {t('dashboard.history_marker')}</span>
                            </div>
                        </div>
                        {byCategory.map((cat) => {
                            const scaleMax = Math.max(cat.projected, cat.historicalAvg || 0);
                            const spentPercent = scaleMax > 0 ? (cat.spent / scaleMax) * 100 : 0;
                            const forecastPercent = scaleMax > 0 ? ((cat.projected - cat.spent) / scaleMax) * 100 : 0;
                            const avgPercent = scaleMax > 0 && cat.historicalAvg ? (cat.historicalAvg / scaleMax) * 100 : 0;

                            // Color logic
                            let barColor = 'from-emerald-300 to-emerald-400';
                            let forecastColor = 'bg-emerald-200/50';

                            if (cat.historicalAvg) {
                                if (cat.spent > cat.historicalAvg) {
                                    barColor = 'from-rose-400 to-red-500';
                                    forecastColor = 'bg-rose-200/50';
                                } else if (cat.projected > cat.historicalAvg * 1.1) {
                                    barColor = 'from-amber-300 to-yellow-400';
                                    forecastColor = 'bg-amber-200/50';
                                }
                            } else {
                                barColor = 'from-gray-300 to-gray-400';
                                forecastColor = 'bg-gray-200/50';
                            }

                            // Delta percentage
                            let deltaEl = null;
                            if (cat.historicalAvg && cat.historicalAvg > 0) {
                                const delta = ((cat.projected - cat.historicalAvg) / cat.historicalAvg) * 100;
                                const isOver = delta > 0;
                                deltaEl = (
                                    <span className={`text-[10px] font-bold ${isOver ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {isOver ? '+' : ''}{Math.round(delta)}%
                                    </span>
                                );
                            }

                            return (
                                <div
                                    key={cat.name}
                                    className="flex flex-col gap-1 cursor-pointer hover:bg-gray-50 p-2 -mx-2 rounded-xl transition-all border border-transparent hover:border-gray-200 hover:shadow-sm"
                                    onClick={() => onCategoryClick?.(cat.name)}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-600 truncate font-medium max-w-[120px]">{cat.name}</span>
                                            {cat.historicalAvg && (
                                                <span className="text-[10px] text-gray-400 font-medium border-l border-gray-200 pl-2">
                                                    {formatCurrency(cat.historicalAvg)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {deltaEl}
                                            <span className="text-xs font-bold text-gray-700 w-16 text-right">{formatCurrency(cat.spent)}</span>
                                        </div>
                                    </div>

                                    <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden flex items-center">
                                        {/* Spent Bar */}
                                        <div
                                            className={`absolute left-0 top-0 h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700`}
                                            style={{ width: `${Math.min(spentPercent, 100)}%`, zIndex: 10 }}
                                        />
                                        {/* Forecast Extension */}
                                        {forecastPercent > 0 && (
                                            <div
                                                className={`absolute top-0 h-full ${forecastColor} rounded-r-full transition-all duration-700`}
                                                style={{ left: `${Math.min(spentPercent, 100)}%`, width: `${Math.min(forecastPercent, 100 - spentPercent)}%`, zIndex: 5 }}
                                            />
                                        )}
                                        {/* Historical Marker */}
                                        {avgPercent > 0 && (
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-gray-500/80 z-20 transition-all duration-700 shadow-sm"
                                                style={{ left: `${avgPercent}%` }}
                                                title={`Historical Avg: ${formatCurrency(cat.historicalAvg!)}`}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* KPI Transactions Modal */}
            {selectedKpi && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/50 backdrop-blur-sm" onClick={() => setSelectedKpi(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                    </div>
                                    {selectedKpi === 'already_spent' ? t('dashboard.already_spent') : t('dashboard.remaining_planned')}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {t('dashboard.kpi_details')} ({formatCurrency(selectedKpi === 'already_spent' ? alreadySpent : remainingPlanned)})
                                </p>
                            </div>
                            <button onClick={() => setSelectedKpi(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
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
                                <div className="text-center text-gray-400 py-10">
                                    {t('dashboard.no_transactions')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Variable Forecast Calculation Modal */}
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
        </div>
    );
}
