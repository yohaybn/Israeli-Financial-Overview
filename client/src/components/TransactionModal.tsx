import React, { useState, useEffect, useMemo, useRef } from 'react';
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
    Building2,
    Hash,
    ChevronDown,
    Repeat,
    TrendingUp,
    CheckCircle2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useDashboardConfig } from '../hooks/useDashboardConfig';
import { useProviders, getProviderDisplayName } from '../hooks/useProviders';
import {
    useUpdateTransactionCategory,
    useUpdateTransactionType,
    useToggleIgnore,
    useAddFilter,
    useFilters,
    useRemoveFilter,
    useUpdateTransactionMemo,
    useUpdateTransactionSubscription,
    useUpdateTransactionInvestment,
    useCreateInvestmentFromTransaction,
} from '../hooks/useScraper';
import { SubscriptionInterval } from '@app/shared';
import { CategoryIcon } from '../utils/categoryIcons';
import { useUnifiedData } from '../hooks/useUnifiedData';
import { useInvestmentAppSettings } from '../hooks/useInvestments';

interface TransactionModalProps {
    transaction: Transaction | null;
    isOpen: boolean;
    onClose: () => void;
    categories?: string[];
}

const SUBSCRIPTION_INTERVALS: SubscriptionInterval[] = [
    'daily',
    'weekly',
    'bi-weekly',
    'monthly',
    'annually',
];

/** Keys shown in the collapsible “All details” grid (labels from `transaction.fields.*`). */
const ALL_DETAILS_FIELD_KEYS: (keyof Transaction)[] = [
    'id',
    'externalId',
    'voucherNumber',
    'sourceRef',
    'status',
    'type',
    'installments',
    'txnType',
    'amount',
    'chargedAmount',
    'chargedCurrency',
    'originalAmount',
    'originalCurrency',
    'isIgnored',
    'isInternalTransfer',
    'isSubscription',
    'subscriptionInterval',
    'excludeFromSubscriptions',
    'categoryUserSet',
    'isInvestment',
    'investmentId',
];

