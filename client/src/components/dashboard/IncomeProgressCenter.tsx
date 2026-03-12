import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { TransactionTable } from '../TransactionTable';

interface IncomeProgressCenterProps {
    alreadyReceived: number;
    alreadyReceivedTxns?: Transaction[];
    expectedInflow: number;
    expectedInflowTxns?: Transaction[];
    totalProjected: number;
    upcomingIncome?: { description: string; amount: number; expectedDate: string }[];
    categories?: string[];
    onUpdateCategory?: (transactionId: string, category: string) => void;
}

export function IncomeProgressCenter({
    alreadyReceived,
    alreadyReceivedTxns = [],
    expectedInflow,
    expectedInflowTxns = [],
    totalProjected,
    upcomingIncome,
    categories,
    onUpdateCategory
}: IncomeProgressCenterProps) {
    const { t, i18n } = useTranslation();
    const [selectedKpi, setSelectedKpi] = useState<'already_received' | 'expected_inflow' | null>(null);
    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const receivedPercent = totalProjected > 0 ? Math.min((alreadyReceived / totalProjected) * 100, 100) : 0;
    const expectedPercent = totalProjected > 0 ? Math.min((expectedInflow / totalProjected) * 100, 100 - receivedPercent) : 0;

    return (
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-emerald-100/50 p-6 overflow-hidden group hover:shadow-xl transition-all duration-500">
            {/* Decorative gradient */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-50 to-transparent rounded-bl-full opacity-60" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-green-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-200">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                                {t('dashboard.income_progress', 'Income Progress')}
                            </h3>
                            <p className="text-xs text-gray-400">{t('dashboard.monthly_overview', 'Monthly Overview')}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black text-gray-900">{formatCurrency(totalProjected)}</p>
                        <p className="text-xs text-gray-400">{t('dashboard.total_projected', 'Total Projected')}</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden mb-4 shadow-inner">
                    {/* Already Received - solid fill */}
                    <div
                        className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-l-full transition-all duration-1000 ease-out"
                        style={{ width: `${receivedPercent}%` }}
                    >
                        <div className="absolute inset-0 bg-white/10 animate-pulse" />
                    </div>
                    {/* Expected - striped fill */}
                    <div
                        className="absolute top-0 h-full rounded-r-full transition-all duration-1000 ease-out overflow-hidden"
                        style={{ left: `${receivedPercent}%`, width: `${expectedPercent}%` }}
                    >
                        <div className="w-full h-full bg-emerald-200" style={{
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.4) 4px, rgba(255,255,255,0.4) 8px)',
                        }} />
                    </div>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                        <div
                            className="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50/50 p-1 -m-1 rounded transition-colors"
                            onClick={() => setSelectedKpi('already_received')}
                            title={t('dashboard.view_transactions', 'View Transactions')}
                        >
                            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 shadow-sm" />
                            <span className="text-gray-600 font-medium">
                                {t('dashboard.already_received', 'Already Received')}: <span className="font-bold text-gray-900 border-b border-dashed border-gray-300">{formatCurrency(alreadyReceived)}</span>
                            </span>
                        </div>
                        <div
                            className="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50/50 p-1 -m-1 rounded transition-colors"
                            onClick={() => setSelectedKpi('expected_inflow')}
                            title={t('dashboard.view_transactions', 'View Transactions')}
                        >
                            <div className="w-3 h-3 rounded-full bg-emerald-200 shadow-sm border border-emerald-300" style={{
                                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.7) 2px, rgba(255,255,255,0.7) 4px)',
                            }} />
                            <span className="text-gray-600 font-medium">
                                {t('dashboard.expected_inflow', 'Expected Inflow')}: <span className="font-bold text-gray-900 border-b border-dashed border-gray-300">{formatCurrency(expectedInflow)}</span>
                            </span>
                        </div>
                    </div>
                    <span className="text-gray-400 font-mono">{Math.round(receivedPercent)}%</span>
                </div>

                {/* Net Balance Preview & Upcoming Details */}
                <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            {t('dashboard.received_so_far', 'Received So Far')}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-emerald-600">{formatCurrency(alreadyReceived)}</span>
                            {expectedInflow > 0 && (
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                                    +{formatCurrency(expectedInflow)} {t('dashboard.pending', 'pending')}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Upcoming Income Details */}
                    {upcomingIncome && upcomingIncome.length > 0 && (
                        <div className="bg-gray-50/50 rounded-xl p-3 border border-gray-100 flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                {t('dashboard.expected_sources', 'Expected Sources')}
                            </span>
                            {upcomingIncome.map((item, idx) => {
                                const expDate = new Date(item.expectedDate);
                                const now = new Date();
                                const diffDays = (now.getTime() - expDate.getTime()) / (1000 * 3600 * 24);
                                const isLate = diffDays > 3;

                                return (
                                    <div key={idx} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-700 w-24 truncate" title={item.description}>
                                                {item.description}
                                            </span>
                                            {isLate && (
                                                <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded text-[9px] font-bold uppercase tracking-wider shadow-sm border border-rose-200">
                                                    {t('dashboard.late', 'Late')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[10px] ${isLate ? 'text-rose-500 font-semibold' : 'text-gray-400'}`}>
                                                {t('dashboard.expected_by', 'Expected by')} {expDate.toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' })}
                                            </span>
                                            <span className="font-bold text-gray-600">{formatCurrency(item.amount)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* KPI Transactions Modal */}
            {selectedKpi && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/50 backdrop-blur-sm" onClick={() => setSelectedKpi(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                    </div>
                                    {selectedKpi === 'already_received' ? t('dashboard.already_received', 'Already Received') : t('dashboard.expected_inflow', 'Expected Inflow')}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {t('dashboard.kpi_details', 'Calculation Details')} ({formatCurrency(selectedKpi === 'already_received' ? alreadyReceived : expectedInflow)})
                                </p>
                            </div>
                            <button onClick={() => setSelectedKpi(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-0 sm:p-6 bg-gray-50/30">
                            {(selectedKpi === 'already_received' ? alreadyReceivedTxns : expectedInflowTxns).length > 0 ? (
                                <TransactionTable
                                    transactions={selectedKpi === 'already_received' ? alreadyReceivedTxns : expectedInflowTxns}
                                    categories={categories}
                                    onUpdateCategory={onUpdateCategory}
                                />
                            ) : (
                                <div className="text-center text-gray-400 py-10">
                                    {t('dashboard.no_transactions', 'No transactions found for this calculation.')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
