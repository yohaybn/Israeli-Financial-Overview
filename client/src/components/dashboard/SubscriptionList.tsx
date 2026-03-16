import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Subscription, Transaction } from '@app/shared';
import { CreditCard, ArrowRight, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { TransactionModal } from '../TransactionModal';
import { TransactionTable } from '../TransactionTable';

interface SubscriptionListProps {
    subscriptions: Subscription[];
    categories?: string[];
    onUpdateCategory?: (txnId: string, category: string) => void;
}

export function SubscriptionList({ subscriptions, categories, onUpdateCategory }: SubscriptionListProps) {
    const { t, i18n } = useTranslation();
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
    const [selectedHistorySub, setSelectedHistorySub] = useState<Subscription | null>(null);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const getRemainingDays = (dateStr: string) => {
        const target = new Date(dateStr);
        const now = new Date();
        const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return diff;
    };

    const totalMonthlyCost = subscriptions.reduce((acc, sub) => {
        let monthlyAmount = sub.amount;
        if (sub.interval === 'annually') monthlyAmount /= 12;
        if (sub.interval === 'weekly') monthlyAmount *= 4.3;
        if (sub.interval === 'bi-weekly') monthlyAmount *= 2.15;
        if (sub.interval === 'daily') monthlyAmount *= 30;
        return acc + monthlyAmount;
    }, 0);

    const formatInterval = (interval: string) => {
        const key = `common.interval.${interval}`;
        return i18n.exists(key) ? t(key) : interval;
    };

    return (
        <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/20 p-8 overflow-hidden relative group">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform duration-500">
                        <CreditCard className="text-white w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">
                            {t('dashboard.subscriptions')}
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-indigo-500">
                                {subscriptions.length} {t('dashboard.paying_now')}
                            </span>
                            <span className="text-[10px] text-gray-300">•</span>
                            <span className="text-xs font-medium text-gray-400">
                                ~{formatCurrency(totalMonthlyCost)}/{t('common.month')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {subscriptions.length > 0 ? (
                    subscriptions
                        .sort((a, b) => getRemainingDays(a.nextExpectedDate) - getRemainingDays(b.nextExpectedDate))
                        .map((sub, idx) => {
                            const daysLeft = getRemainingDays(sub.nextExpectedDate);
                            return (
                                <div 
                                    key={`${sub.description}-${idx}`}
                                    className="relative flex items-center justify-between p-5 rounded-[2rem] bg-gray-50/50 border border-gray-100 hover:bg-white hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group/item cursor-pointer"
                                    onClick={() => setSelectedHistorySub(sub)}
                                >
                                    <div className="flex items-center gap-5">
                                        <div className={clsx(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm transition-colors duration-500",
                                            sub.isManual ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"
                                        )}>
                                            {sub.description.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-gray-800 tracking-tight group-hover/item:text-indigo-600 transition-colors">
                                                {sub.description}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {formatInterval(sub.interval)}
                                                </span>
                                                {sub.isManual && (
                                                    <span className="bg-amber-100/50 text-amber-600 text-[8px] font-black uppercase px-2 py-0.5 rounded-full border border-amber-200/50">
                                                        {t('common.manual')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <p className="text-sm font-black text-gray-900">
                                                {formatCurrency(sub.amount)}
                                            </p>
                                            <p className={clsx(
                                                "text-[10px] font-bold uppercase tracking-tighter mt-0.5",
                                                daysLeft <= 3 ? "text-rose-500 animate-pulse" : "text-gray-400"
                                            )}>
                                                {daysLeft === 0 
                                                    ? t('dashboard.today')
                                                    : daysLeft === 1 
                                                        ? t('dashboard.tomorrow')
                                                        : daysLeft < 0
                                                            ? t('dashboard.past_due')
                                                            : t('dashboard.in_days', { days: daysLeft })}
                                            </p>
                                        </div>
                                        <div className="opacity-0 group-hover/item:opacity-100 transition-opacity">
                                            <ArrowRight size={16} className="text-indigo-400" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-100 rounded-[2.5rem] bg-gray-50/30 text-center space-y-4">
                        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm">
                            <CreditCard className="w-8 h-8 text-gray-200" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-gray-400 uppercase tracking-tight">
                                {t('dashboard.no_subscriptions')}
                            </p>
                            <p className="text-[10px] text-gray-300 mt-1 max-w-[200px] mx-auto">
                                {t('dashboard.subscription_hint')}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Subscription History Modal */}
            {selectedHistorySub && createPortal(
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
                    <div 
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
                        onClick={() => setSelectedHistorySub(null)}
                    />
                    <div className="relative w-full max-w-5xl bg-white/95 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]">
                        <div className="p-8 bg-gradient-to-br from-indigo-600 to-blue-700 text-white relative">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                                    <CreditCard size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black tracking-tight">{selectedHistorySub.description}</h2>
                                    <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">{t('transaction_modal.history')}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedHistorySub(null)}
                                className="absolute top-8 right-8 bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all border border-white/10"
                            >
                                <ArrowRight className="rotate-180" size={18} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-gray-50/30">
                            {selectedHistorySub.history && selectedHistorySub.history.length > 0 ? (
                                <TransactionTable 
                                    transactions={selectedHistorySub.history}
                                    categories={categories}
                                    onUpdateCategory={onUpdateCategory}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                    <p>{t('dashboard.no_transactions_found')}</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-6 bg-white border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setSelectedHistorySub(null)}
                                className="px-6 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-all"
                            >
                                {t('common.close')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Transaction Detail Modal */}
            <TransactionModal 
                transaction={selectedTxn}
                isOpen={!!selectedTxn}
                onClose={() => setSelectedTxn(null)}
                categories={categories}
            />
        </div>
    );
}