export function TransactionModal({ transaction, isOpen, onClose, categories = [] }: TransactionModalProps) {
    const { t, i18n } = useTranslation();
    const { data: unifiedList = [] } = useUnifiedData({ enabled: isOpen && !!transaction });
    const { data: investmentAppSettings } = useInvestmentAppSettings({ enabled: isOpen });
    const investmentsFeatureOn = investmentAppSettings?.featureEnabled !== false;
    const resolvedTransaction = useMemo(() => {
        if (!transaction) return null;
        const fresh = unifiedList.find((t) => t.id === transaction.id);
        return fresh ?? transaction;
    }, [transaction, unifiedList]);

    const { config, updateConfig } = useDashboardConfig();
    const { data: providers } = useProviders();
    const { data: filters } = useFilters();
    const { mutate: updateCategory } = useUpdateTransactionCategory();
    const { mutate: updateType } = useUpdateTransactionType();
    const { mutate: toggleIgnore } = useToggleIgnore();
    const { mutate: addFilter } = useAddFilter();
    const { mutate: removeFilter } = useRemoveFilter();
    const { mutate: updateMemo } = useUpdateTransactionMemo();
    const { mutate: updateSubscription } = useUpdateTransactionSubscription();
    const { mutate: updateInvestmentFlag } = useUpdateTransactionInvestment();
    const { mutateAsync: createInvestmentFromTxn, isPending: createInvestmentPending } =
        useCreateInvestmentFromTransaction();

    const [localCategory, setLocalCategory] = useState<string>('');
    const [localMemo, setLocalMemo] = useState<string>('');
    const [isEditingMemo, setIsEditingMemo] = useState(false);
    const [isInternalTransferPattern, setIsInternalTransferPattern] = useState(false);
    const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
    const [isSubscription, setIsSubscription] = useState(false);
    const [subscriptionInterval, setSubscriptionInterval] = useState<SubscriptionInterval>('monthly');
    const [excludeFromSubscriptions, setExcludeFromSubscriptions] = useState(false);
    const [localIsIgnored, setLocalIsIgnored] = useState(false);
    const [moreActionsOpen, setMoreActionsOpen] = useState(false);
    const [allDetailsOpen, setAllDetailsOpen] = useState(false);
    const [localIsInvestment, setLocalIsInvestment] = useState(false);
    const [invSymbol, setInvSymbol] = useState('');
    const [invQty, setInvQty] = useState('');
    const [localTelAvivQuote, setLocalTelAvivQuote] = useState(true);
    const [invCreateFeedback, setInvCreateFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
    const invCreateFeedbackTimer = useRef<number | null>(null);

    const clearInvCreateFeedbackTimer = () => {
        if (invCreateFeedbackTimer.current != null) {
            window.clearTimeout(invCreateFeedbackTimer.current);
            invCreateFeedbackTimer.current = null;
        }
    };

    const showInvCreateFeedback = (next: { tone: 'ok' | 'err'; text: string }) => {
        clearInvCreateFeedbackTimer();
        setInvCreateFeedback(next);
        invCreateFeedbackTimer.current = window.setTimeout(() => {
            setInvCreateFeedback(null);
            invCreateFeedbackTimer.current = null;
        }, 5000);
    };

    useEffect(() => {
        return () => clearInvCreateFeedbackTimer();
    }, []);

    useEffect(() => {
        if (!resolvedTransaction) return;
        setLocalCategory(resolvedTransaction.category || '');
        setLocalMemo(resolvedTransaction.memo || '');
        setIsEditingMemo(false);
        setIsInternalTransferPattern(
            config.customCCKeywords?.includes(resolvedTransaction.description) || false
        );
        setIsSubscription(resolvedTransaction.isSubscription || false);
        setSubscriptionInterval(resolvedTransaction.subscriptionInterval || 'monthly');
        setExcludeFromSubscriptions(resolvedTransaction.excludeFromSubscriptions || false);
        setLocalIsIgnored(
            resolvedTransaction.status === 'ignored' || resolvedTransaction.isIgnored === true
        );
        setLocalIsInvestment(Boolean(resolvedTransaction.isInvestment));
        setInvSymbol('');
        setInvQty('');
        setInvCreateFeedback(null);
        clearInvCreateFeedbackTimer();
        const cur = (
            resolvedTransaction.chargedCurrency ||
            resolvedTransaction.originalCurrency ||
            'ILS'
        )
            .trim()
            .toUpperCase();
        setLocalTelAvivQuote(cur === 'ILS');
    }, [resolvedTransaction, config.customCCKeywords]);

    useEffect(() => {
        if (resolvedTransaction && filters) {
            const filter = filters.find((f: { pattern?: string; id?: string }) => f.pattern === resolvedTransaction.description);
            setActiveFilterId(filter?.id ? String(filter.id) : null);
        }
    }, [resolvedTransaction, filters]);

    useEffect(() => {
        if (!isOpen) {
            setMoreActionsOpen(false);
            setAllDetailsOpen(false);
        }
    }, [isOpen]);

    if (!isOpen || !transaction || !resolvedTransaction) return null;

    const txn = resolvedTransaction;

    const handleCategoryChange = (newCategory: string) => {
        setLocalCategory(newCategory);
        updateCategory({ transactionId: txn.id, category: newCategory });
    };

    const handleMemoSave = () => {
        updateMemo({ transactionId: txn.id, memo: localMemo });
        setIsEditingMemo(false);
    };

    const handleToggleInternalTransferPattern = () => {
        const existing = config.customCCKeywords ?? [];
        let updated;
        if (isInternalTransferPattern) {
            updated = existing.filter((k) => k !== txn.description);
        } else {
            updated = [...existing, txn.description];
        }
        updateConfig({ customCCKeywords: updated });
        setIsInternalTransferPattern(!isInternalTransferPattern);
    };

    const handleToggleFilter = () => {
        if (activeFilterId) {
            removeFilter(activeFilterId);
        } else {
            addFilter(txn.description);
        }
    };

    const handleToggleIgnore = () => {
        const nextIgnored = !localIsIgnored;
        setLocalIsIgnored(nextIgnored);
        toggleIgnore({ transactionId: txn.id, isIgnored: nextIgnored });
    };

    const handleMarkAsInternalTransfer = () => {
        const currentlyInternal = isInternalTransfer(txn, config.customCCKeywords);
        updateType({
            transactionId: txn.id,
            type: currentlyInternal ? 'normal' : 'internal_transfer',
        });
    };

    const handleToggleSubscription = () => {
        const newStatus = !isSubscription;
        setIsSubscription(newStatus);
        if (newStatus) setExcludeFromSubscriptions(false);
        updateSubscription({
            transactionId: txn.id,
            isSubscription: newStatus,
            interval: newStatus ? subscriptionInterval : null,
            excludeFromSubscriptions: newStatus ? false : excludeFromSubscriptions,
        });
    };

    const handleToggleExclusion = () => {
        const newExclusion = !excludeFromSubscriptions;
        setExcludeFromSubscriptions(newExclusion);
        if (newExclusion) setIsSubscription(false);
        updateSubscription({
            transactionId: txn.id,
            isSubscription: newExclusion ? false : isSubscription,
            interval: newExclusion ? null : isSubscription ? subscriptionInterval : null,
            excludeFromSubscriptions: newExclusion,
        });
    };

    const handleIntervalChange = (newInterval: SubscriptionInterval) => {
        setSubscriptionInterval(newInterval);
        if (isSubscription) {
            updateSubscription({
                transactionId: txn.id,
                isSubscription: true,
                interval: newInterval,
                excludeFromSubscriptions: false,
            });
        }
    };

    const handleToggleInvestment = () => {
        const next = !localIsInvestment;
        setLocalIsInvestment(next);
        updateInvestmentFlag({ transactionId: txn.id, isInvestment: next });
    };

    const handleCreateInvestmentFromTxn = async () => {
        const sym = invSymbol.trim().toUpperCase();
        if (!sym) return;
        const qtyTrim = invQty.trim();
        const qtyParsed = qtyTrim === '' ? undefined : parseFloat(qtyTrim);
        setInvCreateFeedback(null);
        clearInvCreateFeedbackTimer();
        try {
            await createInvestmentFromTxn({
                transactionId: txn.id,
                symbol: sym,
                quantity:
                    qtyParsed !== undefined && Number.isFinite(qtyParsed) && qtyParsed > 0 ? qtyParsed : undefined,
                use_tel_aviv_listing: localTelAvivQuote,
            });
            setInvSymbol('');
            setInvQty('');
            showInvCreateFeedback({ tone: 'ok', text: t('transaction.investment.created') });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            showInvCreateFeedback({
                tone: 'err',
                text: `${t('transaction.investment.create_failed')}: ${msg}`,
            });
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const formatAmount = (amount: number, currency = 'ILS') => {
        return new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    };

    const isIgnored = localIsIgnored;
    const chargedCurrencyDisplay = (txn.chargedCurrency?.trim() || 'ILS').toUpperCase();
    const originalCurrencyDisplay = (txn.originalCurrency?.trim() || '').toUpperCase();
    const hasDifferentAmount =
        txn.originalAmount !== txn.chargedAmount ||
        (originalCurrencyDisplay.length > 0 && chargedCurrencyDisplay !== originalCurrencyDisplay);
    const isForeignCurrency = txn.originalCurrency && txn.originalCurrency !== 'ILS';
    const currenciesDifferForRate =
        originalCurrencyDisplay.length > 0 &&
        chargedCurrencyDisplay !== originalCurrencyDisplay &&
        Math.abs(txn.originalAmount) > 1e-9;
    const impliedExchangeRate =
        currenciesDifferForRate ? Math.abs(txn.chargedAmount) / Math.abs(txn.originalAmount) : null;
    const formatExchangeRateNumber = (rate: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
        }).format(rate);

    const providerLabel = getProviderDisplayName(txn.provider, providers, i18n.language);
    const computedInternal = isInternalTransfer(txn, config.customCCKeywords);
    const persistedInternalExplicit = txn.isInternalTransfer === true;
    const showComputedInternalHint =
        computedInternal && !persistedInternalExplicit && txn.txnType !== 'internal_transfer' && txn.type !== 'internal_transfer';

    const formatDetailValue = (key: keyof Transaction): string => {
        const v = txn[key];
        if (v === undefined || v === null || v === '') return t('transaction_modal.value_empty');
        if (typeof v === 'boolean') return v ? t('transaction_modal.yes') : t('transaction_modal.no');
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    };

    const fieldLabel = (key: keyof Transaction) =>
        i18n.exists(`transaction.fields.${key}`) ? t(`transaction.fields.${key}`) : String(key);

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
                onClick={onClose}
            />

            <div className="relative w-full max-w-2xl bg-white/90 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]">
                <div
                    className={clsx(
                        'p-8 text-white relative flex justify-between items-start gap-4 min-w-0 transition-colors duration-500',
                        isIgnored
                            ? 'bg-gradient-to-br from-gray-400 to-gray-600'
                            : txn.chargedAmount < 0
                              ? 'bg-gradient-to-br from-indigo-600 to-blue-700'
                              : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                    )}
                >
                    <div className="space-y-4 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
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
                                    {txn.originalCurrency}
                                </span>
                            )}
                            {computedInternal && (
                                <span className="bg-blue-400/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10 flex items-center gap-1">
                                    <ArrowRightLeft size={10} />
                                    {t('table.internal_transfer')}
                                </span>
                            )}
                            {txn.isSubscription && !excludeFromSubscriptions && (
                                <span className="bg-violet-500/85 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10 flex items-center gap-1">
                                    <Repeat size={10} />
                                    {t('transaction_modal.is_subscription')}
                                </span>
                            )}
                            {excludeFromSubscriptions && (
                                <span className="bg-orange-500/85 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10">
                                    {t('transaction_modal.excluded_from_subscriptions')}
                                </span>
                            )}
                            {(localIsInvestment || txn.isInvestment || txn.investmentId) && (
                                <span className="bg-teal-500/85 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10 flex items-center gap-1">
                                    <TrendingUp size={10} />
                                    {t('transaction.investment.badge')}
                                </span>
                            )}
                        </div>
                        <h2
                            className="text-2xl sm:text-3xl font-black leading-none tracking-tight drop-shadow-sm min-w-0 truncate"
                            title={txn.description}
                        >
                            {txn.description}
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 bg-white/10 hover:bg-white/20 p-3 rounded-2xl transition-all border border-white/10 hover:rotate-90 shadow-lg"
                    >
                        <X size={20} />
                    </button>

                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100 flex flex-col gap-1 group hover:border-blue-200 transition-colors">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <DollarSign size={12} className="text-blue-500" />
                                {t('table.amount')}
                            </span>
                            <span
                                className={clsx(
                                    'text-2xl font-black tabular-nums transition-transform duration-300 group-hover:scale-105 origin-left',
                                    txn.chargedAmount < 0 ? 'text-rose-600' : 'text-emerald-600'
                                )}
                            >
                                {formatAmount(txn.chargedAmount)}
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
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50/30 p-6 rounded-3xl border border-gray-100 space-y-3">
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Building2 size={12} className="text-gray-400" />
                                {t('transaction_modal.memo')}
                            </span>
                            {!isEditingMemo ? (
                                <button
                                    type="button"
                                    onClick={() => setIsEditingMemo(true)}
                                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 uppercase tracking-widest transition-colors"
                                >
                                    {t('common.edit')}
                                </button>
                            ) : (
                                <button
                                    type="button"
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
                            <p
                                className={clsx(
                                    'text-sm font-medium px-1',
                                    localMemo ? 'text-gray-700 italic' : 'text-gray-400'
                                )}
                            >
                                {localMemo || t('transaction_modal.memo') + '...'}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12 px-2">
                        <InfoItem icon={<Calendar size={16} />} label={t('table.date')} value={formatDate(txn.date)} />
                        <InfoItem icon={<Calendar size={16} />} label={t('table.processed_date')} value={formatDate(txn.processedDate)} />
                        <InfoItem
                            icon={<Hash size={16} />}
                            label={t('common.account_number')}
                            value={`${txn.accountNumber || '-'} (${providerLabel})`}
                        />
                        {hasDifferentAmount && (
                            <InfoItem
                                icon={<DollarSign size={16} />}
                                label={t('transaction_modal.original_amount')}
                                value={`${formatAmount(txn.originalAmount, txn.originalCurrency)} (${txn.originalCurrency})`}
                            />
                        )}
                        {impliedExchangeRate != null && (
                            <InfoItem
                                icon={<ArrowRightLeft size={16} />}
                                label={t('transaction_modal.exchange_rate')}
                                value={t('transaction_modal.exchange_rate_one_unit', {
                                    originalCurrency: txn.originalCurrency,
                                    rate: formatExchangeRateNumber(impliedExchangeRate),
                                    chargedCurrency: txn.chargedCurrency?.trim() || 'ILS',
                                })}
                            />
                        )}
                        <InfoItem icon={<Building2 size={16} />} label={t('transaction_modal.provider')} value={providerLabel} />
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

                    <div className="space-y-3">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest px-2">
                            {t('transaction_modal.flags_section')}
                        </h3>

                        <div className="rounded-2xl border border-gray-100 bg-gray-50/40 p-4 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:gap-x-6 sm:gap-y-3">
                                <CompactToggle
                                    label={t('transaction_modal.flag_ignore')}
                                    on={isIgnored}
                                    onClick={handleToggleIgnore}
                                    ariaLabel={t('transaction_modal.aria_toggle_ignore')}
                                    icon={isIgnored ? <Eye size={14} /> : <AlertCircle size={14} />}
                                    activeClass="bg-rose-500 border-rose-500"
                                />
                                <CompactToggle
                                    label={t('transaction_modal.flag_internal_transfer')}
                                    on={computedInternal}
                                    onClick={handleMarkAsInternalTransfer}
                                    ariaLabel={t('transaction_modal.aria_toggle_internal_transfer')}
                                    icon={<ArrowRightLeft size={14} />}
                                    activeClass="bg-blue-600 border-blue-600"
                                />
                                <CompactToggle
                                    label={t('transaction_modal.flag_subscription')}
                                    on={isSubscription}
                                    onClick={handleToggleSubscription}
                                    ariaLabel={t('transaction_modal.aria_toggle_subscription')}
                                    icon={<Repeat size={14} />}
                                    activeClass="bg-amber-500 border-amber-500"
                                />
                            </div>

                            {isSubscription && (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-gray-200/80">
                                    <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest shrink-0">
                                        {t('transaction_modal.subscription_interval')}
                                    </span>
                                    <select
                                        value={subscriptionInterval}
                                        onChange={(e) => handleIntervalChange(e.target.value as SubscriptionInterval)}
                                        className="text-xs font-bold rounded-xl border border-amber-200 bg-white px-3 py-2 text-gray-800 focus:ring-2 focus:ring-amber-400 outline-none max-w-full"
                                    >
                                        {SUBSCRIPTION_INTERVALS.map((interval) => (
                                            <option key={interval} value={interval}>
                                                {i18n.exists(`common.interval.${interval}`)
                                                    ? t(`common.interval.${interval}`)
                                                    : interval}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {investmentsFeatureOn && (
                                <div className="border-t border-gray-200/80 pt-4 space-y-3">
                                    <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest px-1">
                                        {t('transaction.investment.create_title')}
                                    </p>
                                    <CompactToggle
                                        label={t('transaction.investment.mark_label')}
                                        on={localIsInvestment}
                                        onClick={handleToggleInvestment}
                                        ariaLabel={t('transaction.investment.mark_label')}
                                        icon={<TrendingUp size={14} />}
                                        activeClass="bg-teal-600 border-teal-600"
                                    />
                                    <p className="text-xs text-gray-500 px-1">{t('transaction.investment.mark_help')}</p>
                                    {txn.investmentId ? (
                                        <p className="text-xs text-emerald-700 font-medium px-1">
                                            {t('transaction.investment.already_linked')}
                                        </p>
                                    ) : (
                                        <div className="flex flex-col gap-2 px-1">
                                            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={localTelAvivQuote}
                                                    onChange={(e) => setLocalTelAvivQuote(e.target.checked)}
                                                />
                                                <span>{t('transaction.investment.yahoo_ta_help')}</span>
                                            </label>
                                            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-end">
                                                <input
                                                    type="text"
                                                    value={invSymbol}
                                                    onChange={(e) => setInvSymbol(e.target.value)}
                                                    placeholder={t('transaction.investment.symbol_placeholder')}
                                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono uppercase flex-1 min-w-[8rem]"
                                                    autoCapitalize="characters"
                                                />
                                                <input
                                                    type="number"
                                                    min={0.0001}
                                                    step="any"
                                                    value={invQty}
                                                    onChange={(e) => setInvQty(e.target.value)}
                                                    placeholder={t('transaction.investment.auto_qty_placeholder')}
                                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm w-28"
                                                    title={t('transaction.investment.quantity')}
                                                />
                                                <button
                                                    type="button"
                                                    disabled={createInvestmentPending || !invSymbol.trim()}
                                                    onClick={() => void handleCreateInvestmentFromTxn()}
                                                    className="rounded-xl bg-teal-600 text-white text-sm font-bold px-4 py-2 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {t('transaction.investment.submit')}
                                                </button>
                                            </div>
                                            {invCreateFeedback && (
                                                <div
                                                    role="status"
                                                    className={clsx(
                                                        'flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium border',
                                                        invCreateFeedback.tone === 'ok'
                                                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                                            : 'bg-rose-50 text-rose-900 border-rose-200'
                                                    )}
                                                >
                                                    {invCreateFeedback.tone === 'ok' ? (
                                                        <CheckCircle2
                                                            className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600"
                                                            aria-hidden
                                                        />
                                                    ) : (
                                                        <AlertCircle
                                                            className="w-4 h-4 shrink-0 mt-0.5 text-rose-600"
                                                            aria-hidden
                                                        />
                                                    )}
                                                    <span className="leading-snug break-words">{invCreateFeedback.text}</span>
                                                </div>
                                            )}
                                            <p className="text-[11px] text-gray-500">{t('transaction.investment.auto_qty_hint')}</p>
                                        </div>
                                    )}
                                    <p className="text-[11px] text-gray-500 px-1">{t('transaction.investment.create_hint')}</p>
                                </div>
                            )}
                            {!investmentsFeatureOn && (localIsInvestment || txn.isInvestment || txn.investmentId) && (
                                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                    {t('transaction.investment.feature_disabled_hint')}
                                </p>
                            )}

                            <div className="border-t border-gray-200/80 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setMoreActionsOpen((o) => !o)}
                                    className="flex w-full items-center justify-between gap-2 text-start rounded-xl px-2 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-100/80 transition-colors"
                                    aria-expanded={moreActionsOpen}
                                >
                                    <span>
                                        {t('transaction_modal.more_actions')}
                                        <span className="block font-medium normal-case text-gray-400 tracking-normal text-[11px] mt-0.5">
                                            {t('transaction_modal.more_actions_hint')}
                                        </span>
                                    </span>
                                    <ChevronDown
                                        size={18}
                                        className={clsx('shrink-0 text-gray-400 transition-transform', moreActionsOpen && 'rotate-180')}
                                    />
                                </button>
                                {moreActionsOpen && (
                                    <div className="mt-2 flex flex-col gap-3 ps-1">
                                        <CompactToggle
                                            label={t('transaction_modal.internal_transfer_pattern')}
                                            on={isInternalTransferPattern}
                                            onClick={handleToggleInternalTransferPattern}
                                            ariaLabel={t('transaction_modal.aria_internal_transfer_pattern')}
                                            icon={<ArrowRightLeft size={14} className="opacity-70" />}
                                            activeClass="bg-blue-600 border-blue-600"
                                        />
                                        <CompactToggle
                                            label={
                                                activeFilterId
                                                    ? t('transaction_modal.remove_pattern')
                                                    : t('transaction_modal.hide_pattern')
                                            }
                                            on={!!activeFilterId}
                                            onClick={handleToggleFilter}
                                            ariaLabel={t('transaction_modal.aria_hide_description')}
                                            icon={<EyeOff size={14} />}
                                            activeClass="bg-amber-500 border-amber-500"
                                        />
                                        <CompactToggle
                                            label={t('transaction_modal.flag_exclude_subscriptions')}
                                            on={excludeFromSubscriptions}
                                            onClick={handleToggleExclusion}
                                            ariaLabel={t('transaction_modal.aria_toggle_exclude_subscriptions')}
                                            icon={<EyeOff size={14} />}
                                            activeClass="bg-orange-500 border-orange-500"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setAllDetailsOpen((o) => !o)}
                            className="flex w-full items-center justify-between gap-2 px-4 py-3 bg-gray-50/60 hover:bg-gray-100/80 transition-colors text-start"
                            aria-expanded={allDetailsOpen}
                            aria-label={
                                allDetailsOpen
                                    ? t('transaction_modal.all_details_collapse')
                                    : t('transaction_modal.all_details_expand')
                            }
                        >
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
                                {t('transaction_modal.all_details')}
                            </span>
                            <ChevronDown
                                size={18}
                                className={clsx('shrink-0 text-gray-400 transition-transform', allDetailsOpen && 'rotate-180')}
                            />
                        </button>
                        {allDetailsOpen && (
                            <div className="px-4 pb-4 pt-3 space-y-3 border-t border-gray-100 bg-white/60">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                    {ALL_DETAILS_FIELD_KEYS.map((key) => (
                                        <div key={key} className="flex flex-col gap-0.5 min-w-0">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight truncate">
                                                {fieldLabel(key)}
                                            </span>
                                            <span className="font-mono text-xs text-gray-800 break-all">{formatDetailValue(key)}</span>
                                        </div>
                                    ))}
                                </div>
                                {showComputedInternalHint && (
                                    <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-100 rounded-xl px-3 py-2">
                                        {t('transaction_modal.computed_internal_transfer_hint')}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-gray-50/80 border-t border-gray-100 flex justify-end">
                    <button
                        type="button"
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

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-start gap-4 group">
            <div className="mt-1 p-2 rounded-xl bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                {icon}
            </div>
            <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tight">{label}</span>
                <span className="text-sm font-bold text-gray-700 break-words">{value}</span>
            </div>
        </div>
    );
}

function CompactToggle({
    label,
    on,
    onClick,
    ariaLabel,
    icon,
    activeClass,
}: {
    label: string;
    on: boolean;
    onClick: () => void;
    ariaLabel: string;
    icon: React.ReactNode;
    activeClass: string;
}) {
    return (
        <div className="flex items-center justify-between gap-3 min-w-0 sm:min-w-[200px] sm:flex-1 sm:max-w-[220px]">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400 shrink-0">{icon}</span>
                <span className="text-[11px] font-bold text-gray-700 leading-tight truncate" title={label}>
                    {label}
                </span>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={ariaLabel}
                onClick={onClick}
                className={clsx(
                    'relative h-7 w-11 shrink-0 overflow-hidden rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-400',
                    on ? activeClass : 'bg-gray-200 border-gray-200'
                )}
                dir="ltr"
            >
                <span
                    className={clsx(
                        'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[inset-inline-start] duration-200',
                        on ? 'start-[1.25rem]' : 'start-0.5'
                    )}
                />
            </button>
        </div>
    );
}
