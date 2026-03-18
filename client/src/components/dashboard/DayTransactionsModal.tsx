import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { TransactionTable } from '../TransactionTable';

interface DayTransactionsModalProps {
    title: string;
    transactions: Transaction[];
    categories?: string[];
    onUpdateCategory?: (transactionId: string, category: string) => void;
    onClose: () => void;
}

export function DayTransactionsModal({
    title,
    transactions,
    categories,
    onUpdateCategory,
    onClose
}: DayTransactionsModalProps) {
    const { t } = useTranslation();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {t('table.showing_count', { showing: transactions.length, total: transactions.length })}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
                    {transactions.length > 0 ? (
                        <TransactionTable
                            transactions={transactions}
                            categories={categories}
                            onUpdateCategory={onUpdateCategory}
                        />
                    ) : (
                        <div className="text-center text-gray-400 py-10 bg-white rounded-xl border border-dashed border-gray-200">
                            {t('dashboard.no_transactions_found')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
