import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { ChevronDown, List } from 'lucide-react';
import { clsx } from 'clsx';
import { TransactionTable } from '../TransactionTable';

interface MonthlyTransactionsCardProps {
    title?: string;
    subtitle?: string;
    transactions: Transaction[];
    categories?: string[];
    onUpdateCategory?: (txnId: string, category: string) => void;
    defaultCollapsed?: boolean;
    scopeLabel?: string;
    filterLabel?: string;
    onClearFilter?: () => void;
}

export function MonthlyTransactionsCard({
    title,
    subtitle,
    transactions,
    categories,
    onUpdateCategory,
    defaultCollapsed = false,
    scopeLabel,
    filterLabel,
    onClearFilter
}: MonthlyTransactionsCardProps) {
    const { t, i18n } = useTranslation();
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    const total = useMemo(() => transactions.reduce((acc, txn) => acc + (txn.chargedAmount ?? txn.amount ?? 0), 0), [transactions]);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    return (
        <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden relative group">
            <div
                role="button"
                tabIndex={0}
                onClick={() => setCollapsed(v => !v)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCollapsed(v => !v);
                    }
                }}
                className="w-full text-left p-8 hover:bg-white/40 transition-colors cursor-pointer"
            >
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform duration-500">
                            <List className="text-white w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">
                                {title ?? t('dashboard.transactions')}
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-600">
                                    {transactions.length} {scopeLabel ?? t('dashboard.this_month')}
                                </span>
                                <span className="text-[10px] text-gray-300">•</span>
                                <span className={clsx(
                                    'text-xs font-medium',
                                    total >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                )}>
                                    {formatCurrency(total)}
                                </span>
                                {subtitle && (
                                    <>
                                        <span className="text-[10px] text-gray-300">•</span>
                                        <span className="text-xs font-medium text-gray-400">{subtitle}</span>
                                    </>
                                )}
                            </div>
                            {filterLabel && (
                                <div className="mt-2 inline-flex items-center gap-2">
                                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100">
                                        {filterLabel}
                                    </span>
                                    {onClearFilter && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onClearFilter();
                                            }}
                                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                                        >
                                            {t('common.clear')}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <ChevronDown
                        className={clsx(
                            'w-5 h-5 text-gray-400 transition-transform',
                            collapsed ? '-rotate-90' : 'rotate-0',
                            i18n.language === 'he' ? 'scale-x-[-1]' : ''
                        )}
                    />
                </div>
            </div>

            {!collapsed && (
                <div className="px-6 pb-8">
                    {transactions.length === 0 ? (
                        <div className="mx-2 mb-2 p-10 text-center text-gray-400 border-2 border-dashed border-gray-100 rounded-[2.5rem] bg-gray-50/30">
                            {t('dashboard.no_transactions_found')}
                        </div>
                    ) : (
                        <TransactionTable
                            transactions={transactions}
                            categories={categories}
                            onUpdateCategory={onUpdateCategory}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
