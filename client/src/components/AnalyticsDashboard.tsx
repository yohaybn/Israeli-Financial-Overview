import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '../hooks/useAnalytics';
import { Transaction } from '@app/shared';

interface AnalyticsDashboardProps {
    transactions: Transaction[];
    allTransactions?: Transaction[];
    onCategoryClick?: (category: string) => void;
    customCCKeywords?: string[];
    onViewRangeChange?: (range: ViewRange) => void;
    onDayFilterChange?: (filter: AnalyticsDayFilter | null) => void;
    activeDayFilter?: AnalyticsDayFilter | null;
}

type MerchantSortBy = 'amount' | 'frequency';
type ViewRange = 'month' | 'all';
export type DayFilterKind = 'weekday' | 'monthday';
export interface AnalyticsDayFilter {
    kind: DayFilterKind;
    value: number;
    viewRange: ViewRange;
    label: string;
}

export function AnalyticsDashboard({
    transactions: monthTransactions,
    allTransactions,
    onCategoryClick,
    customCCKeywords = [],
    onViewRangeChange,
    onDayFilterChange,
    activeDayFilter
}: AnalyticsDashboardProps) {
    const { t, i18n } = useTranslation();
    const [viewRange, setViewRange] = useState<ViewRange>('month');
    const [merchantSortBy, setMerchantSortBy] = useState<MerchantSortBy>('amount');
    const [selectedDayFilter, setSelectedDayFilter] = useState<{ kind: DayFilterKind; value: number } | null>(null);

    const displayTransactions = viewRange === 'all' && allTransactions ? allTransactions : monthTransactions;
    const analytics = useAnalytics(displayTransactions, customCCKeywords);

    useEffect(() => {
        if (!activeDayFilter) {
            setSelectedDayFilter(null);
            return;
        }

        setSelectedDayFilter({
            kind: activeDayFilter.kind,
            value: activeDayFilter.value
        });
    }, [activeDayFilter]);

    if (!displayTransactions || displayTransactions.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400">
                <p>{t('analytics.no_data')}</p>
            </div>
        );
    }

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0
        }).format(value);

    const getWeekdayLabel = (dayIndex: number) => {
        const baseSunday = new Date(Date.UTC(2024, 0, 7 + dayIndex));
        return new Intl.DateTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            weekday: 'short'
        }).format(baseSunday);
    };

    const handleViewRangeChange = (range: ViewRange) => {
        setViewRange(range);
        setSelectedDayFilter(null);
        onViewRangeChange?.(range);
        onDayFilterChange?.(null);
    };

    const handleDayFilterClick = (kind: DayFilterKind, value: number, label: string) => {
        if (selectedDayFilter?.kind === kind && selectedDayFilter.value === value) {
            setSelectedDayFilter(null);
            onDayFilterChange?.(null);
            return;
        }

        setSelectedDayFilter({ kind, value });
        onDayFilterChange?.({
            kind,
            value,
            viewRange,
            label
        });
    };

    return (
        <div className="space-y-6 p-4">
            <div className="flex justify-end mb-2">
                <div className="inline-flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-sm">
                    <button
                        onClick={() => handleViewRangeChange('month')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewRange === 'month'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t('analytics.this_month')}
                    </button>
                    <button
                        onClick={() => handleViewRangeChange('all')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewRange === 'all'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t('analytics.all_months')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">{t('analytics.spending_by_category')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={analytics.byCategory}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                innerRadius={60}
                                paddingAngle={2}
                                label={(props: any) => {
                                    if (props.percent < 0.05) return null;
                                    return props.name;
                                }}
                                labelLine={true}
                                onClick={(data: any) => onCategoryClick?.(data.name)}
                                className="cursor-pointer focus:outline-none"
                                stroke="none"
                            >
                                {analytics.byCategory.map((_entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={analytics.byCategory[index].color}
                                        className="hover:opacity-80 transition-opacity"
                                    />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(value) => formatCurrency(Number(value))}
                            />
                            <Legend
                                layout="horizontal"
                                verticalAlign="bottom"
                                align="center"
                                wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <p className="text-[10px] text-center text-gray-400 mt-2">
                        {t('analytics.click_hint')}
                    </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">{t('analytics.monthly_spending_trend')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.byMonth}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `ILS ${Math.round(v / 1000)}k`} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(value) => formatCurrency(Number(value))}
                            />
                            <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                            <Bar dataKey="income" name={t('analytics.income')} fill="#10ac84" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="expenses" name={t('analytics.expenses')} fill="#ee5253" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">{t('analytics.spending_by_weekday')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.byWeekday}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis
                                dataKey="dayIndex"
                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(value) => getWeekdayLabel(Number(value))}
                            />
                            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `ILS ${Math.round(v / 1000)}k`} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                labelFormatter={(value) => getWeekdayLabel(Number(value))}
                                formatter={(value) => formatCurrency(Number(value))}
                            />
                            <Bar
                                dataKey="value"
                                name={t('analytics.expenses')}
                                radius={[4, 4, 0, 0]}
                                onClick={(data: any) => {
                                    if (!data) return;
                                    handleDayFilterClick('weekday', data.dayIndex, getWeekdayLabel(data.dayIndex));
                                }}
                            >
                                {analytics.byWeekday.map((entry) => {
                                    const isSelected = selectedDayFilter?.kind === 'weekday' && selectedDayFilter.value === entry.dayIndex;
                                    return (
                                        <Cell
                                            key={`weekday-${entry.dayIndex}`}
                                            fill={isSelected ? '#2563eb' : '#60a5fa'}
                                            className="cursor-pointer"
                                        />
                                    );
                                })}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">{t('analytics.spending_by_month_day')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.byMonthDay}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="day" tick={{ fontSize: 8, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={2} />
                            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `ILS ${Math.round(v / 1000)}k`} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(value) => formatCurrency(Number(value))}
                            />
                            <Bar
                                dataKey="value"
                                name={t('analytics.expenses')}
                                radius={[3, 3, 0, 0]}
                                onClick={(data: any) => {
                                    if (!data) return;
                                    handleDayFilterClick('monthday', data.day, String(data.day));
                                }}
                            >
                                {analytics.byMonthDay.map((entry) => {
                                    const isSelected = selectedDayFilter?.kind === 'monthday' && selectedDayFilter.value === entry.day;
                                    return (
                                        <Cell
                                            key={`monthday-${entry.day}`}
                                            fill={isSelected ? '#ea580c' : '#fb923c'}
                                            className="cursor-pointer"
                                        />
                                    );
                                })}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-800">{t('analytics.top_merchants')}</h3>
                        <p className="text-xs text-gray-400 mt-1">{t('analytics.merchants_subtitle')}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMerchantSortBy('amount')}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all border ${merchantSortBy === 'amount'
                                ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                                : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'
                                }`}
                        >
                            {t('analytics.total_amount')}
                        </button>
                        <button
                            onClick={() => setMerchantSortBy('frequency')}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all border ${merchantSortBy === 'frequency'
                                ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                                : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'
                                }`}
                        >
                            {t('analytics.txns')}
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-50">
                                <th className="pb-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('transactions.merchant')}</th>
                                <th className="pb-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">{t('analytics.txns')}</th>
                                <th className="pb-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">{t('analytics.total_amount')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {analytics.topMerchants
                                .slice(0, 10)
                                .sort((a, b) =>
                                    merchantSortBy === 'amount'
                                        ? b.total - a.total
                                        : b.count - a.count
                                )
                                .map((m, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">
                                                    {m.description.charAt(0)}
                                                </div>
                                                <span className="text-sm font-semibold text-gray-700">{m.description}</span>
                                            </div>
                                        </td>
                                        <td className="py-3.5 text-center">
                                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                {m.count}
                                            </span>
                                        </td>
                                        <td className="py-3.5 text-right font-black text-gray-900 text-sm">
                                            {formatCurrency(m.total)}
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
