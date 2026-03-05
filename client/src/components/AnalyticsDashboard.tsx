import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '../hooks/useAnalytics';
import { Transaction } from '@app/shared';

interface AnalyticsDashboardProps {
    transactions: Transaction[];
}

type MerchantSortBy = 'amount' | 'frequency';

export function AnalyticsDashboard({ transactions }: AnalyticsDashboardProps) {
    const { t, i18n } = useTranslation();
    const analytics = useAnalytics(transactions);
    const [merchantSortBy, setMerchantSortBy] = useState<MerchantSortBy>('amount');

    if (!transactions || transactions.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400">
                <p>{t('analytics.no_data')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4">
            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Pie Chart */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('analytics.spending_by_category')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={analytics.byCategory}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                label={(props: any) => `${props.name} (${(props.percent * 100).toFixed(0)}%)`}
                                labelLine={false}
                            >
                                {analytics.byCategory.map((_entry, index) => (
                                    <Cell key={`cell-${index}`} fill={analytics.byCategory[index].color} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', { style: 'currency', currency: 'ILS' }).format(Number(value))} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Monthly Bar Chart */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('analytics.monthly_spending_trend')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.byMonth}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(value) => new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', { style: 'currency', currency: 'ILS' }).format(Number(value))} />
                            <Legend />
                            <Bar dataKey="income" name={t('analytics.income')} fill="#4ade80" />
                            <Bar dataKey="expenses" name={t('analytics.expenses')} fill="#f87171" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Top Merchants Bar Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">{t('analytics.top_merchants')}</h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMerchantSortBy('amount')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${merchantSortBy === 'amount'
                                ? 'bg-blue-50 text-blue-600 border-blue-200'
                                : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'
                                }`}
                        >
                            {t('analytics.total_amount', 'By Amount')}
                        </button>
                        <button
                            onClick={() => setMerchantSortBy('frequency')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${merchantSortBy === 'frequency'
                                ? 'bg-blue-50 text-blue-600 border-blue-200'
                                : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'
                                }`}
                        >
                            {t('analytics.txns', 'By Frequency')}
                        </button>
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                        data={analytics.topMerchants
                            .slice(0, 10)
                            .sort((a, b) =>
                                merchantSortBy === 'amount'
                                    ? b.total - a.total
                                    : b.count - a.count
                            )
                            .map(m => ({
                                ...m,
                                displayName: m.description.length > 20 ? m.description.substring(0, 20) + '...' : m.description
                            }))}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis dataKey="displayName" type="category" width={195} tick={{ fontSize: 11 }} />
                        <Tooltip
                            formatter={(value: any) => {
                                if (merchantSortBy === 'amount') {
                                    return new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', { style: 'currency', currency: 'ILS' }).format(Number(value));
                                }
                                return value;
                            }}
                            labelFormatter={(label) => `${label}`}
                        />
                        {merchantSortBy === 'amount' ? (
                            <Bar dataKey="total" name={t('analytics.total_amount')} fill="#8B5CF6" radius={[0, 8, 8, 0]} />
                        ) : (
                            <Bar dataKey="count" name={t('analytics.txns')} fill="#EC4899" radius={[0, 8, 8, 0]} />
                        )}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
