import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { List } from 'lucide-react';
import { isInternalTransfer } from '../../utils/transactionUtils';
import { TransactionTable } from '../TransactionTable';
import { DashboardCardHeader, dashboardCardShellClass } from './DashboardCardChrome';

interface MonthlyTransactionsCardProps {
    title?: string;
    subtitle?: string;
    transactions: Transaction[];
    categories?: string[];
    onUpdateCategory?: (txnId: string, category: string) => void;
    defaultCollapsed?: boolean;
    /** Increment (e.g. from parent) to expand the card when already mounted. */
    expandSignal?: number;
    collapseAllSignal?: number;
    scopeLabel?: string;
    filterLabel?: string;
    onClearFilter?: () => void;
    /** Used to exclude internal transfers from header total & count (same rules as dashboard). */
    customCCKeywords?: string[];
    /** Extra controls next to the collapse chevron (e.g. “Search all”). Use stopPropagation on clicks. */
    endActions?: ReactNode;
}

export function MonthlyTransactionsCard({
    title,
    subtitle,
    transactions,
    categories,
    onUpdateCategory,
    defaultCollapsed = false,
    expandSignal = 0,
    collapseAllSignal = 0,
    scopeLabel: _scopeLabel,
    filterLabel,
    onClearFilter,
    customCCKeywords,
    endActions,
}: MonthlyTransactionsCardProps) {
    const { t, i18n } = useTranslation();
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    useEffect(() => {
        if (expandSignal > 0) setCollapsed(false);
    }, [expandSignal]);

    useEffect(() => {
        if (collapseAllSignal > 0) setCollapsed(true);
    }, [collapseAllSignal]);

    const transactionsExcludingInternal = useMemo(
        () => transactions.filter((txn) => !isInternalTransfer(txn, customCCKeywords ?? [])),
        [transactions, customCCKeywords]
    );

    const headerTotal = useMemo(
        () =>
            transactionsExcludingInternal.reduce((acc, txn) => acc + (txn.chargedAmount ?? txn.amount ?? 0), 0),
        [transactionsExcludingInternal]
    );

    const headerTxnCount = transactionsExcludingInternal.length;

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    return (
        <div className={dashboardCardShellClass}>
            <DashboardCardHeader
                collapsed={collapsed}
                onToggle={() => setCollapsed((v) => !v)}
                icon={<List className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden />}
                iconTileClassName="bg-gradient-to-br from-blue-500 to-cyan-600 shadow-blue-200"
                endActions={endActions}
                title={title ?? t('dashboard.transactions')}
                subtitle={
                    <>
                        <div
                            dir="ltr"
                            className="flex w-full items-baseline justify-between gap-3 min-w-0"
                        >
                            <span className="font-semibold tabular-nums text-black">
                                {formatCurrency(headerTotal)}
                            </span>
                            <span className="text-xs text-gray-500 shrink-0">
                                {t('dashboard.transactions_card_count', { count: headerTxnCount })}
                            </span>
                        </div>
                        {subtitle && (
                            <div className="mt-1 text-xs text-gray-600 truncate">{subtitle}</div>
                        )}
                        {filterLabel && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
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
                    </>
                }
            />

            {!collapsed && (
                <div className="px-6 pb-8 sm:px-8">
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
