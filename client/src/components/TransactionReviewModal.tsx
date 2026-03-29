import { useTranslation } from 'react-i18next';
import type { Transaction } from '@app/shared';
import { TransactionTable } from './TransactionTable';
import { ClipboardList } from 'lucide-react';

interface TransactionReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    transactions: Transaction[];
    categories?: string[];
    onUpdateCategory?: (transactionId: string, category: string) => void;
}

export function TransactionReviewModal({
    isOpen,
    onClose,
    transactions,
    categories,
    onUpdateCategory,
}: TransactionReviewModalProps) {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-gray-100 bg-sky-50/40">
                    <div className="flex gap-3 min-w-0">
                        <div className="w-10 h-10 bg-sky-100 text-sky-700 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                            <ClipboardList className="w-5 h-5" aria-hidden />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-gray-900">{t('transaction_review.modal_title')}</h2>
                            <p className="text-sm text-gray-600 mt-0.5">{t('transaction_review.modal_subtitle')}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                        aria-label={t('common.close')}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50/50">
                    {transactions.length > 0 ? (
                        <TransactionTable
                            transactions={transactions}
                            categories={categories}
                            onUpdateCategory={onUpdateCategory}
                        />
                    ) : (
                        <p className="text-center text-gray-500 py-12">{t('transaction_review.modal_empty')}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
