import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Subscription, Transaction } from '@app/shared';
import { ArrowRight, CreditCard, Flag, X } from 'lucide-react';
import { clsx } from 'clsx';
import { TransactionModal } from '../TransactionModal';
import { TransactionTable } from '../TransactionTable';
import { getCategoryLucideIcon } from '../../utils/categoryIcons';
import { DashboardCardHeader, dashboardCardShellClass } from './DashboardCardChrome';

interface SubscriptionListProps {
    subscriptions: Subscription[];
    categories?: string[];
    onUpdateCategory?: (txnId: string, category: string) => void;
    defaultCollapsed?: boolean;
    collapseAllSignal?: number;
    /** YYYY-MM — used for "paid this month" and budget share */
    selectedMonth?: string;
    /** Sum of expense debits this month (for % of spending) */
    monthExpenseTotal?: number;
}

function toMonthlyAmount(sub: Subscription): number {
    let m = sub.amount;
    if (sub.interval === 'annually') m /= 12;
    if (sub.interval === 'weekly') m *= 4.3;
    if (sub.interval === 'bi-weekly') m *= 2.15;
    if (sub.interval === 'daily') m *= 30;
    return m;
}

function addMonths(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Six calendar months immediately before `anchorMonth` (oldest → newest). */
function priorSixMonths(anchorMonth: string): string[] {
    const months: string[] = [];
    for (let i = 6; i >= 1; i--) {
        months.push(addMonths(anchorMonth, -i));
    }
    return months;
}

function sumPaidInMonth(sub: Subscription, ym: string): number {
    if (!sub.history?.length) return 0;
    return sub.history
        .filter((t) => t.date.startsWith(ym) && (t.chargedAmount ?? t.amount ?? 0) < 0)
        .reduce((a, t) => a + Math.abs(t.chargedAmount ?? t.amount ?? 0), 0);
}

/** Per-month paid amounts and fill ratios (0–1) vs typical charge for the mini-bars. */
function sixMonthPaymentHistory(sub: Subscription, anchorMonth: string): {
    months: string[];
    amounts: number[];
    ratios: number[];
} {
    const months = priorSixMonths(anchorMonth);
    const amounts = months.map((m) => sumPaidInMonth(sub, m));
    const ref = Math.max(Math.abs(sub.amount || 0), ...amounts, 0.01);
    const ratios = amounts.map((a) => Math.min(1, a / ref));
    return { months, amounts, ratios };
}

function hasExpenseChargeInMonth(sub: Subscription, monthPrefix: string): boolean {
    if (!sub.history?.length) return false;
    return sub.history.some((t) => {
        const amt = t.chargedAmount ?? t.amount ?? 0;
        return t.date.startsWith(monthPrefix) && amt < 0;
    });
}

type SubStatus = 'paid' | 'past_due' | 'upcoming';

function subscriptionStatus(
    sub: Subscription,
    daysLeft: number,
    selectedMonth: string | undefined
): SubStatus {
    const month = selectedMonth || new Date().toISOString().slice(0, 7);
    if (hasExpenseChargeInMonth(sub, month)) return 'paid';
    if (daysLeft < 0) return 'past_due';
    return 'upcoming';
}

export function SubscriptionList({
    subscriptions,
    categories,
    onUpdateCategory,
    defaultCollapsed = false,
    collapseAllSignal = 0,
    selectedMonth,
    monthExpenseTotal = 0,
}: SubscriptionListProps) {
    const { t, i18n } = useTranslation();
    const [showInfo, setShowInfo] = useState(false);
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    useEffect(() => {
        if (collapseAllSignal > 0) setCollapsed(true);
    }, [collapseAllSignal]);
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
    const [selectedHistorySub, setSelectedHistorySub] = useState<Subscription | null>(null);
    const [flaggedKeys, setFlaggedKeys] = useState<Set<string>>(() => new Set());
    const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => new Set());

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const formatPct = (pct: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            maximumFractionDigits: 1,
            minimumFractionDigits: 0,
        }).format(pct);

    const formatMonthShort = (ym: string) =>
        new Date(ym + '-01T12:00:00').toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            month: 'short',
            year: 'numeric',
        });

    const getRemainingDays = (dateStr: string) => {
        const target = new Date(dateStr);
        const now = new Date();
        return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    };

    const formatInterval = (interval: string) => {
        const key = `common.interval.${interval}`;
        return i18n.exists(key) ? t(key) : interval;
    };

    const visibleSubscriptions = useMemo(() => {
        return subscriptions
            .map((sub, idx) => ({ sub, idx, key: `${sub.description}::${idx}` }))
            .filter(({ key }) => !dismissedKeys.has(key));
    }, [subscriptions, dismissedKeys]);

    const totalMonthlyCost = useMemo(
        () => visibleSubscriptions.reduce((acc, { sub }) => acc + toMonthlyAmount(sub), 0),
        [visibleSubscriptions]
    );

    const sortedVisible = useMemo(() => {
        return [...visibleSubscriptions].sort(
            (a, b) => getRemainingDays(a.sub.nextExpectedDate) - getRemainingDays(b.sub.nextExpectedDate)
        );
    }, [visibleSubscriptions]);

    return (
        <div className={dashboardCardShellClass}>
            <DashboardCardHeader
                collapsed={collapsed}
                onToggle={() => setCollapsed((v) => !v)}
                icon={<CreditCard className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden />}
                iconTileClassName="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-200/80"
                title={t('dashboard.subscriptions')}
                subtitle={t('dashboard.subscription_subtitle', { count: visibleSubscriptions.length })}
                endActions={
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowInfo(!showInfo);
                        }}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors shrink-0"
                        title={t('dashboard.subscriptions_logic_info')}
                        aria-label={t('dashboard.subscriptions_logic_info')}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </button>
                }
            />

            {!collapsed && (
                <div className="px-6 pb-8 sm:px-8">
                    {showInfo && (
                        <div className="mb-6 bg-emerald-50/80 p-4 rounded-2xl border border-emerald-100 text-xs text-emerald-950 animate-in fade-in slide-in-from-top-2">
                            <h4 className="font-bold mb-1">{t('dashboard.subscriptions_logic_title')}</h4>
                            <p>{t('dashboard.subscriptions_logic_intro')}</p>
                            <ul className="list-disc ps-4 mt-1 space-y-0.5 opacity-90">
                                <li>{t('dashboard.subscriptions_logic_rule_manual')}</li>
                                <li>{t('dashboard.subscriptions_logic_rule_pattern')}</li>
                                <li>{t('dashboard.subscriptions_logic_rule_exclusions')}</li>
                                <li>{t('dashboard.subscriptions_logic_rule_active')}</li>
                            </ul>
                        </div>
                    )}

                    <div className="max-h-[560px] overflow-y-auto pe-2 custom-scrollbar">
                        {sortedVisible.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {sortedVisible.map(({ sub, key }) => {
                                    const anchorMonth = selectedMonth || new Date().toISOString().slice(0, 7);
                                    const { months: payMonths, amounts: payAmounts, ratios: payRatios } =
                                        sixMonthPaymentHistory(sub, anchorMonth);

                                    const daysLeft = getRemainingDays(sub.nextExpectedDate);
                                    const status = subscriptionStatus(sub, daysLeft, selectedMonth);
                                    const monthlyEq = toMonthlyAmount(sub);
                                    const expenseDen = monthExpenseTotal > 0 ? monthExpenseTotal : 0;
                                    const pctRaw = expenseDen > 0 ? (monthlyEq / expenseDen) * 100 : 0;
                                    const pctDisplay = Math.min(999, pctRaw);

                                    const CatIcon = getCategoryLucideIcon(sub.category);
                                    const isFlagged = flaggedKeys.has(key);

                                    const statusLabel =
                                        status === 'paid'
                                            ? t('dashboard.subscription_status_paid')
                                            : status === 'past_due'
                                              ? t('dashboard.past_due')
                                              : t('dashboard.subscription_status_upcoming');

                                    const toneManual = sub.isManual === true;
                                    const swoosh =
                                        status === 'past_due'
                                            ? 'bg-rose-200/50'
                                            : status === 'paid'
                                              ? 'bg-emerald-200/45'
                                              : 'bg-slate-200/50';

                                    const barTheme =
                                        status === 'past_due'
                                            ? {
                                                  track: 'bg-rose-100',
                                                  fill: 'bg-rose-500',
                                                  text: 'text-rose-600',
                                              }
                                            : status === 'paid'
                                              ? {
                                                    track: 'bg-emerald-100',
                                                    fill: 'bg-emerald-600',
                                                    text: 'text-emerald-600',
                                                }
                                              : {
                                                    track: 'bg-slate-100',
                                                    fill: 'bg-slate-400',
                                                    text: 'text-slate-500',
                                                };

                                    return (
                                        <div
                                            key={key}
                                            title={t('dashboard.subscription_click_view_payments')}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setSelectedHistorySub(sub)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setSelectedHistorySub(sub);
                                                }
                                            }}
                                            className={clsx(
                                                'relative text-start rounded-2xl border overflow-hidden min-h-[168px] transition-all duration-200 cursor-pointer select-none',
                                                toneManual
                                                    ? 'bg-gradient-to-br from-amber-50/80 via-white to-white border-amber-100/80'
                                                    : 'bg-gradient-to-br from-slate-50/90 via-white to-white border-slate-100/90',
                                                isFlagged && 'ring-1 ring-amber-400/60'
                                            )}
                                        >
                                            <div
                                                className={clsx(
                                                    'absolute -top-6 -end-8 w-28 h-28 rounded-full blur-2xl pointer-events-none',
                                                    swoosh
                                                )}
                                            />

                                            <div className="relative p-4 flex flex-col gap-3">
                                                <div className="flex items-start gap-3">
                                                    <div
                                                        className={clsx(
                                                            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-sm',
                                                            toneManual
                                                                ? 'bg-amber-100/90 border-amber-200/80 text-amber-800'
                                                                : 'bg-white border-slate-200/90 text-slate-700'
                                                        )}
                                                    >
                                                        <CatIcon className="w-5 h-5" strokeWidth={1.75} />
                                                    </div>
                                                    <div className="min-w-0 flex-1 flex flex-col gap-2">
                                                        <div className="flex items-start gap-2">
                                                            <div className="min-w-0 flex-1">
                                                                <p
                                                                    dir="auto"
                                                                    className="text-sm font-black text-gray-900 tracking-tight leading-snug break-words line-clamp-3"
                                                                >
                                                                    {sub.description}
                                                                </p>
                                                                <p
                                                                    dir="auto"
                                                                    className="text-[11px] text-gray-500 mt-0.5 break-words line-clamp-2"
                                                                >
                                                                    {sub.category?.trim() ||
                                                                        (toneManual
                                                                            ? t('dashboard.subscription_source_manual')
                                                                            : t('dashboard.subscription_source_auto'))}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-0.5 shrink-0 self-start">
                                                                <button
                                                                    type="button"
                                                                    title={t('dashboard.subscription_flag_aria')}
                                                                    aria-label={t('dashboard.subscription_flag_aria')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setFlaggedKeys((prev) => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(key)) next.delete(key);
                                                                            else next.add(key);
                                                                            return next;
                                                                        });
                                                                    }}
                                                                    className={clsx(
                                                                        'p-1 rounded-md transition-colors',
                                                                        isFlagged
                                                                            ? 'bg-amber-100 text-amber-700'
                                                                            : 'text-gray-400 hover:bg-gray-100 hover:text-amber-600'
                                                                    )}
                                                                >
                                                                    <Flag className="w-4 h-4" strokeWidth={2} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    title={t('dashboard.subscription_dismiss_aria')}
                                                                    aria-label={t('dashboard.subscription_dismiss_aria')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setDismissedKeys((prev) => {
                                                                            const next = new Set(prev);
                                                                            next.add(key);
                                                                            return next;
                                                                        });
                                                                    }}
                                                                    className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                                                >
                                                                    <X className="w-4 h-4" strokeWidth={2} />
                                                                </button>
                                                                <span
                                                                    className={clsx(
                                                                        'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap',
                                                                        status === 'past_due' &&
                                                                            'bg-rose-50 text-rose-700 border-rose-100',
                                                                        status === 'paid' &&
                                                                            'bg-emerald-50 text-emerald-800 border-emerald-100',
                                                                        status === 'upcoming' &&
                                                                            'bg-slate-100 text-slate-600 border-slate-200'
                                                                    )}
                                                                >
                                                                    {statusLabel}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end">
                                                            <div className="text-end">
                                                                <p className="text-base font-black text-gray-900 tabular-nums leading-none">
                                                                    {formatCurrency(sub.amount)}
                                                                </p>
                                                                <p className="text-[10px] font-semibold text-gray-400 mt-0.5">
                                                                    / {formatInterval(sub.interval)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                                            {t('dashboard.subscription_payment_history')}
                                                        </span>
                                                    </div>
                                                    <div
                                                        className="flex gap-1 h-8"
                                                        role="group"
                                                        aria-label={t('dashboard.subscription_payment_history')}
                                                    >
                                                        {payMonths.map((ym, si) => {
                                                            const ratio = payRatios[si];
                                                            const paid = payAmounts[si];
                                                            const tip = t('dashboard.subscription_payment_history_tooltip', {
                                                                month: formatMonthShort(ym),
                                                                amount: paid > 0 ? formatCurrency(paid) : '—',
                                                            });
                                                            return (
                                                                <div
                                                                    key={ym}
                                                                    title={tip}
                                                                    className="flex-1 flex flex-col justify-end rounded bg-slate-100/90 overflow-hidden min-h-[32px] border border-slate-200/40"
                                                                >
                                                                    <div
                                                                        className={clsx(
                                                                            'w-full rounded-[2px] transition-all',
                                                                            ratio > 0 ? barTheme.fill : 'bg-transparent'
                                                                        )}
                                                                        style={{
                                                                            height: `${ratio * 100}%`,
                                                                            minHeight: ratio > 0 ? 3 : 0,
                                                                        }}
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                                            {t('dashboard.subscription_usage_impact')}
                                                        </span>
                                                        <span
                                                            className={clsx(
                                                                'text-[11px] font-bold tabular-nums',
                                                                barTheme.text
                                                            )}
                                                        >
                                                            {expenseDen > 0
                                                                ? t('dashboard.subscription_of_expenses', {
                                                                      pct: formatPct(pctDisplay),
                                                                  })
                                                                : '—'}
                                                        </span>
                                                    </div>
                                                    <div
                                                        className={clsx(
                                                            'h-1.5 rounded-full overflow-hidden',
                                                            barTheme.track
                                                        )}
                                                    >
                                                        <div
                                                            className={clsx('h-full rounded-full transition-all', barTheme.fill)}
                                                            style={{
                                                                width: `${expenseDen > 0 ? Math.min(100, pctRaw) : 0}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <p className="text-[9px] text-gray-400 mt-1">
                                                        {t('dashboard.subscription_budget_note')}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
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

                    {sortedVisible.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                        {t('dashboard.subscription_total_monthly')}
                                    </p>
                                    <p className="text-lg font-black text-gray-900 tabular-nums">
                                        {formatCurrency(totalMonthlyCost)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                        {t('dashboard.subscription_annualized')}
                                    </p>
                                    <p className="text-lg font-black text-emerald-700 tabular-nums">
                                        {formatCurrency(totalMonthlyCost * 12)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selectedHistorySub &&
                createPortal(
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
                        <div
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
                            onClick={() => setSelectedHistorySub(null)}
                        />
                        <div className="relative w-full max-w-5xl bg-white/95 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]">
                            <div className="p-8 bg-gradient-to-br from-emerald-600 to-teal-700 text-white relative">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                                        <CreditCard size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black tracking-tight">{selectedHistorySub.description}</h2>
                                        <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">
                                            {t('transaction_modal.history')}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedHistorySub(null)}
                                    className="absolute top-8 end-8 bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all border border-white/10"
                                >
                                    <ArrowRight className="rotate-180" size={18} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-gray-50/30">
                                {selectedHistorySub.history && selectedHistorySub.history.length > 0 ? (
                                    <TransactionTable
                                        transactions={[...selectedHistorySub.history].sort((a, b) =>
                                            b.date.localeCompare(a.date)
                                        )}
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

            <TransactionModal
                transaction={selectedTxn}
                isOpen={!!selectedTxn}
                onClose={() => setSelectedTxn(null)}
                categories={categories}
            />
        </div>
    );
}
