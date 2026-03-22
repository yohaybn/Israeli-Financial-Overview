import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction, isTransactionIgnored, expenseCategoryKeyFromTxn } from '@app/shared';
import { TransactionTable } from '../TransactionTable';
import { isInternalTransfer } from '../../utils/transactionUtils';
import { getCategoryLucideIcon } from '../../utils/categoryIcons';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid } from 'recharts';
import { format, subMonths, parseISO } from 'date-fns';

interface CategoryDetailsModalProps {
    categoryName: string;
    transactions: Transaction[]; // All cross-month transactions
    categories?: string[];
    onUpdateCategory?: (transactionId: string, category: string) => void;
    initialMonth: string; // YYYY-MM
    customCCKeywords?: string[];
    onClose: () => void;
}

export function CategoryDetailsModal({
    categoryName,
    transactions,
    categories,
    onUpdateCategory,
    initialMonth,
    customCCKeywords = [],
    onClose
}: CategoryDetailsModalProps) {
    const { t, i18n } = useTranslation();
    const HeaderCategoryIcon = getCategoryLucideIcon(categoryName);
    const [selectedMonth, setSelectedMonth] = useState(initialMonth);
    const [monthsToShow, setMonthsToShow] = useState(7);

    // Calculate available months from all transactions
    const availableMonths = useMemo(() => {
        const months = new Set<string>();
        transactions.forEach(t => {
            if (t.date) months.add(t.date.substring(0, 7));
        });
        const sorted = Array.from(months).sort().reverse();
        if (!sorted.includes(selectedMonth)) {
             sorted.push(selectedMonth);
             sorted.sort().reverse();
        }
        return sorted;
    }, [transactions, selectedMonth]);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const categoryTransactions = useMemo(() => {
        return transactions.filter(t =>
            expenseCategoryKeyFromTxn(t) === categoryName &&
            !isInternalTransfer(t, customCCKeywords) &&
            !isTransactionIgnored(t) &&
            (t.chargedAmount || t.amount || 0) < 0 // Only expenses
        );
    }, [transactions, categoryName, customCCKeywords]);

    // Calculate chart data (Anchored to initialMonth)
    const chartData = useMemo(() => {
        const data = [];
        const [yearStr, monthStr] = initialMonth.split('-');
        const anchorDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
        
        let historicalTotal = 0;
        let monthCount = 0;

        for (let i = monthsToShow - 1; i >= 0; i--) {
            const date = subMonths(anchorDate, i);
            const monthKey = format(date, 'yyyy-MM');
            const isSelected = monthKey === selectedMonth;
            
            const monthTxns = categoryTransactions.filter(t => t.date.startsWith(monthKey));
            
            const total = monthTxns.reduce((sum, txn) => {
                if (isInternalTransfer(txn, customCCKeywords)) return sum;
                const amt = txn.chargedAmount || txn.amount || 0;
                if (amt >= 0) return sum; // Skip income/refunds
                return sum + Math.abs(amt); 
            }, 0);

            data.push({
                month: monthKey,
                label: format(date, i18n.language === 'he' ? 'MM/yy' : 'MMM yy'),
                total: total,
                isSelected
            });

            if (monthKey !== format(anchorDate, 'yyyy-MM')) {
                historicalTotal += total;
                monthCount++;
            }
        }
        
        const avg = monthCount > 0 ? historicalTotal / monthCount : 0;

        return { data, avg };
    }, [categoryTransactions, initialMonth, selectedMonth, monthsToShow, i18n.language]);

    const currentMonthData = chartData.data.find(d => d.month === selectedMonth);
    const spentSoFar = currentMonthData ? currentMonthData.total : 0;
    
    // Projected Spending Insight based on historical average
    const projectedSpend = Math.max(spentSoFar, chartData.avg);
    
    const currentMonthTxns = useMemo(() => {
        return categoryTransactions.filter(t => t.date.startsWith(selectedMonth));
    }, [categoryTransactions, selectedMonth]);

    const handleZoomIn = () => setMonthsToShow(prev => Math.max(3, prev - 1));
    const handleZoomOut = () => setMonthsToShow(prev => Math.min(24, prev + 1));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50 gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                                <HeaderCategoryIcon className="w-5 h-5" aria-hidden />
                            </div>
                            {categoryName}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {t('dashboard.category_spending_details')}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                            <button 
                                onClick={handleZoomOut}
                                className="p-2 border-r border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30"
                                disabled={monthsToShow >= 24}
                                title={t('dashboard.zoom_out')}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" /></svg>
                            </button>
                            <span className="px-3 text-xs font-bold text-gray-400 min-w-[70px] text-center uppercase tracking-tighter">
                                {monthsToShow} {t('dashboard.months')}
                            </span>
                            <button 
                                onClick={handleZoomIn}
                                className="p-2 border-l border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30"
                                disabled={monthsToShow <= 3}
                                title={t('dashboard.zoom_in')}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            </button>
                        </div>

                        <select 
                            className="bg-white border border-gray-200 text-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium shadow-sm transition-all text-sm sm:text-base"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                        >
                            {availableMonths.map(m => (
                                <option key={m} value={m}>
                                    {format(parseISO(`${m}-01`), 'MMMM yyyy')}
                                </option>
                            ))}
                        </select>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors self-start sm:self-auto shrink-0">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto flex flex-col">
                    {/* Top Section: Insights & Chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 bg-white border-b border-gray-100">
                        
                        {/* Left: Insight Cards */}
                        <div className="flex flex-col gap-4">
                            <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
                                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">
                                    {t('dashboard.spending_for')} {format(parseISO(`${selectedMonth}-01`), 'MM/yy')}
                                </p>
                                <p className="text-3xl font-black text-indigo-700">{formatCurrency(spentSoFar)}</p>
                            </div>
                            
                            <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100 flex-1 flex flex-col justify-center">
                                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">{t('dashboard.projected_monthly')}</p>
                                <p className="text-2xl font-black text-emerald-600">{formatCurrency(projectedSpend)}</p>
                                <p className="text-[10px] text-emerald-600/70 mt-1.5 font-medium">{t('dashboard.based_on_avg')}: {formatCurrency(chartData.avg)}</p>
                            </div>
                        </div>

                        {/* Right: Bar Chart */}
                        <div className="lg:col-span-2 h-64 bg-gray-50/50 rounded-xl border border-gray-100 p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart 
                                    data={chartData.data} 
                                    margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                                    onClick={(data: any) => {
                                        if (data && data.activeLabel) {
                                            setSelectedMonth(data.activeLabel);
                                        }
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis 
                                        dataKey="month" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tickFormatter={(m) => {
                                            try {
                                                const date = parseISO(`${m}-01`);
                                                return format(date, i18n.language === 'he' ? 'MM/yy' : 'MMM yy');
                                            } catch (e) {
                                                return m;
                                            }
                                        }}
                                        tick={{ fontSize: 12, fill: '#6B7280' }} 
                                        dy={10} 
                                    />
                                    <YAxis hide />
                                    <Tooltip 
                                        cursor={{ fill: '#F3F4F6', cursor: 'pointer' }}
                                        labelFormatter={(m) => {
                                            try {
                                                const date = parseISO(`${m}-01`);
                                                return format(date, 'MMMM yyyy');
                                            } catch (e) {
                                                return m;
                                            }
                                        }}
                                        formatter={(value: number | undefined) => [value ? formatCurrency(value) : '', t('dashboard.spent')]}
                                        labelStyle={{ color: '#374151', fontWeight: 'bold' }}
                                        contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}
                                    />
                                    {chartData.avg > 0 && (
                                        <ReferenceLine y={chartData.avg} stroke="#10B981" strokeDasharray="3 3" />
                                    )}
                                    <Bar 
                                        dataKey="total" 
                                        radius={[4, 4, 0, 0]}
                                        className="cursor-pointer"
                                        onClick={(data: any) => {
                                            if (data && data.month) setSelectedMonth(data.month);
                                        }}
                                    >
                                        {chartData.data.map((entry, index) => (
                                            <Cell 
                                                key={`cell-${index}`} 
                                                fill={entry.isSelected ? '#6366F1' : '#C7D2FE'} 
                                                className="transition-all duration-300 hover:opacity-80"
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Bottom: Transaction Detail Table */}
                    <div className="p-6 bg-gray-50/30 flex-1">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 px-2">
                            {t('dashboard.transactions_for')} {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')}
                        </h4>
                        {currentMonthTxns.length > 0 ? (
                            <TransactionTable
                                transactions={currentMonthTxns}
                                categories={categories}
                                onUpdateCategory={onUpdateCategory}
                            />
                        ) : (
                            <div className="text-center text-gray-400 py-10 bg-white rounded-xl border border-dashed border-gray-200">
                                {t('dashboard.no_transactions_month')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
