import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Transaction,
    expenseCategoryKey,
    transactionsToCsv,
    transactionsToJson,
    mergeCategoryMeta,
    defaultExpenseMetaForCategory,
    EXPENSE_META_BUCKETS,
    type ExpenseMetaCategory,
} from '@app/shared';
import { ArrowRightLeft, ChevronDown, Download, EyeOff, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { TransactionModal } from './TransactionModal';
import { isInternalTransfer } from '../utils/transactionUtils';
import { useDashboardConfig } from '../hooks/useDashboardConfig';
import { useAISettings } from '../hooks/useScraper';
import { useProviders, getProviderDisplayName } from '../hooks/useProviders';
import { getCategoryLucideIcon } from '../utils/categoryIcons';
import { transactionMatchesSearchQuery } from '../utils/transactionSearch';

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

const TYPE_FILTER_OPTIONS: Exclude<TransactionTypeFilter, 'all'>[] = [
    'ignored',
    'installment',
    'internal_transfer',
    'expense',
    'income',
    'subscription',
];

/** Prefix for meta-category `<option value>` in the category toolbar select (avoids collision with real category names). */
const CATEGORY_TOOLBAR_META_PREFIX = '__toolbar_meta:';

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
    const [metaCategoryFilter, setMetaCategoryFilter] = useState<'all' | ExpenseMetaCategory>('all');
    /** `provider|accountNumber` from current rows; distinguishes accounts across institutions. */
    const [selectedAccountKey, setSelectedAccountKey] = useState<string>('all');
    const [typeTxnFilter, setTypeTxnFilter] = useState<TransactionTypeFilter>('all');
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [exportingView, setExportingView] = useState<'csv' | 'json' | null>(null);
    const [viewDownloadOpen, setViewDownloadOpen] = useState(false);
    const viewDownloadRef = useRef<HTMLDivElement>(null);

    const customCCKeywords = config.customCCKeywords ?? [];
    const { data: aiSettings } = useAISettings();

    const categoryListForMeta = useMemo(
        () => (categories.length > 0 ? categories : aiSettings?.categories ?? []),
        [categories, aiSettings?.categories]
    );

    const mergedCategoryMeta = useMemo(
        () => mergeCategoryMeta(categoryListForMeta, aiSettings?.categoryMeta),
        [categoryListForMeta, aiSettings?.categoryMeta]
    );

    useEffect(() => {
        if (!viewDownloadOpen) return;
        const onDoc = (e: MouseEvent) => {
            if (viewDownloadRef.current && !viewDownloadRef.current.contains(e.target as Node)) {
                setViewDownloadOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setViewDownloadOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [viewDownloadOpen]);

    /** Category filter options: AI/settings list plus any categories present in the current rows. */
    const availableCategories = useMemo(() => {
        const set = new Set<string>();
        for (const c of categories) {
            if (c) set.add(c);
        }
        transactions.forEach((t) => {
            if (t.category) set.add(t.category);
        });
        return Array.from(set).sort();
    }, [transactions, categories]);

    const accountOptions = useMemo(() => {
        const byKey = new Map<string, { provider: string; accountNumber: string }>();
        for (const t of transactions) {
            const key = `${t.provider}|${t.accountNumber ?? ''}`;
            if (!byKey.has(key)) {
                byKey.set(key, { provider: t.provider, accountNumber: t.accountNumber ?? '' });
            }
        }
        return Array.from(byKey.entries()).sort((a, b) => {
            const acctCmp = (a[1].accountNumber || '').localeCompare(b[1].accountNumber || '', undefined, {
                numeric: true,
                sensitivity: 'base',
            });
            if (acctCmp !== 0) return acctCmp;
            return a[1].provider.localeCompare(b[1].provider, undefined, { sensitivity: 'base' });
        });
    }, [transactions]);

    useEffect(() => {
        if (selectedAccountKey === 'all') return;
        const valid = accountOptions.some(([k]) => k === selectedAccountKey);
        if (!valid) setSelectedAccountKey('all');
    }, [accountOptions, selectedAccountKey]);

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

        // Search: text fields + amounts (see transactionSearch)
        if (search) {
            result = result.filter((t) => transactionMatchesSearchQuery(t, search));
        }

        // Category Filter
        if (selectedCategory !== 'all') {
            result = result.filter(t => t.category === selectedCategory);
        }

        // Account (provider + account number)
        if (selectedAccountKey !== 'all') {
            result = result.filter(
                (t) => `${t.provider}|${t.accountNumber ?? ''}` === selectedAccountKey
            );
        }

        // Meta-category filter (fixed / variable / optimization / excluded)
        if (metaCategoryFilter !== 'all') {
            result = result.filter((t) => {
                const key = expenseCategoryKey(t.category);
                const meta = mergedCategoryMeta[key] ?? defaultExpenseMetaForCategory(key);
                return meta === metaCategoryFilter;
            });
        }

        // Type filter (ignored, installment, internal transfer, expense/income, subscription)
        if (typeTxnFilter !== 'all') {
            result = result.filter((t) => matchesTransactionTypeFilter(t, typeTxnFilter, customCCKeywords));
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
    }, [
        transactions,
        sortField,
        sortOrder,
        search,
        selectedCategory,
        selectedAccountKey,
        metaCategoryFilter,
        mergedCategoryMeta,
        typeTxnFilter,
        customCCKeywords,
    ]);

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

    const downloadCurrentView = (format: 'csv' | 'json') => {
        setViewDownloadOpen(false);
        const rows = filteredAndSortedTransactions;
        if (rows.length === 0) {
            window.alert(t('table.export_empty'));
            return;
        }
        setExportingView(format);
        try {
            const stamp = new Date().toISOString().slice(0, 10);
            const body = format === 'json' ? transactionsToJson(rows) : transactionsToCsv(rows);
            const mime =
                format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
            const ext = format === 'json' ? 'json' : 'csv';
            const blob = new Blob([body], { type: mime });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `transactions-view-${stamp}.${ext}`;
            a.click();
            URL.revokeObjectURL(a.href);
        } finally {
            setExportingView(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-md shadow-gray-200/80 border border-gray-100/90 space-y-3">
                <div className="flex min-w-0 items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search
                            className="pointer-events-none absolute start-4 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-gray-400"
                            strokeWidth={2}
                            aria-hidden
                        />
                        <input
                            type="search"
                            enterKeyHint="search"
                            placeholder={t('table.toolbar_search_placeholder')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-full border border-gray-200 bg-white py-2.5 ps-11 pe-4 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition-[box-shadow,border-color] focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        />
                    </div>
                    <div className="relative shrink-0" ref={viewDownloadRef}>
                        <button
                            type="button"
                            id="transaction-table-download-trigger"
                            aria-haspopup="menu"
                            aria-expanded={viewDownloadOpen}
                            aria-controls="transaction-table-download-menu"
                            disabled={exportingView !== null}
                            onClick={() => setViewDownloadOpen((o) => !o)}
                            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-slate-700/20 bg-white px-3 sm:px-4 text-sm font-medium text-slate-800 shadow-sm outline-none transition-colors hover:border-slate-700/35 hover:bg-slate-50/80 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-slate-300"
                        >
                            {exportingView !== null ? (
                                '…'
                            ) : (
                                <>
                                    <Download className="h-4 w-4 shrink-0 text-slate-600" strokeWidth={2} aria-hidden />
                                    <span className="whitespace-nowrap">{t('dashboard.download')}</span>
                                    <ChevronDown
                                        className={clsx(
                                            'h-4 w-4 shrink-0 text-slate-500 transition-transform',
                                            viewDownloadOpen && 'rotate-180'
                                        )}
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                </>
                            )}
                        </button>
                        {viewDownloadOpen && exportingView === null && (
                            <div
                                id="transaction-table-download-menu"
                                role="menu"
                                aria-labelledby="transaction-table-download-trigger"
                                className={`absolute top-full z-50 mt-1.5 min-w-[10.5rem] rounded-xl border border-gray-200 bg-white py-1 shadow-lg ${i18n.language === 'he' ? 'start-0' : 'end-0'}`}
                            >
                                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                    {t('table.export_view_aria')}
                                </p>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full px-3 py-2 text-start text-sm text-gray-800 hover:bg-sky-50"
                                    onClick={() => downloadCurrentView('csv')}
                                >
                                    {t('table.export_view_csv')}
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full px-3 py-2 text-start text-sm text-gray-800 hover:bg-sky-50"
                                    onClick={() => downloadCurrentView('json')}
                                >
                                    {t('table.export_view_json')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex min-w-0 items-center gap-2">
                    <div className="flex min-h-9 min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <div
                            className={clsx(
                                'relative inline-flex w-[6.75rem] shrink-0 items-center gap-0.5 rounded-full border text-xs font-medium text-gray-800 transition-colors sm:w-[7.25rem]',
                                typeTxnFilter !== 'all' ? 'border-sky-200 bg-sky-50/90' : 'border-gray-200/90 bg-gray-100'
                            )}
                        >
                            <span className="shrink-0 ps-2 text-gray-500">{t('table.toolbar_type_prefix')}</span>
                            <select
                                value={typeTxnFilter}
                                onChange={(e) => setTypeTxnFilter(e.target.value as TransactionTypeFilter)}
                                aria-label={t('table.type_filter_label')}
                                className={clsx(
                                    'min-w-0 flex-1 cursor-pointer appearance-none rounded-full border-0 bg-transparent py-1.5 pe-7 text-xs text-gray-900 outline-none focus:ring-0 truncate',
                                    i18n.language === 'he' ? 'text-right' : 'text-left'
                                )}
                            >
                                <option value="all">{t('common.all')}</option>
                                <optgroup label={t('table.type_filter_group')}>
                                    {TYPE_FILTER_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {t(`table.type_filter_${opt}`)}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                            <ChevronDown
                                className="pointer-events-none absolute end-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
                                strokeWidth={2}
                                aria-hidden
                            />
                        </div>

                        <div
                            className={clsx(
                                'relative inline-flex w-[6.75rem] shrink-0 items-center gap-0.5 rounded-full border text-xs font-medium text-gray-800 transition-colors sm:w-[7.25rem]',
                                selectedCategory !== 'all' || metaCategoryFilter !== 'all'
                                    ? 'border-sky-200 bg-sky-50/90'
                                    : 'border-gray-200/90 bg-gray-100'
                            )}
                        >
                            <span className="shrink-0 ps-2 text-gray-500">{t('table.toolbar_category_prefix')}</span>
                            <select
                                value={
                                    metaCategoryFilter !== 'all'
                                        ? `${CATEGORY_TOOLBAR_META_PREFIX}${metaCategoryFilter}`
                                        : selectedCategory
                                }
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === 'all') {
                                        setSelectedCategory('all');
                                        setMetaCategoryFilter('all');
                                        return;
                                    }
                                    if (v.startsWith(CATEGORY_TOOLBAR_META_PREFIX)) {
                                        const m = v.slice(
                                            CATEGORY_TOOLBAR_META_PREFIX.length
                                        ) as ExpenseMetaCategory;
                                        if ((EXPENSE_META_BUCKETS as readonly string[]).includes(m)) {
                                            setMetaCategoryFilter(m);
                                            setSelectedCategory('all');
                                        }
                                        return;
                                    }
                                    setSelectedCategory(v);
                                    setMetaCategoryFilter('all');
                                }}
                                aria-label={`${t('table.category')}. ${t('table.meta_category_filter_group')}`}
                                className={clsx(
                                    'min-w-0 flex-1 cursor-pointer appearance-none rounded-full border-0 bg-transparent py-1.5 pe-7 text-xs text-gray-900 outline-none focus:ring-0 truncate',
                                    i18n.language === 'he' ? 'text-right' : 'text-left'
                                )}
                            >
                                <option value="all">{t('common.all')}</option>
                                <optgroup label={t('table.category')}>
                                    {availableCategories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label={t('table.meta_category_filter_group')}>
                                    {EXPENSE_META_BUCKETS.map((key) => (
                                        <option key={key} value={`${CATEGORY_TOOLBAR_META_PREFIX}${key}`}>
                                            {t(`ai_settings.meta_${key}`)}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                            <ChevronDown
                                className="pointer-events-none absolute end-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
                                strokeWidth={2}
                                aria-hidden
                            />
                        </div>

                        <div
                            className={clsx(
                                'relative inline-flex w-[6.75rem] shrink-0 items-center gap-0.5 rounded-full border text-xs font-medium text-gray-800 transition-colors sm:w-[7.25rem]',
                                selectedAccountKey !== 'all' ? 'border-sky-200 bg-sky-50/90' : 'border-sky-100/80 bg-sky-50/50'
                            )}
                        >
                            <span className="shrink-0 ps-2 text-gray-500">{t('table.toolbar_account_prefix')}</span>
                            <select
                                value={selectedAccountKey}
                                onChange={(e) => setSelectedAccountKey(e.target.value)}
                                aria-label={t('table.account_filter_label')}
                                className={clsx(
                                    'min-w-0 flex-1 cursor-pointer appearance-none rounded-full border-0 bg-transparent py-1.5 pe-7 text-xs text-gray-900 outline-none focus:ring-0 truncate',
                                    i18n.language === 'he' ? 'text-right' : 'text-left'
                                )}
                            >
                                <option value="all">{t('common.all')}</option>
                                {accountOptions.map(([key, { provider, accountNumber }]) => {
                                    const providerLabel = getProviderDisplayName(provider, providers, i18n.language);
                                    const acct = accountNumber || '—';
                                    return (
                                        <option key={key} value={key}>
                                            {acct} — {providerLabel}
                                        </option>
                                    );
                                })}
                            </select>
                            <ChevronDown
                                className="pointer-events-none absolute end-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
                                strokeWidth={2}
                                aria-hidden
                            />
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 border-s border-gray-100 ps-2">
                        <p className="hidden max-w-[10rem] truncate text-[11px] leading-tight text-gray-500 sm:block">
                            {t('table.showing_count', {
                                showing: filteredAndSortedTransactions.length,
                                total: transactions.length,
                            })}
                        </p>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowColumnPicker(!showColumnPicker)}
                                title={t('table.select_columns')}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200/90 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M9 3v12m0 0l3-3m-3 3l-3-3m0 0V3m12 0v12m0 0l3-3m-3 3l-3-3m0 0V3"
                                    />
                                </svg>
                            </button>

                            {showColumnPicker && (
                                <div
                                    className={`absolute z-50 mt-2 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-gray-200 bg-white shadow-lg ${i18n.language === 'he' ? 'end-0' : 'start-0'}`}
                                >
                                    <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
                                        {AVAILABLE_COLUMNS.map((col) => (
                                            <label
                                                key={col.key}
                                                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-50"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={visibleColumns.has(col.key)}
                                                    onChange={() => toggleColumn(col.key)}
                                                    className="rounded border-gray-300"
                                                />
                                                <span className="text-sm text-gray-700">{t(col.label)}</span>
                                            </label>
                                        ))}
                                        <div className="mt-2 border-t border-gray-200 pt-2">
                                            <button
                                                type="button"
                                                onClick={resetToDefaults}
                                                className={`w-full rounded-lg px-2 py-1.5 text-sm text-blue-600 hover:bg-gray-50 ${i18n.language === 'he' ? 'text-right' : 'text-left'}`}
                                            >
                                                {t('table.reset_columns')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <p className="text-[11px] text-gray-500 sm:hidden">
                    {t('table.showing_count', {
                        showing: filteredAndSortedTransactions.length,
                        total: transactions.length,
                    })}
                </p>
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
