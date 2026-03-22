import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Transaction } from '@app/shared';
import { isInternalTransfer } from '../utils/transactionUtils';
import { 
    X, 
    Calendar, 
    DollarSign, 
    Tag, 
    EyeOff, 
    Eye, 
    ArrowRightLeft, 
    AlertCircle,
    CheckCircle2,
    Building2,
    Hash
} from 'lucide-react';
import { clsx } from 'clsx';
import { useDashboardConfig } from '../hooks/useDashboardConfig';
import { useUpdateTransactionCategory, useUpdateTransactionType, useToggleIgnore, useAddFilter, useFilters, useRemoveFilter, useUpdateTransactionMemo, useUpdateTransactionSubscription } from '../hooks/useScraper';
import { SubscriptionInterval } from '@app/shared';
import { Repeat } from 'lucide-react';
import { CategoryIcon } from '../utils/categoryIcons';

interface TransactionModalProps {
    transaction: Transaction | null;
    isOpen: boolean;
    onClose: () => void;
    categories?: string[];
}

export function TransactionModal({ transaction, isOpen, onClose, categories = [] }: TransactionModalProps) {
    const { t, i18n } = useTranslation();
    const { config, updateConfig } = useDashboardConfig();
    const { data: filters } = useFilters();
    const { mutate: updateCategory } = useUpdateTransactionCategory();
    const { mutate: updateType } = useUpdateTransactionType();
    const { mutate: toggleIgnore } = useToggleIgnore();
    const { mutate: addFilter } = useAddFilter();
    const { mutate: removeFilter } = useRemoveFilter();
    const { mutate: updateMemo } = useUpdateTransactionMemo();
    const { mutate: updateSubscription } = useUpdateTransactionSubscription();

    const [localCategory, setLocalCategory] = useState<string>('');
    const [localMemo, setLocalMemo] = useState<string>('');
    const [isEditingMemo, setIsEditingMemo] = useState(false);
    const [isInternalTransferPattern, setIsInternalTransferPattern] = useState(false);
    const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
    const [isSubscription, setIsSubscription] = useState(false);
    const [subscriptionInterval, setSubscriptionInterval] = useState<SubscriptionInterval>('monthly');
    const [excludeFromSubscriptions, setExcludeFromSubscriptions] = useState(false);
    const [localIsIgnored, setLocalIsIgnored] = useState(false);

    // Sync local state when transaction changes
    useEffect(() => {
        if (transaction) {
            setLocalCategory(transaction.category || '');
            setLocalMemo(transaction.memo || '');
            setIsEditingMemo(false);
            setIsInternalTransferPattern(config.customCCKeywords?.includes(transaction.description) || false);
            setIsSubscription(transaction.isSubscription || false);
            setSubscriptionInterval(transaction.subscriptionInterval || 'monthly');
            setExcludeFromSubscriptions(transaction.excludeFromSubscriptions || false);
            setLocalIsIgnored(transaction.status === 'ignored' || transaction.isIgnored === true);
        }
    }, [transaction, config.customCCKeywords]);

    // Check if there's an active filter for this description
    useEffect(() => {
        if (transaction && filters) {
            const filter = filters.find((f: any) => f.pattern === transaction.description);
            setActiveFilterId(filter ? filter.id : null);
        }
    }, [transaction, filters]);

    if (!isOpen || !transaction) return null;

    const handleCategoryChange = (newCategory: string) => {
        setLocalCategory(newCategory);
        updateCategory({ transactionId: transaction.id, category: newCategory });
    };

    const handleMemoSave = () => {
        updateMemo({ transactionId: transaction.id, memo: localMemo });
        setIsEditingMemo(false);
    };

    const handleToggleInternalTransferPattern = () => {
        const existing = config.customCCKeywords ?? [];
        let updated;
        if (isInternalTransferPattern) {
            updated = existing.filter(k => k !== transaction.description);
        } else {
            updated = [...existing, transaction.description];
        }
        updateConfig({ customCCKeywords: updated });
        setIsInternalTransferPattern(!isInternalTransferPattern);
    };

    const handleToggleFilter = () => {
        if (activeFilterId) {
            removeFilter(activeFilterId);
        } else {
            addFilter(transaction.description);
        }
    };

    const handleToggleIgnore = () => {
        const nextIgnored = !localIsIgnored;
        setLocalIsIgnored(nextIgnored);
        toggleIgnore({ transactionId: transaction.id, isIgnored: nextIgnored });
    };

    const handleMarkAsInternalTransfer = () => {
        const currentlyInternal = isInternalTransfer(transaction, config.customCCKeywords);
        updateType({ 
            transactionId: transaction.id, 
            type: currentlyInternal ? 'normal' : 'internal_transfer' 
        });
    };

    const handleToggleSubscription = () => {
        const newStatus = !isSubscription;
        setIsSubscription(newStatus);
        // If we mark as manual sub, we definitely don't want to exclude it
        if (newStatus) setExcludeFromSubscriptions(false);
        updateSubscription({ 
            transactionId: transaction.id, 
            isSubscription: newStatus, 
            interval: newStatus ? subscriptionInterval : null,
            excludeFromSubscriptions: newStatus ? false : excludeFromSubscriptions
        });
    };

    const handleToggleExclusion = () => {
        const newExclusion = !excludeFromSubscriptions;
        setExcludeFromSubscriptions(newExclusion);
        // If we exclude, it can't be a manual subscription
        if (newExclusion) setIsSubscription(false);
        updateSubscription({
            transactionId: transaction.id,
            isSubscription: newExclusion ? false : isSubscription,
            interval: newExclusion ? null : (isSubscription ? subscriptionInterval : null),
            excludeFromSubscriptions: newExclusion
        });
    };

    const handleIntervalChange = (newInterval: SubscriptionInterval) => {
        setSubscriptionInterval(newInterval);
        if (isSubscription) {
            updateSubscription({ 
                transactionId: transaction.id, 
                isSubscription: true, 
                interval: newInterval,
                excludeFromSubscriptions: false
            });
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatAmount = (amount: number, currency = 'ILS') => {
        return new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    };

    const isIgnored = localIsIgnored;
    const hasDifferentAmount = transaction.originalAmount !== transaction.chargedAmount;
    const isForeignCurrency = transaction.originalCurrency && transaction.originalCurrency !== 'ILS';

    const providerKey = `provider.${transaction.provider}`;
    const providerLabel = i18n.exists(providerKey) ? t(providerKey) : transaction.provider;

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-2xl bg-white/90 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]">
                
                {/* Header Section */}
                <div className={clsx(
                    "p-8 text-white relative flex justify-between items-start transition-colors duration-500",
                    isIgnored ? "bg-gradient-to-br from-gray-400 to-gray-600" :
                    transaction.chargedAmount < 0 ? "bg-gradient-to-br from-indigo-600 to-blue-700" : "bg-gradient-to-br from-emerald-500 to-teal-600"
                )}>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10">
                                {providerLabel}
                            </span>
                            {isIgnored && (
                                <span className="bg-red-500/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10">
                                    {t('common.ignored')}
                                </span>
                            )}
                            {isForeignCurrency && (
                                <span className="bg-amber-400/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-gray-900 uppercase tracking-widest border border-white/10">
                                    {transaction.originalCurrency}
                                </span>
                            )}
                            {isInternalTransfer(transaction, config.customCCKeywords) && (
                                <span className="bg-blue-400/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10 flex items-center gap-1">
                                    <ArrowRightLeft size={10} />
                                    {t('table.internal_transfer')}
                                </span>
                            )}
                        </div>
                        <h2 className="text-3xl font-black leading-tight tracking-tight drop-shadow-sm max-w-[80%]">
                            {transaction.description}
                        </h2>
                    </div>
                    
                    <button 
                        onClick={onClose}
                        className="bg-white/10 hover:bg-white/20 p-3 rounded-2xl transition-all border border-white/10 hover:rotate-90 shadow-lg"
                    >
                        <X size={20} />
                    </button>
                    
                    {/* Decorative abstract shape */}
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
                </div>

                {/* Body Section */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    
                    {/* Primary Stats Grid */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100 flex flex-col gap-1 group hover:border-blue-200 transition-colors">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <DollarSign size={12} className="text-blue-500" />
                                {t('table.amount')}
                            </span>
                            <span className={clsx(
                                "text-2xl font-black tabular-nums transition-transform duration-300 group-hover:scale-105 origin-left",
                                transaction.chargedAmount < 0 ? "text-rose-600" : "text-emerald-600"
                            )}>
                                {formatAmount(transaction.chargedAmount)}
                            </span>
                        </div>
                        
                        <div className="bg-blue-50/30 p-6 rounded-3xl border border-blue-100/50 flex flex-col gap-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Tag size={12} className="text-indigo-500" />
                                {t('table.category')}
                            </span>
                            <div className="flex items-center gap-3 min-w-0">
                                <CategoryIcon category={localCategory} className="w-7 h-7 text-indigo-600 shrink-0" />
                                <select
                                    value={localCategory}
                                    onChange={(e) => handleCategoryChange(e.target.value)}
                                    className="bg-transparent border-none text-xl font-bold text-gray-800 focus:ring-0 p-0 cursor-pointer appearance-none hover:text-indigo-600 transition-colors min-w-0 flex-1"
                                >
                                    <option value="">{t('table.uncategorized')}</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Memo Section */}
                    <div className="bg-gray-50/30 p-6 rounded-3xl border border-gray-100 space-y-3">
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Building2 size={12} className="text-gray-400" />
                                {t('transaction_modal.memo')}
                            </span>
                            {!isEditingMemo ? (
                                <button 
                                    onClick={() => setIsEditingMemo(true)}
                                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 uppercase tracking-widest transition-colors"
                                >
                                    {t('common.edit')}
                                </button>
                            ) : (
                                <button 
                                    onClick={handleMemoSave}
                                    className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600 uppercase tracking-widest transition-colors"
                                >
                                    {t('common.save')}
                                </button>
                            )}
                        </div>
                        {isEditingMemo ? (
                            <textarea
                                value={localMemo}
                                onChange={(e) => setLocalMemo(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none min-h-[80px] resize-none"
                                placeholder={t('transaction_modal.memo') + '...'}
                                autoFocus
                            />
                        ) : (
                            <p className={clsx(
                                "text-sm font-medium px-1",
                                localMemo ? "text-gray-700 italic" : "text-gray-400"
                            )}>
                                {localMemo || t('transaction_modal.memo') + '...'}
                            </p>
                        )}
                    </div>

                    {/* Detailed Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12 px-2">
                        <InfoItem icon={<Calendar size={16}/>} label={t('table.date')} value={formatDate(transaction.date)} />
                        <InfoItem icon={<Calendar size={16}/>} label={t('table.processed_date')} value={formatDate(transaction.processedDate)} />
                        <InfoItem 
                            icon={<Hash size={16}/>} 
                            label={t('common.account_number')} 
                            value={`${transaction.accountNumber || '-'} (${providerLabel})`} 
                        />
                        {hasDifferentAmount && (
                            <InfoItem 
                                icon={<DollarSign size={16}/>} 
                                label={t('transaction_modal.original_amount')} 
                                value={`${formatAmount(transaction.originalAmount, transaction.originalCurrency)} (${transaction.originalCurrency})`} 
                            />
                        )}
                        <InfoItem icon={<Building2 size={16}/>} label={t('transaction_modal.provider')} value={providerLabel} />
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

                    {/* Actions Section */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest px-2">
                            {t('transaction_modal.actions')}
                        </h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Specific Transaction Internal Transfer Toggle */}
                            <ActionButton 
                                icon={<ArrowRightLeft size={18} />}
                                label={isInternalTransfer(transaction, config.customCCKeywords) ? t('transaction_modal.restore') : t('transaction_modal.mark_internal_transfer')}
                                active={isInternalTransfer(transaction, config.customCCKeywords)}
                                onClick={handleMarkAsInternalTransfer}
                                color="blue"
                            />

                            {/* Internal Transfer Pattern Action */}
                            <ActionButton 
                                icon={<ArrowRightLeft size={18} className="opacity-50" />}
                                label={t('transaction_modal.internal_transfer_pattern')}
                                active={isInternalTransferPattern}
                                onClick={handleToggleInternalTransferPattern}
                                color="blue"
                            />

                            {/* Hide Pattern (Description) Action */}
                            <ActionButton 
                                icon={<EyeOff size={18} />}
                                label={activeFilterId ? t('transaction_modal.remove_pattern') : t('transaction_modal.hide_pattern')}
                                active={!!activeFilterId}
                                onClick={handleToggleFilter}
                                color="amber"
                            />

                            {/* Specific Transaction Ignore */}
                            <ActionButton 
                                icon={isIgnored ? <Eye size={18} /> : <AlertCircle size={18} />}
                                label={isIgnored ? t('transaction_modal.restore') : t('transaction_modal.ignore_this')}
                                active={isIgnored}
                                onClick={handleToggleIgnore}
                                color="rose"
                            />

                            <ActionButton 
                                icon={<Repeat size={18} />}
                                label={isSubscription ? t('transaction_modal.is_subscription') : t('transaction_modal.mark_as_subscription')}
                                active={isSubscription}
                                onClick={handleToggleSubscription}
                                color="amber"
                            />

                            <ActionButton 
                                icon={<EyeOff size={18} />}
                                label={excludeFromSubscriptions ? t('transaction_modal.excluded_from_subscriptions') : t('transaction_modal.not_a_subscription')}
                                active={excludeFromSubscriptions}
                                onClick={handleToggleExclusion}
                                color="rose"
                            />
                        </div>

                        {isSubscription && (
                            <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300 mx-2 mt-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                                        <Repeat size={12} />
                                        {t('transaction_modal.subscription_interval')}
                                    </span>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {(['daily', 'weekly', 'bi-weekly', 'monthly', 'annually'] as SubscriptionInterval[]).map((interval) => (
                                        <button
                                            key={interval}
                                            onClick={() => handleIntervalChange(interval)}
                                            className={clsx(
                                                "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                                                subscriptionInterval === interval 
                                                    ? "bg-amber-500 text-white shadow-md shadow-amber-200" 
                                                    : "bg-white text-gray-600 hover:bg-amber-100 border border-amber-100"
                                            )}
                                        >
                                            {i18n.exists(`common.interval.${interval}`) ? t(`common.interval.${interval}`) : interval}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* History / Consistency Section (Placeholder/Future) */}
                    {/* {transaction.history && (
                        <div className="space-y-4">
                             <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest px-2 flex items-center gap-2">
                                <HistoryIcon size={14} />
                                {t('transaction_modal.history')}
                            </h3>
                            ... implement history list here if data structure allows ...
                        </div>
                    )} */}

                </div>

                {/* Footer / Success State */}
                <div className="p-6 bg-gray-50/80 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all shadow-lg hover:shadow-gray-200 active:scale-95"
                    >
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
    return (
        <div className="flex items-start gap-4 group">
            <div className="mt-1 p-2 rounded-xl bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                {icon}
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tight">{label}</span>
                <span className="text-sm font-bold text-gray-700">{value}</span>
            </div>
        </div>
    );
}

function ActionButton({ icon, label, active, onClick, color }: { 
    icon: React.ReactNode, 
    label: string, 
    active: boolean, 
    onClick: () => void,
    color: 'blue' | 'rose' | 'amber'
}) {
    const colorClasses = {
        blue: active ? "bg-blue-600 border-blue-600 text-white shadow-blue-200" : "bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100",
        rose: active ? "bg-rose-600 border-rose-600 text-white shadow-rose-200" : "bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100",
        amber: active ? "bg-amber-500 border-amber-500 text-white shadow-amber-200" : "bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100",
    };

    return (
        <button 
            onClick={onClick}
            className={clsx(
                "flex items-center gap-3 px-5 py-4 rounded-3xl border transition-all duration-300 font-bold text-xs shadow-sm hover:-translate-y-0.5 active:translate-y-0",
                colorClasses[color]
            )}
        >
            <div className={clsx(
                "p-1.5 rounded-lg transition-colors",
                active ? "bg-white/20" : "bg-white/50"
            )}>
                {icon}
            </div>
            <span className="flex-1 text-left">{label}</span>
            {active && <CheckCircle2 size={16} className="text-white/80" />}
        </button>
    );
}
