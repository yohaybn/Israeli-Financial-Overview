import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { ArrowRightLeft } from 'lucide-react';
import { TransactionModal } from '../TransactionModal';

interface TransferDetectionBannerProps {
    count: number;
    total: number;
    transactions: Transaction[];
}

export function TransferDetectionBanner({ count, total, transactions }: TransferDetectionBannerProps) {
    const { t, i18n } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    if (count === 0) return null;

    return (
        <div className="bg-blue-50/40 rounded-xl border border-blue-100/50 overflow-hidden transition-all duration-300">
            {/* Main Banner - more compact */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between py-2 px-4 hover:bg-blue-50/60 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="text-blue-500">
                        <ArrowRightLeft size={16} />
                    </div>
                    <div className="text-left">
                        <p className="text-xs font-bold text-blue-700">
                            {t('dashboard.transfers_detected', { count, defaultValue: `${count} Internal Transfers Detected` })}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-blue-600 bg-white/50 px-2 py-0.5 rounded-full border border-blue-100">
                        {formatCurrency(total)}
                    </span>
                    <svg
                        className={`w-3.5 h-3.5 text-blue-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* Expanded Detail */}
            {isExpanded && (
                <div className="px-4 pb-4 border-t border-blue-100">
                    <p className="text-xs text-blue-500 mt-3 mb-3 bg-white/60 rounded-lg p-2.5 border border-blue-100">
                        💡 {t('dashboard.transfer_explanation', 'These are credit card settlement payments from your bank account. The individual card transactions are already counted as expenses, so these lump-sum payments are excluded to avoid double-counting.')}
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {transactions.map((txn, idx) => (
                            <div
                                key={txn.id || idx}
                                onClick={() => setSelectedTxn(txn)}
                                className="flex items-center justify-between py-2 px-3 bg-white/70 rounded-lg text-xs border border-blue-50 hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 bg-blue-100 rounded text-blue-500 flex items-center justify-center">
                                        <ArrowRightLeft size={10} />
                                    </span>
                                    <div>
                                        <span className="font-medium text-gray-700 truncate block max-w-[250px]">{txn.description}</span>
                                        <span className="text-gray-400 text-[10px]">
                                            {new Date(txn.date).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US')} • {txn.provider}
                                        </span>
                                    </div>
                                </div>
                                <span className="font-bold text-blue-600 tabular-nums">
                                    {formatCurrency(Math.abs(txn.chargedAmount || txn.amount || 0))}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <TransactionModal 
                transaction={selectedTxn}
                isOpen={!!selectedTxn}
                onClose={() => setSelectedTxn(null)}
            />
        </div>
    );
}
