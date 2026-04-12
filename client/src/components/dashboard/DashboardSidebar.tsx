import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnifiedData } from '../../hooks/useUnifiedData';
import { Transaction } from '@app/shared';
import { TransactionModal } from '../TransactionModal';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { CategoryIcon } from '../../utils/categoryIcons';
import { transactionMatchesSearchQuery } from '../../utils/transactionSearch';

interface DashboardSidebarProps {
    selectedMonth: string; // YYYY-MM
}

export function DashboardSidebar({ selectedMonth }: DashboardSidebarProps) {
    const { t, i18n } = useTranslation();
    const { data: transactions = [], isLoading } = useUnifiedData();
    const [search, setSearch] = useState('');
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

    const filteredTransactions = useMemo(() => {
        return transactions
            .filter(t => t.date.startsWith(selectedMonth))
            .filter((t) => !search.trim() || transactionMatchesSearchQuery(t, search))
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [transactions, selectedMonth, search]);

    const groupedTransactions = useMemo(() => {
        const groups: Record<string, Transaction[]> = {};
        filteredTransactions.forEach(t => {
            const date = t.date.split('T')[0];
            if (!groups[date]) groups[date] = [];
            groups[date].push(t);
        });
        return groups;
    }, [filteredTransactions]);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-8 h-8 border-2 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
                <p className="text-sm text-gray-400 font-medium">{t('common.loading')}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-4 animate-in fade-in slide-in-from-left-4 duration-500">
            {/* Sidebar Header */}
            <div className="flex flex-col gap-2">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">
                    {t('dashboard.sidebar_title')}
                </h3>

                {/* Search Bar */}
                <div className="relative group">
                    <input
                        type="text"
                        placeholder={t('table.search_placeholder_extended')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-white/60 backdrop-blur-md border border-gray-200/50 rounded-xl py-2 px-4 pl-10 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400/50 transition-all outline-none"
                    />
                    <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-2.5 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Transaction List */}
            <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar">
                {Object.keys(groupedTransactions).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-40">
                        <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 12H4M12 4v16m8-8l-8-8-8 8" />
                        </svg>
                        <p className="text-xs font-bold leading-tight text-center">
                            {t('dashboard.no_txns_month')}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6 pb-4">
                        {Object.entries(groupedTransactions).map(([date, txns]) => (
                            <div key={date} className="space-y-2">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter px-1">
                                    {format(new Date(date), 'MMM dd, yyyy')}
                                </h4>
                                <div className="space-y-1.5">
                                    {txns.map(txn => (
                                        <div
                                            key={txn.id}
                                            onClick={() => setSelectedTxn(txn)}
                                            className={clsx(
                                                "group bg-white/40 hover:bg-white/80 backdrop-blur-sm border border-gray-100/50 rounded-xl p-3 transition-all cursor-pointer hover:shadow-sm",
                                                txn.isIgnored && "opacity-40 grayscale"
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-gray-800 truncate leading-snug">
                                                        {txn.description}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                                        <span className="text-[10px] text-gray-400 font-medium">
                                                            {txn.provider}
                                                        </span>
                                                        {txn.category && (
                                                            <span className="text-[9px] bg-blue-50/50 text-blue-600 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1">
                                                                <CategoryIcon category={txn.category} className="w-3 h-3 text-blue-600" />
                                                                {txn.category}
                                                            </span>
                                                        )}
                                                        {txn.isIgnored && (
                                                            <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                                                {t('common.ignored')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className={clsx(
                                                    "text-sm font-black whitespace-nowrap",
                                                    (txn.chargedAmount || txn.amount) > 0 ? "text-emerald-500" : "text-gray-900"
                                                )}>
                                                    {formatCurrency(txn.chargedAmount || txn.amount)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <TransactionModal
                transaction={selectedTxn}
                isOpen={!!selectedTxn}
                onClose={() => setSelectedTxn(null)}
            />
        </div>
    );
}
