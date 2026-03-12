import { useTranslation } from 'react-i18next';
import { UpcomingItem, Transaction, FinancialSummary } from '@app/shared';
import { useState } from 'react';
import { TransactionModal } from '../TransactionModal';

interface UpcomingFixedListProps {
    items: UpcomingItem[];
    summary: FinancialSummary;
}

export function UpcomingFixedList({ items, summary }: UpcomingFixedListProps) {
    const { t, i18n } = useTranslation();
    const [showInfo, setShowInfo] = useState(false);
    const [selectedHistory, setSelectedHistory] = useState<UpcomingItem | null>(null);
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const getDaysUntil = (dateStr: string) => {
        const target = new Date(dateStr);
        const now = new Date();
        const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return diff;
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            month: 'short',
            day: 'numeric',
        });
    };

    const bills = items.filter(i => i.type === 'bill');
    const income = items.filter(i => i.type === 'income');

    const totalBills = bills.reduce((s, i) => s + i.amount, 0);
    const totalIncome = income.reduce((s, i) => s + i.amount, 0);

    // Progress Calculations
    // 1. Income: Strictly recurring behavior (matches the list below)
    const incomeActual = summary.recurringRealized.income;
    const incomeProjected = summary.recurringRealized.income + totalIncome;
    const incomePercent = incomeProjected > 0 ? Math.min((incomeActual / incomeProjected) * 100, 100) : 0;

    // 2. Expenses: "Total Burn" logic as requested
    // We use all non-transfer transactions (individual CC txns + bank expenses)
    // and project by adding the remaining upcoming recurring bills.
    const expenseActual = summary.expenses.alreadySpent;
    const expenseProjected = summary.expenses.alreadySpent + totalBills;
    const expensePercent = expenseProjected > 0 ? Math.min((expenseActual / expenseProjected) * 100, 100) : 0;

    const renderItem = (item: UpcomingItem, idx: number, isBill: boolean) => {
        const daysUntil = getDaysUntil(item.expectedDate);
        return (
            <div
                key={`${item.description}-${idx}`}
                onClick={() => setSelectedHistory(item)}
                className={`flex items-center justify-between p-3 rounded-xl transition-all hover:scale-[1.01] cursor-pointer active:scale-95 ${isBill
                    ? 'bg-red-50/60 border border-dashed border-red-200/60 hover:bg-red-50'
                    : 'bg-emerald-50/60 border border-dashed border-emerald-200/60 hover:bg-emerald-50'
                    }`}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isBill ? 'bg-red-100 text-red-500' : 'bg-emerald-100 text-emerald-500'
                        }`}>
                        {isBill ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1" />
                            </svg>
                        )}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-800 truncate max-w-[200px]" title={item.description}>
                            {item.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">{formatDate(item.expectedDate)}</span>
                            {/* Confidence dot */}
                            <span
                                className={`w-1.5 h-1.5 rounded-full ${item.confidence > 0.7 ? 'bg-green-400' :
                                    item.confidence > 0.4 ? 'bg-amber-400' : 'bg-red-400'
                                    }`}
                                title={`${Math.round(item.confidence * 100)}% detection confidence`}
                            />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${isBill ? 'text-red-600' : 'text-emerald-600'}`}>
                        {isBill ? '-' : '+'}{formatCurrency(item.amount)}
                    </span>
                    {daysUntil >= 0 && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${daysUntil <= 3
                            ? 'bg-amber-100 text-amber-700 animate-pulse'
                            : 'bg-gray-100 text-gray-500'
                            }`}>
                            {daysUntil === 0
                                ? t('dashboard.today', 'Today')
                                : daysUntil === 1
                                    ? t('dashboard.tomorrow', 'Tomorrow')
                                    : t('dashboard.in_days', { days: daysUntil, defaultValue: `in ${daysUntil}d` })}
                        </span>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-100/50 p-6 md:p-8 overflow-hidden relative">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-amber-200">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                                {t('dashboard.upcoming_fixed', 'Upcoming Fixed')}
                            </h3>
                            <button
                                onClick={() => setShowInfo(!showInfo)}
                                className="text-gray-400 hover:text-blue-500 transition-colors"
                                title="How is this calculated?"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </button>
                        </div>
                        <p className="text-xs text-gray-400">
                            {t('dashboard.upcoming_count', { count: items.length, defaultValue: `${items.length} items expected` })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Info Panel */}
            {showInfo && (
                <div className="mb-8 bg-blue-50/80 p-4 rounded-2xl border border-blue-100 text-xs text-blue-800 animate-in fade-in slide-in-from-top-2">
                    <h4 className="font-bold mb-1">How detection works:</h4>
                    <p>Analyzes your entire transaction history to find consistent patterns:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5 opacity-80">
                        <li>Description appears in multiple months (3 of last 4)</li>
                        <li>Amount is consistent (within 15% variance)</li>
                        <li>Estimated date based on past occurrences (±3 days)</li>
                    </ul>
                </div>
            )}

            {/* Progress Bars Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 pb-8 border-b border-gray-100">
                {/* Income Progress */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-tighter text-gray-500">
                        <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            {t('dashboard.income_received', 'Income Received')}
                        </span>
                        <span>{Math.round(incomePercent)}%</span>
                    </div>
                    <div className="relative h-2.5 bg-gray-50 rounded-full overflow-hidden shadow-inner border border-gray-100/50">
                        <div
                            className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-400/80 to-teal-500/80 transition-all duration-1000 ease-out"
                            style={{ width: `${incomePercent}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-medium text-gray-400">
                        <span>{formatCurrency(incomeActual)} {t('dashboard.received', 'received')}</span>
                        <span>{formatCurrency(incomeProjected - incomeActual)} {t('dashboard.upcoming', 'upcoming')}</span>
                    </div>
                </div>

                {/* Expense Progress (Includes CC) */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-tighter text-gray-500">
                        <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-rose-400" />
                            {t('dashboard.expense_spent', 'Actual Spend (inc. CC)')}
                        </span>
                        <span>{Math.round(expensePercent)}%</span>
                    </div>
                    <div className="relative h-2.5 bg-gray-50 rounded-full overflow-hidden shadow-inner border border-gray-100/50">
                        <div
                            className="absolute left-0 top-0 h-full bg-gradient-to-r from-rose-400/80 to-orange-500/80 transition-all duration-1000 ease-out"
                            style={{ width: `${expensePercent}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-medium text-gray-400">
                        <span>{formatCurrency(expenseActual)} {t('dashboard.spent', 'spent')}</span>
                        <span>{formatCurrency(expenseProjected - expenseActual)} {t('dashboard.upcoming', 'upcoming')}</span>
                    </div>
                </div>
            </div>

            {/* Items */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {/* Income Column */}
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4 px-2 sticky top-0 bg-white/95 backdrop-blur-sm py-2 z-10 border-b border-emerald-100/50">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></span>
                            {t('dashboard.income', 'Input / Income')}
                        </h4>
                        <div className="flex flex-col items-end">
                            <span className="text-xs font-black text-emerald-600">
                                +{formatCurrency(totalIncome)}
                            </span>
                            <span className="text-[9px] text-gray-300 font-medium">{income.length} items</span>
                        </div>
                    </div>
                    {income.length > 0 ? (
                        <div className="space-y-2 pb-4">
                            {income.map((item, idx) => renderItem(item, idx, false))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-50 rounded-3xl bg-gray-50/30 text-center">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1" />
                                </svg>
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter opacity-70">
                                {t('dashboard.no_income', 'No patterns found')}
                            </p>
                        </div>
                    )}
                </div>

                {/* Expenses Column */}
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4 px-2 sticky top-0 bg-white/95 backdrop-blur-sm py-2 z-10 border-b border-red-100/50">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm shadow-red-200"></span>
                            {t('dashboard.expenses', 'Expenses / Bills')}
                        </h4>
                        <div className="flex flex-col items-end">
                            <span className="text-xs font-black text-red-600">
                                -{formatCurrency(totalBills)}
                            </span>
                            <span className="text-[9px] text-gray-300 font-medium">{bills.length} items</span>
                        </div>
                    </div>
                    {bills.length > 0 ? (
                        <div className="space-y-2 pb-4">
                            {bills.map((item, idx) => renderItem(item, idx, true))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-50 rounded-3xl bg-gray-50/30 text-center">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter opacity-70">
                                {t('dashboard.no_bills', 'No patterns found')}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* History Modal */}
            {selectedHistory && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => setSelectedHistory(null)}
                    />
                    <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-300">
                        {/* Modal Header */}
                        <div className={`p-6 text-white flex justify-between items-start ${selectedHistory.type === 'bill' ? 'bg-gradient-to-r from-red-500 to-pink-600' : 'bg-gradient-to-r from-emerald-500 to-teal-600'
                            }`}>
                            <div>
                                <h3 className="text-xl font-bold mb-1">{selectedHistory.description}</h3>
                                <p className="text-white/80 text-sm">
                                    {t('dashboard.history_of', 'Historical occurrences of this group')}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedHistory(null)}
                                className="bg-white/20 hover:bg-white/30 p-2 rounded-xl transition-colors focus:outline-none"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6 max-h-[60vh]">
                            <div className="space-y-3">
                                {selectedHistory.history?.map((txn: Transaction, idx: number) => (
                                    <div
                                        key={txn.id + (txn.date || idx)}
                                        onClick={() => setSelectedTxn(txn)}
                                        className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-white hover:shadow-md transition-all group cursor-pointer"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center font-bold text-gray-400 group-hover:text-blue-500 transition-colors">
                                                {new Date(txn.date).getDate()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-800">
                                                    {new Date(txn.date).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
                                                        year: 'numeric',
                                                        month: 'long',
                                                        day: 'numeric'
                                                    })}
                                                </p>
                                                <p className="text-xs text-gray-400 flex items-center gap-2">
                                                    <span className="capitalize">{txn.provider}</span>
                                                    <span>•</span>
                                                    <span>{txn.category || t('table.uncategorized', 'Other')}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`text-sm font-black ${txn.amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {txn.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(txn.amount))}
                                        </div>
                                    </div>
                                ))}

                                {(!selectedHistory.history || selectedHistory.history.length === 0) && (
                                    <div className="text-center py-10 text-gray-400 italic">
                                        {t('dashboard.no_history_details', 'No detailed history available for this item')}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setSelectedHistory(null)}
                                className="px-6 py-2.5 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all shadow-lg active:scale-95"
                            >
                                {t('common.close', 'Close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Transaction Detail Modal */}
            <TransactionModal 
                transaction={selectedTxn}
                isOpen={!!selectedTxn}
                onClose={() => setSelectedTxn(null)}
            />
        </div>
    );
}
