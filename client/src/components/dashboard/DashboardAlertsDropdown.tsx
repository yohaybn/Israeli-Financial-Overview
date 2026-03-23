import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnifiedData } from '../../hooks/useUnifiedData';
import { useDashboardConfig } from '../../hooks/useDashboardConfig';
import { useFinancialSummary } from '../../hooks/useFinancialSummary';
import { AnomalyAlerts } from './AnomalyAlerts';

type DashboardAlertsDropdownProps = {
    selectedMonth: string;
};

export function DashboardAlertsDropdown({ selectedMonth }: DashboardAlertsDropdownProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const { data: unifiedTransactions, isLoading } = useUnifiedData();
    const { config } = useDashboardConfig();
    const transactions = unifiedTransactions || [];
    const summary = useFinancialSummary(
        transactions,
        selectedMonth,
        config.ccPaymentDate,
        config.forecastMonths ?? 6,
        config.customCCKeywords ?? []
    );

    const anomalies = summary.anomalies ?? [];
    const count = anomalies.length;

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="relative shrink-0" ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`relative p-2.5 rounded-full transition-colors ${open ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                title={t('dashboard.toggle_alerts')}
                aria-expanded={open}
                aria-haspopup="true"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                </svg>
                {count > 0 && !open && (
                    <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-white" />
                )}
            </button>

            {open && (
                <div
                    className="absolute end-0 top-full mt-1.5 z-50 w-[min(100vw-2rem,22rem)] rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
                    role="menu"
                >
                    <div className="border-b border-gray-100 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            {t('dashboard.alerts_title')}
                        </p>
                    </div>
                    <div className="max-h-[min(60vh,24rem)] overflow-y-auto p-2">
                        {isLoading ? (
                            <p className="px-2 py-6 text-center text-sm text-gray-400">{t('common.loading')}</p>
                        ) : transactions.length === 0 ? (
                            <p className="px-2 py-6 text-center text-sm text-gray-500">{t('dashboard.select_data')}</p>
                        ) : count === 0 ? (
                            <p className="px-2 py-6 text-center text-sm text-gray-500">{t('dashboard.no_alerts')}</p>
                        ) : (
                            <AnomalyAlerts anomalies={anomalies} className="space-y-2 mb-0" />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
