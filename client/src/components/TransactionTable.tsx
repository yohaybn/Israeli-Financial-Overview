import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { useDashboardConfig } from '../hooks/useDashboardConfig';

interface TransactionTableProps {
    transactions: Transaction[];
    categories?: string[];
    onUpdateCategory?: (txnId: string, category: string) => void;
    onAddFilter?: (description: string) => void;
    onUpdateType?: (txnId: string, type: string) => void;
}

type SortField = 'date' | 'description' | 'originalAmount' | 'category';
type SortOrder = 'asc' | 'desc';
type ColumnKey = 'date' | 'description' | 'category' | 'chargedAmount' | 'status' | 'originalAmount' | 'memo' | 'processedDate';

interface ColumnConfig {
    key: ColumnKey;
    label: string;
    sortable: boolean;
    defaultVisible: boolean;
}

const AVAILABLE_COLUMNS: ColumnConfig[] = [
    { key: 'date', label: 'table.date', sortable: true, defaultVisible: true },
    { key: 'description', label: 'table.description', sortable: true, defaultVisible: true },
    { key: 'category', label: 'table.category', sortable: false, defaultVisible: true },
    { key: 'chargedAmount', label: 'table.amount', sortable: true, defaultVisible: true },
    { key: 'status', label: 'table.status', sortable: false, defaultVisible: true },
    { key: 'originalAmount', label: 'table.original_amount', sortable: true, defaultVisible: false },
    { key: 'memo', label: 'table.memo', sortable: false, defaultVisible: false },
    { key: 'processedDate', label: 'table.processed_date', sortable: false, defaultVisible: false },
];

export function TransactionTable({ transactions, categories = [], onUpdateCategory, onAddFilter, onUpdateType }: TransactionTableProps) {
    const { t, i18n } = useTranslation();
    const { config, updateConfig } = useDashboardConfig();

    const handleMarkAsCCPattern = (description: string) => {
        const existing = config.customCCKeywords ?? [];
        if (!existing.includes(description)) {
            updateConfig({ customCCKeywords: [...existing, description] });
        }
    };

    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [search, setSearch] = useState('');
    const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
        // Try to load from localStorage
        const stored = localStorage.getItem('transactionTableColumns');
        if (stored) {
            try {
                return new Set(JSON.parse(stored));
            } catch {
                // Fall back to defaults if localStorage is corrupted
            }
        }
        // Default columns
        return new Set<ColumnKey>(['date', 'description', 'category', 'chargedAmount', 'status']);
    });
    const [showColumnPicker, setShowColumnPicker] = useState(false);

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
        setVisibleColumns(new Set(['date', 'description', 'category', 'chargedAmount', 'status']));
    };

    const filteredAndSortedTransactions = useMemo(() => {
        let result = [...transactions];

        // Filter
        if (search) {
            const lowerSearch = search.toLowerCase();
            result = result.filter(t =>
                t.description?.toLowerCase().includes(lowerSearch) ||
                t.memo?.toLowerCase().includes(lowerSearch) ||
                t.category?.toLowerCase().includes(lowerSearch)
            );
        }

        // Sort
        result.sort((a, b) => {
            let valA: any = a[sortField as keyof Transaction] || '';
            let valB: any = b[sortField as keyof Transaction] || '';

            if (sortField === 'originalAmount') {
                valA = a.originalAmount ?? 0;
                valB = b.originalAmount ?? 0;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [transactions, sortField, sortOrder, search]);

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

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                <div className="relative flex-1 max-w-md">
                    <input
                        type="text"
                        placeholder={t('table.search_placeholder', 'Search transactions...')}
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

                <div className="relative">
                    <button
                        onClick={() => setShowColumnPicker(!showColumnPicker)}
                        title={t('table.select_columns', 'Select columns')}
                        className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v12m0 0l3-3m-3 3l-3-3m0 0V3m12 0v12m0 0l3-3m-3 3l-3-3m0 0V3" />
                        </svg>
                    </button>

                    {showColumnPicker && (
                        <div className={`absolute ${i18n.language === 'he' ? 'right-0' : 'left-0'} top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-max`}>
                            <div className="p-3 space-y-2">
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
                                        className="w-full text-left px-2 py-1 text-sm text-blue-600 hover:bg-gray-50 rounded"
                                    >
                                        {t('table.reset_columns', 'Reset to defaults')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="text-sm text-gray-500">
                    {t('table.showing_count', {
                        showing: filteredAndSortedTransactions.length,
                        total: transactions.length,
                        defaultValue: `Showing ${filteredAndSortedTransactions.length} of ${transactions.length} transactions`
                    })}
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
                            {filteredAndSortedTransactions.map((txn) => (
                                <tr key={txn.id} className="hover:bg-gray-50 transition-colors">
                                    {AVAILABLE_COLUMNS.filter(col => visibleColumns.has(col.key)).map(col => renderColumn(col, txn))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
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
            case 'processedDate':
                return (
                    <td key={col.key} className={`${baseClass} text-gray-600 whitespace-nowrap`}>
                        {formatDate(txn.processedDate)}
                    </td>
                );
            case 'description':
                return (
                    <td key={col.key} className={`${baseClass} text-gray-900 group relative`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-medium">{txn.description}</div>
                                {txn.memo && <div className="text-xs text-gray-400 mt-0.5">{txn.memo}</div>}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {/* Mark as CC Pattern button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleMarkAsCCPattern(txn.description);
                                    }}
                                    className="p-1 text-gray-400 hover:text-amber-500"
                                    title={t('table.mark_cc_pattern', 'Mark as CC payment pattern')}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                </button>
                                {txn.type !== 'internal_transfer' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onUpdateType) {
                                                onUpdateType(txn.id, 'internal_transfer');
                                            }
                                        }}
                                        className="p-1 text-gray-400 hover:text-blue-500"
                                        title={t('table.mark_internal_transfer', 'Mark as Internal Transfer')}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                    </button>
                                )}
                                {txn.status !== 'ignored' ? (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAddFilter?.(txn.description);
                                        }}
                                        className={`p-1 text-gray-400 hover:text-red-500 ${i18n.language === 'he' ? 'mr-1' : 'ml-1'}`}
                                        title={t('table.exclude_title', 'Exclude transactions like this')}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        </svg>
                                    </button>
                                ) : (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onUpdateType) onUpdateType(txn.id, 'normal');
                                        }}
                                        className={`p-1 text-gray-400 hover:text-green-500 ${i18n.language === 'he' ? 'mr-1' : 'ml-1'}`}
                                        title={t('table.unignore_title', 'Restore ignored transaction')}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    </td>
                );
            case 'memo':
                return (
                    <td key={col.key} className={`${baseClass} text-gray-600`}>
                        <div className="text-xs">{txn.memo || '-'}</div>
                    </td>
                );
            case 'category':
                return (
                    <td key={col.key} className={baseClass}>
                        <select
                            value={txn.category || ''}
                            onChange={(e) => onUpdateCategory?.(txn.id, e.target.value)}
                            className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-full px-2 py-1 focus:ring-blue-500 focus:border-blue-500 block w-full appearance-none cursor-pointer hover:bg-white transition-colors"
                        >
                            <option value="">{t('table.uncategorized', 'Uncategorized')}</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </td>
                );
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
            case 'status':
                return (
                    <td key={col.key} className={baseClass}>
                        <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${txn.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {txn.status}
                        </span>
                    </td>
                );
            default:
                return null;
        }
    }
}
