import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CategoryBudgetItem } from '@app/shared';

interface VariableForecastModalProps {
    isOpen: boolean;
    onClose: () => void;
    remainingDays: number;
    categories: CategoryBudgetItem[];
}

export function VariableForecastModal({
    isOpen,
    onClose,
    remainingDays,
    categories
}: VariableForecastModalProps) {
    const { t, i18n } = useTranslation();

    if (!isOpen) return null;

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const forecastedCategories = categories.filter(c => (c.variableForecastAmount || 0) > (c.upcomingBillsAmount || 0));
    const totalExtraForecast = forecastedCategories.reduce((sum, c) => sum + Math.max(0, (c.variableForecastAmount || 0) - (c.upcomingBillsAmount || 0)), 0);

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

                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    <div className="space-y-4">
                        {forecastedCategories.map((cat) => (
                            <div key={cat.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="flex flex-col">
                                    <span className="font-bold text-gray-800">{cat.name}</span>
                                    <span className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {cat.forecastMethod === 'historical_avg' 
                                            ? t('dashboard.method_historical')
                                            : t('dashboard.method_extrapolation')}
                                        : {formatCurrency(cat.forecastRate || 0)}/{t('dashboard.day')}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-black text-rose-600">+{formatCurrency(Math.max(0, (cat.variableForecastAmount || 0) - (cat.upcomingBillsAmount || 0)))}</div>
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">
                                        {t('dashboard.above_planned')}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {forecastedCategories.length === 0 && (
                            <div className="text-center py-8 text-gray-400">
                                {t('dashboard.no_forecast')}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-700 uppercase">{t('dashboard.total_extra_forecast')}</span>
                        <span className="text-[10px] text-gray-400">{t('dashboard.forecast_disclaimer')}</span>
                    </div>
                    <span className="text-2xl font-black text-gray-900">{formatCurrency(totalExtraForecast)}</span>
                </div>
            </div>
        </div>,
        document.body
    );
}
