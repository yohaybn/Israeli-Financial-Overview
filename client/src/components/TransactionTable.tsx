import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction, expenseCategoryKey } from '@app/shared';
import { ArrowRightLeft, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import { TransactionModal } from './TransactionModal';
import { isInternalTransfer } from '../utils/transactionUtils';
import { useDashboardConfig } from '../hooks/useDashboardConfig';
import { useProviders, getProviderDisplayName } from '../hooks/useProviders';
import { getCategoryLucideIcon } from '../utils/categoryIcons';

interface TransactionTableProps {
    transactions: Transaction[];
    categories?: string[];
    onUpdateCategory?: (txnId: string, category: string) => void;
}

type SortField = 'date' | 'description' | 'originalAmount' | 'category' | 'account';
type SortOrder = 'asc' | 'desc';
type ColumnKey =
    | 'date'
    | 'account'
    | 'description'
    | 'category'
    | 'chargedAmount'
    | 'status'
    | 'originalAmount'
    | 'memo'
    | 'processedDate';

/** Transaction "kind" filter (ignored, installments, internal transfer, etc.) */
type TransactionTypeFilter =
    | 'all'
    | 'ignored'
    | 'installment'
    | 'internal_transfer'
    | 'expense'
    | 'income'
    | 'subscription';

function isTxnIgnored(txn: Transaction): boolean {
    return txn.status === 'ignored' || txn.isIgnored === true;
}

function isInstallmentTxn(txn: Transaction): boolean {
    const t = txn.type?.toLowerCase();
    return t === 'installment' || t === 'installments';
}

function matchesTransactionTypeFilter(
    txn: Transaction,
    filter: TransactionTypeFilter,
    customCCKeywords: string[]
): boolean {
    if (filter === 'all') return true;
    if (filter === 'ignored') return isTxnIgnored(txn);
    if (filter === 'installment') return isInstallmentTxn(txn);
    if (filter === 'internal_transfer') return isInternalTransfer(txn, customCCKeywords);
    if (filter === 'expense') return txn.txnType === 'expense';
    if (filter === 'income') return txn.txnType === 'income';
    if (filter === 'subscription') return txn.isSubscription === true;
    return true;
}

interface ColumnConfig {
    key: ColumnKey;
    label: string;
    sortable: boolean;
    defaultVisible: boolean;
}

const AVAILABLE_COLUMNS: ColumnConfig[] = [
    { key: 'account', label: 'table.account', sortable: true, defaultVisible: false },
    { key: 'description', label: 'table.description', sortable: true, defaultVisible: true },
    { key: 'date', label: 'table.date', sortable: true, defaultVisible: false },
    { key: 'category', label: 'table.category', sortable: false, defaultVisible: true },
    { key: 'chargedAmount', label: 'table.amount', sortable: true, defaultVisible: true },
    { key: 'status', label: 'table.status', sortable: false, defaultVisible: true },
    { key: 'originalAmount', label: 'table.original_amount', sortable: true, defaultVisible: false },
    { key: 'memo', label: 'table.memo', sortable: false, defaultVisible: false },
    { key: 'processedDate', label: 'table.processed_date', sortable: false, defaultVisible: false },
];

export function TransactionTable({ 
    transactions, 
    categories = [], 
    onUpdateCategory 
}: TransactionTableProps) {
    const { t, i18n } = useTranslation();
    const { config } = useDashboardConfig();
    const { data: providers } = useProviders();

    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [search, setSearch] = useState('');
    const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
        // Try to load from localStorage
        const stored = localStorage.getItem('transactionTableColumns');
        if (stored) {
            try {
                return new Set<ColumnKey>(JSON.parse(stored));
            } catch {
                // Fall back to defaults if localStorage is corrupted
            }
        }
        // Default columns (date under description; account optional via column picker)
        return new Set<ColumnKey>(['description', 'category', 'chargedAmount', 'status']);
    });
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

    const customCCKeywords = config.customCCKeywords ?? [];

    // Available categories in the current set of transactions
    const availableCategories = useMemo(() => {
        const categories = new Set<string>();
        transactions.forEach(t => {
            if (t.category) categories.add(t.category);
        });
        return Array.from(categories).sort();
    }, [transactions]);

    // Persist visible columns to localStorage
    useEffect(() => {
        localStorage.setItem('transactionTableColumns', JSON.stringify(Array.from(visibleColumns)));
    }, [visibleColumns]);

    const toggleColumn = (columnKey: ColumnKey) => {
        setVisibleColumns(prev => {
            const updated = new Set(prev);
            if (updated.has(columnKey)) {
                updated.delete(columnKey);
            } else {
                updated.add(columnKey);
            }
            // Ensure at least one column is visible
            if (updated.size === 0) {
                updated.add(columnKey);
            }
            return updated;
        });
    };

    const resetToDefaults = () => {
        setVisibleColumns(new Set(['description', 'category', 'chargedAmount', 'status']));
    };

    const filteredAndSortedTransactions = useMemo(() => {
        let result = [...transactions];

        // Search Filter
        if (search) {
            const lowerSearch = search.toLowerCase();
            result = result.filter(t =>
                t.description?.toLowerCase().includes(lowerSearch) ||
                t.memo?.toLowerCase().includes(lowerSearch) ||
                t.category?.toLowerCase().includes(lowerSearch) ||
                t.accountNumber?.toLowerCase().includes(lowerSearch) ||
                t.provider?.toLowerCase().includes(lowerSearch)
            );
        }

        // Category Filter
        if (selectedCategory !== 'all') {
            result = result.filter(t => t.category === selectedCategory);
        }

        // Type filter (ignored, installment, internal transfer, expense/income, subscription)
        if (typeFilter !== 'all') {
            result = result.filter(t => matchesTransactionTypeFilter(t, typeFilter, customCCKeywords));
        }

        // Sort
        result.sort((a, b) => {
            let valA: any = a[sortField as keyof Transaction] || '';
            let valB: any = b[sortField as keyof Transaction] || '';

            if (sortField === 'originalAmount') {
                valA = a.originalAmount ?? 0;
                valB = b.originalAmount ?? 0;
            }

            if (sortField === 'account') {
                const acctCmp = (a.accountNumber || '').localeCompare(b.accountNumber || '', undefined, {
                    numeric: true,
                    sensitivity: 'base',
                });
                if (acctCmp !== 0) return sortOrder === 'asc' ? acctCmp : -acctCmp;
                const provCmp = (a.provider || '').localeCompare(b.provider || '', undefined, {
                    sensitivity: 'base',
                });
                return sortOrder === 'asc' ? provCmp : -provCmp;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [transactions, sortField, sortOrder, search, selectedCategory, typeFilter, customCCKeywords]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US');
    };

    const formatAmount = (amount: number) => {
        return new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
        }).format(amount);
    };

    const formatStatus = (status?: string) => {
        if (!status) return t('common.unknown');
        switch (status) {
            case 'completed':
                return t('table.status_completed');
            case 'pending':
                return t('table.status_pending');
            default:
                return status;
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                <div className="relative flex-1 w-full sm:max-w-md">
                    <input
                        type="text"
                        placeholder={t('table.search_placeholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={`w-full ${i18n.language === 'he' ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    />
                    <div className={`absolute ${i18n.language === 'he' ? 'right-3' : 'left-3'} top-2.5 text-gray-400`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as TransactionTypeFilter)}
                        aria-label={t('table.type_filter_label')}
                        className={`py-2 px-3 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none cursor-pointer transition-all w-full sm:w-auto min-w-[10rem] ${i18n.language === 'he' ? 'text-right' : 'text-left'}`}
                    >
                        <option value="all">{t('table.type_filter_all')}</option>
                        <option value="ignored">{t('table.type_filter_ignored')}</option>
                        <option value="installment">{t('table.type_filter_installment')}</option>
                        <option value="internal_transfer">{t('table.type_filter_internal_transfer')}</option>
                        <option value="expense">{t('table.type_filter_expense')}</option>
                        <option value="income">{t('table.type_filter_income')}</option>
                        <option value="subscription">{t('table.type_filter_subscription')}</option>
                    </select>
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className={`py-2 px-3 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none cursor-pointer transition-all w-full sm:w-auto ${i18n.language === 'he' ? 'text-right' : 'text-left'}`}
                    >
                        <option value="all">{t('common.all_categories')}</option>
                        {availableCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowColumnPicker(!showColumnPicker)}
                        title={t('table.select_columns')}
                        className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v12m0 0l3-3m-3 3l-3-3m0 0V3m12 0v12m0 0l3-3m-3 3l-3-3m0 0V3" />
                        </svg>
                    </button>

                    {showColumnPicker && (
                        <div className={`absolute ${i18n.language === 'he' ? 'right-0' : 'left-0'} top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-50 w-[calc(100vw-2rem)] max-w-sm`}>
                            <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
                                {AVAILABLE_COLUMNS.map(col => (
                                    <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns.has(col.key)}
                                            onChange={() => toggleColumn(col.key)}
                                            className="rounded border-gray-300"
                                        />
                                        <span className="text-sm text-gray-700">{t(col.label)}</span>
                                    </label>
                                ))}
                                <div className="border-t border-gray-200 pt-2 mt-2">
                                    <button
                                        onClick={resetToDefaults}
                                        className={`w-full px-2 py-1 text-sm text-blue-600 hover:bg-gray-50 rounded ${i18n.language === 'he' ? 'text-right' : 'text-left'}`}
                                    >
                                        {t('table.reset_columns')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="text-sm text-gray-500 w-full sm:w-auto">
                    {t('table.showing_count', { showing: filteredAndSortedTransactions.length, total: transactions.length })}
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                {AVAILABLE_COLUMNS.filter(col => visibleColumns.has(col.key)).map(col => (
                                    <th
                                        key={col.key}
                                        className={`px-6 py-4 text-sm font-semibold text-gray-700 ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''} ${i18n.language === 'he' ? 'text-right' : 'text-left'}`}
                                        onClick={() => col.sortable && handleSort(col.key as SortField)}
                                    >
                                        {t(col.label)} {col.sortable && sortField === col.key && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredAndSortedTransactions.map((txn) => {
                                const isIgnored = txn.status === 'ignored' || txn.isIgnored === true;
                                return (
                                    <tr
                                        key={txn.id}
                                        className={clsx(
                                            'transition-colors cursor-pointer',
                                            isIgnored && 'border-l-4 border-l-amber-400 bg-amber-50/70 hover:bg-amber-100/70',
                                            !isIgnored && 'hover:bg-gray-50'
                                        )}
                                        onClick={() => setSelectedTransaction(txn)}
                                    >
                                        {AVAILABLE_COLUMNS.filter(col => visibleColumns.has(col.key)).map(col => renderColumn(col, txn))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <TransactionModal 
                transaction={selectedTransaction}
                isOpen={!!selectedTransaction}
                onClose={() => setSelectedTransaction(null)}
                categories={categories}
            />
        </div>
    );

    function renderColumn(col: ColumnConfig, txn: Transaction) {
        const baseClass = `px-6 py-4 text-sm ${i18n.language === 'he' ? 'text-right' : 'text-left'}`;

        switch (col.key) {
            case 'date':
                return (
                    <td key={col.key} className={`${baseClass} text-gray-600 whitespace-nowrap`}>
                        {formatDate(txn.date)}
                    </td>
                );
            case 'account': {
                const providerLabel = getProviderDisplayName(txn.provider, providers, i18n.language);
                return (
                    <td key={col.key} className={`${baseClass} text-gray-900 whitespace-nowrap`}>
                        <div className="font-medium tabular-nums">{txn.accountNumber || '—'}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{providerLabel}</div>
                    </td>
                );
            }
            case 'processedDate':
                return (
                    <td key={col.key} className={`${baseClass} text-gray-600 whitespace-nowrap`}>
                        {formatDate(txn.processedDate)}
                    </td>
                );
            case 'description': {
                const isIgnored = txn.status === 'ignored' || txn.isIgnored === true;
                return (
                    <td key={col.key} className={`${baseClass} text-gray-900`}>
                        <div>
                            <div className={clsx('font-medium flex items-center gap-2 flex-wrap', isIgnored && 'text-gray-500')}>
                                {isIgnored && (
                                    <span title={t('common.ignored')}><EyeOff size={16} className="shrink-0 text-amber-600" /></span>
                                )}
                                {txn.description}
                                {isInternalTransfer(txn, config.customCCKeywords) && (
                                    <div title={t('table.internal_transfer')}>
                                        <ArrowRightLeft
                                            size={14}
                                            className="text-blue-500"
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 tabular-nums">{formatDate(txn.date)}</div>
                            {txn.memo && <div className="text-xs text-gray-400 mt-0.5">{txn.memo}</div>}
                        </div>
                    </td>
                );
            }
            case 'memo':
                return (
                    <td key={col.key} className={`${baseClass} text-gray-600`}>
                        <div className="text-xs">{txn.memo || '-'}</div>
                    </td>
                );
            case 'category': {
                const CatIcon = getCategoryLucideIcon(expenseCategoryKey(txn.category));
                return (
                    <td key={col.key} className={baseClass}>
                        <div
                            className="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-gray-200 bg-gray-50 pl-2 pr-1.5 py-0.5 hover:bg-white transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <CatIcon className="w-3.5 h-3.5 shrink-0 text-gray-500" aria-hidden />
                            <select
                                value={txn.category || ''}
                                onChange={(e) => onUpdateCategory?.(txn.id, e.target.value)}
                                className="min-w-0 max-w-full bg-transparent border-0 text-gray-700 text-xs py-0.5 pl-0 pr-1 rounded-none focus:ring-0 focus:outline-none appearance-none cursor-pointer [field-sizing:content]"
                            >
                                <option value="">{t('table.uncategorized')}</option>
                                {categories.map((cat) => (
                                    <option key={cat} value={cat}>
                                        {cat}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </td>
                );
            }
            case 'chargedAmount':
                return (
                    <td key={col.key} className={`${baseClass} font-bold whitespace-nowrap ${(txn.chargedAmount || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatAmount(txn.chargedAmount || 0)}
                    </td>
                );
            case 'originalAmount':
                return (
                    <td key={col.key} className={`${baseClass} font-semibold whitespace-nowrap ${(txn.originalAmount || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatAmount(txn.originalAmount || 0)}
                    </td>
                );
            case 'status': {
                const isIgnored = txn.status === 'ignored' || txn.isIgnored === true;
                return (
                    <td key={col.key} className={baseClass}>
                        <span className={clsx(
                            'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] uppercase font-bold',
                            isIgnored && 'bg-amber-100 text-amber-800',
                            !isIgnored && txn.status === 'completed' && 'bg-green-100 text-green-700',
                            !isIgnored && txn.status !== 'completed' && 'bg-yellow-100 text-yellow-700'
                        )}>
                            {isIgnored && <EyeOff size={12} className="shrink-0" />}
                            {isIgnored ? t('common.ignored') : formatStatus(txn.status)}
                        </span>
                    </td>
                );
            }
            default:
                return null;
        }
    }
}
