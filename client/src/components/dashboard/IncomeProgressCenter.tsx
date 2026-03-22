import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import { Transaction } from '@app/shared';
import { TransactionTable } from '../TransactionTable';
import { DashboardCardHeader, dashboardCardShellClass } from './DashboardCardChrome';

interface IncomeProgressCenterProps {
    alreadyReceived: number;
    alreadyReceivedTxns?: Transaction[];
    expectedInflow: number;
    expectedInflowTxns?: Transaction[];
    totalProjected: number;
    upcomingIncome?: { description: string; amount: number; expectedDate: string }[];
    categories?: string[];
    onUpdateCategory?: (transactionId: string, category: string) => void;
    /** When true, section body starts collapsed (e.g. mobile default). */
    defaultCollapsed?: boolean;
}

type StreamIcon = 'received' | 'expected' | 'upcoming';

function StreamIcon({ type }: { type: StreamIcon }) {
    const cls = 'w-5 h-5 text-emerald-700';
    if (type === 'received') {
        return (
            <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
        );
    }
    if (type === 'expected') {
        return (
            <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
        );
    }
    return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
    );
}

export function IncomeProgressCenter({
    alreadyReceived,
    alreadyReceivedTxns = [],
    expectedInflow,
    expectedInflowTxns = [],
    totalProjected,
    upcomingIncome,
    categories,
    onUpdateCategory,
    defaultCollapsed = false,
}: IncomeProgressCenterProps) {
    const { t, i18n } = useTranslation();
    const [selectedKpi, setSelectedKpi] = useState<'already_received' | 'expected_inflow' | null>(null);
    const [showViewAll, setShowViewAll] = useState(false);
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const streams = useMemo(() => {
        const rows: {
            key: string;
            title: string;
            subtitle: string;
            amount: number;
            icon: StreamIcon;
            kpi?: 'already_received' | 'expected_inflow';
        }[] = [
            {
                key: 'received',
                title: t('dashboard.already_received'),
                subtitle: t('dashboard.income_stream_received_sub'),
                amount: alreadyReceived,
                icon: 'received',
                kpi: 'already_received',
            },
        ];
        if (expectedInflow > 0) {
            rows.push({
                key: 'expected',
                title: t('dashboard.expected_inflow'),
                subtitle: t('dashboard.income_stream_expected_sub'),
                amount: expectedInflow,
                icon: 'expected',
                kpi: 'expected_inflow',
            });
        }
        upcomingIncome?.forEach((item, idx) => {
            const expDate = new Date(item.expectedDate);
            const dateLabel = expDate.toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
                day: 'numeric',
                month: 'short',
            });
            rows.push({
                key: `up-${idx}`,
                title: item.description,
                subtitle: t('dashboard.income_stream_upcoming_sub', { date: dateLabel }),
                amount: item.amount,
                icon: 'upcoming',
            });
        });
        return rows;
    }, [alreadyReceived, expectedInflow, upcomingIncome, t, i18n.language]);

    return (
        <>
            <div className={dashboardCardShellClass}>
                <DashboardCardHeader
                    collapsed={collapsed}
                    onToggle={() => setCollapsed((c) => !c)}
                    icon={<Wallet className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden />}
                    iconTileClassName="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-200/80"
                    title={t('dashboard.income_streams')}
                    subtitle={
                        <>
                            {t('dashboard.total_projected')}:{' '}
                            <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(totalProjected)}</span>
                        </>
                    }
                    endActions={
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowViewAll(true);
                            }}
                            className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors px-2 py-1 rounded-lg hover:bg-emerald-50"
                        >
                            {t('dashboard.view_all')}
                        </button>
                    }
                />

                {!collapsed && (
                    <div className="px-6 pb-8 sm:px-8 space-y-4 pt-0">
                    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-1 space-y-2">
                        {streams.map((row) => (
                            <button
                                key={row.key}
                                type="button"
                                onClick={() => row.kpi && setSelectedKpi(row.kpi)}
                                className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-start transition-colors ${
                                    row.kpi ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                                }`}
                            >
                                <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100/80">
                                    <StreamIcon type={row.icon} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">{row.title}</p>
                                    <p className="text-xs text-gray-500 truncate">{row.subtitle}</p>
                                </div>
                                <span className="flex-shrink-0 text-lg font-bold text-emerald-600 tabular-nums">
                                    {formatCurrency(row.amount)}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('dashboard.total_projected')}</span>
                        <span className="text-lg font-black text-gray-900 tabular-nums">{formatCurrency(totalProjected)}</span>
                    </div>
                    </div>
                )}
            </div>

            {showViewAll &&
                createPortal(
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/50 backdrop-blur-sm"
                        onClick={() => setShowViewAll(false)}
                    >
                        <div
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-[#F8F9FA]">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">{t('dashboard.income_streams')}</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">{t('dashboard.total_projected')}: {formatCurrency(totalProjected)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowViewAll(false)}
                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8 bg-[#F8F9FA]/50">
                                <div>
                                    <h4 className="text-sm font-bold text-gray-700 mb-3">{t('dashboard.already_received')}</h4>
                                    {alreadyReceivedTxns.length > 0 ? (
                                        <TransactionTable
                                            transactions={alreadyReceivedTxns}
                                            categories={categories}
                                            onUpdateCategory={onUpdateCategory}
                                        />
                                    ) : (
                                        <p className="text-center text-gray-400 py-8 text-sm">{t('dashboard.no_transactions')}</p>
                                    )}
                                </div>
                                {expectedInflow > 0 && (
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-700 mb-3">{t('dashboard.expected_inflow')}</h4>
                                        {expectedInflowTxns.length > 0 ? (
                                            <TransactionTable
                                                transactions={expectedInflowTxns}
                                                categories={categories}
                                                onUpdateCategory={onUpdateCategory}
                                            />
                                        ) : (
                                            <p className="text-center text-gray-400 py-8 text-sm">{t('dashboard.no_transactions')}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            {selectedKpi &&
                createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/50 backdrop-blur-sm" onClick={() => setSelectedKpi(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                                        <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shadow-sm">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        {selectedKpi === 'already_received' ? t('dashboard.already_received') : t('dashboard.expected_inflow')}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {t('dashboard.kpi_details')} ({formatCurrency(selectedKpi === 'already_received' ? alreadyReceived : expectedInflow)})
                                    </p>
                                </div>
                                <button onClick={() => setSelectedKpi(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-0 sm:p-6 bg-gray-50/30">
                                {(selectedKpi === 'already_received' ? alreadyReceivedTxns : expectedInflowTxns).length > 0 ? (
                                    <TransactionTable
                                        transactions={selectedKpi === 'already_received' ? alreadyReceivedTxns : expectedInflowTxns}
                                        categories={categories}
                                        onUpdateCategory={onUpdateCategory}
                                    />
                                ) : (
                                    <div className="text-center text-gray-400 py-10">{t('dashboard.no_transactions')}</div>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
