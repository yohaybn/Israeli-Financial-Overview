import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CategoryBudgetItem } from '@app/shared';

interface VariableForecastModalProps {
    isOpen: boolean;
    onClose: () => void;
    remainingDays: number;
    categories: CategoryBudgetItem[];
    expenseTxnCount?: number;
    historicalAvgMonthlyTxnCount?: number;
    expectedTxnCountToDate?: number;
    isCurrentMonth?: boolean;
    monthsAnalyzed?: number;
}

export function VariableForecastModal({
    isOpen,
    onClose,
    remainingDays,
    categories,
    expenseTxnCount = 0,
    historicalAvgMonthlyTxnCount = 0,
    expectedTxnCountToDate = 0,
    isCurrentMonth = false,
    monthsAnalyzed,
}: VariableForecastModalProps) {
    const { t, i18n } = useTranslation();
    const [calculationOpen, setCalculationOpen] = useState(false);

    useEffect(() => {
        if (isOpen) setCalculationOpen(false);
    }, [isOpen]);

    if (!isOpen) return null;

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const forecastedCategories = categories.filter(c => (c.variableForecastAmount || 0) > (c.upcomingBillsAmount || 0));
    const totalExtraForecast = forecastedCategories.reduce((sum, c) => sum + Math.max(0, (c.variableForecastAmount || 0) - (c.upcomingBillsAmount || 0)), 0);

    const formatTxnCount = (n: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
        }).format(n);

    const formatAvgTxnShekels = (n: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            maximumFractionDigits: 0,
        }).format(Math.round(n));

    const transactionCountDetail = (cat: CategoryBudgetItem) => {
        if (cat.forecastMethod !== 'transaction_count' || cat.forecastEffectiveTxnCount == null) {
            return null;
        }
        return t('dashboard.method_transaction_count_detail', {
            remainingDays,
            forecastTxnCount: formatTxnCount(cat.forecastEffectiveTxnCount),
            avgTxnValue: formatAvgTxnShekels(cat.avgTxnValue || 0),
        });
    };

    const extrapolationNote = (cat: CategoryBudgetItem) => {
        if (cat.forecastMethod === 'extrapolation' && (cat.forecastRate || 0) > 0) {
            return t('dashboard.method_extrapolation_detail', {
                rate: formatCurrency(cat.forecastRate || 0),
                days: remainingDays,
            });
        }
        return null;
    };

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-gray-900/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center shadow-sm">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            {t('dashboard.variable_forecast')}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {t('dashboard.forecast_explanation', { count: remainingDays })}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="border-b border-gray-100 bg-amber-50/40">
                    <button
                        type="button"
                        onClick={() => setCalculationOpen((o) => !o)}
                        aria-expanded={calculationOpen}
                        className="w-full flex items-center justify-between gap-3 px-6 py-3 text-start hover:bg-amber-50/80 transition-colors rounded-none"
                    >
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                            {t('dashboard.forecast_how_title')}
                        </span>
                        <svg
                            className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${calculationOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {calculationOpen && (
                        <div className="px-6 pb-4 -mt-1 space-y-3">
                            <p className="text-sm text-gray-600 leading-relaxed">
                                {t('dashboard.forecast_how_body', { months: monthsAnalyzed ?? '—' })}
                            </p>
                            {historicalAvgMonthlyTxnCount > 0 && (
                                <p className="text-sm text-gray-700 font-medium">
                                    {isCurrentMonth
                                        ? t('dashboard.txn_pace_modal_current', {
                                            current: expenseTxnCount,
                                            expected: expectedTxnCountToDate,
                                            avg: historicalAvgMonthlyTxnCount,
                                        })
                                        : t('dashboard.txn_pace_modal_past', {
                                            current: expenseTxnCount,
                                            avg: historicalAvgMonthlyTxnCount,
                                        })}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 overflow-y-auto max-h-[50vh]">
                    <div className="space-y-4">
                        {forecastedCategories.map((cat) => {
                            const txDetail = transactionCountDetail(cat);
                            const extraNote = extrapolationNote(cat);
                            const calcLine = txDetail || extraNote;
                            return (
                            <div key={cat.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="flex flex-col min-w-0 pr-3">
                                    <span className="font-bold text-gray-800">{cat.name}</span>
                                    <span className="text-xs text-gray-600 mt-1">
                                        {t('dashboard.forecast_spent_this_month')}: <span className="font-semibold text-gray-800">{formatCurrency(cat.spent)}</span>
                                    </span>
                                    {calcLine && (
                                        <span className="text-xs text-gray-500 flex items-start gap-1 mt-1">
                                            <svg className="w-3 h-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span>{calcLine}</span>
                                        </span>
                                    )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className="text-lg font-black text-rose-600">+{formatCurrency(Math.max(0, (cat.variableForecastAmount || 0) - (cat.upcomingBillsAmount || 0)))}</div>
                                    <div className="text-[10px] text-gray-400 max-w-[148px] ms-auto leading-snug text-balance">
                                        {t('dashboard.forecast_extra_vs_bills')}
                                    </div>
                                </div>
                            </div>
                            );
                        })}

                        {forecastedCategories.length === 0 && (
                            <div className="text-center py-8 text-gray-400">
                                {t('dashboard.no_forecast')}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-4">
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-gray-700 uppercase">{t('dashboard.total_extra_forecast')}</span>
                        <span className="text-[10px] text-gray-400">{t('dashboard.forecast_disclaimer')}</span>
                    </div>
                    <span className="text-2xl font-black text-gray-900 flex-shrink-0">{formatCurrency(totalExtraForecast)}</span>
                </div>
            </div>
        </div>,
        document.body
    );
}
