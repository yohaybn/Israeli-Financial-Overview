import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnomalyAlert } from '@app/shared';

interface AnomalyAlertsProps {
    anomalies?: AnomalyAlert[];
}

export function AnomalyAlerts({ anomalies = [] }: AnomalyAlertsProps) {
    const { t, i18n } = useTranslation();
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

    const activeAnomalies = anomalies.filter(a => !dismissedIds.has(a.id));

    if (activeAnomalies.length === 0) return null;

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const formatAlertDescription = (anomaly: AnomalyAlert) => {
        const base = `dashboard.anomaly.${anomaly.type}.desc`;
        if (anomaly.type === 'missing_expected') {
            const itemType =
                anomaly.meta?.itemType === 'income'
                    ? t('dashboard.anomaly.item_income')
                    : t('dashboard.anomaly.item_bill');
            return t(base, { itemType, defaultValue: anomaly.description });
        }
        return t(base, { category: anomaly.category ?? '', defaultValue: anomaly.description });
    };

    const formatAlertMessage = (anomaly: AnomalyAlert) => {
        if (anomaly.type === 'whale') {
            const hasAvg = anomaly.expectedValue != null && anomaly.expectedValue > 0;
            if (hasAvg) {
                return t('dashboard.anomaly.whale.msg_with_avg', {
                    category: anomaly.category ?? '',
                    amount: formatCurrency(anomaly.currentValue ?? 0),
                    avgAmount: formatCurrency(anomaly.expectedValue ?? 0),
                    defaultValue: anomaly.message,
                });
            }
            return t('dashboard.anomaly.whale.msg_no_avg', {
                category: anomaly.category ?? '',
                amount: formatCurrency(anomaly.currentValue ?? 0),
                defaultValue: anomaly.message,
            });
        }
        if (anomaly.type === 'missing_expected') {
            const dateLabel = anomaly.meta?.expectedDateIso
                ? new Intl.DateTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
                      dateStyle: 'medium',
                  }).format(new Date(anomaly.meta.expectedDateIso))
                : '';
            return t('dashboard.anomaly.missing_expected.msg', {
                description: anomaly.meta?.recurringDescription ?? '',
                date: dateLabel,
                defaultValue: anomaly.message,
            });
        }
        return t(`dashboard.anomaly.${anomaly.type}.msg`, {
            category: anomaly.category ?? '',
            defaultValue: anomaly.message,
        });
    };

    const handleDismiss = (id: string) => {
        setDismissedIds(prev => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    };

    const getTypeConfig = (type: AnomalyAlert['type']) => {
        switch (type) {
            case 'velocity':
                return {
                    icon: '⚡',
                    iconBg: 'bg-amber-100',
                    color: 'text-amber-800',
                    bg: 'bg-amber-50/90',
                    border: 'border-amber-200',
                };
            case 'outlier':
                return {
                    icon: '⚠️',
                    iconBg: 'bg-rose-100',
                    color: 'text-rose-800',
                    bg: 'bg-rose-50/90',
                    border: 'border-rose-200',
                };
            case 'missing_expected':
                return {
                    icon: '❓',
                    iconBg: 'bg-blue-100',
                    color: 'text-blue-800',
                    bg: 'bg-blue-50/90',
                    border: 'border-blue-200',
                };
            case 'whale':
                return {
                    icon: '🐋',
                    iconBg: 'bg-indigo-100',
                    color: 'text-indigo-800',
                    bg: 'bg-indigo-50/90',
                    border: 'border-indigo-200',
                };
            default:
                return {
                    icon: 'ℹ️',
                    iconBg: 'bg-gray-100',
                    color: 'text-gray-800',
                    bg: 'bg-gray-50/90',
                    border: 'border-gray-200',
                };
        }
    };

    return (
        <div className="space-y-3 mb-6">
            {activeAnomalies.map((anomaly) => {
                const config = getTypeConfig(anomaly.type);
                return (
                    <div
                        key={anomaly.id}
                        className={`relative flex items-start gap-4 p-4 rounded-xl border ${config.bg} ${config.border} shadow-sm backdrop-blur-md transition-all`}>

                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xl shadow-inner ${config.iconBg}`}>
                            {config.icon}
                        </div>

                        <div className="flex-1 mt-0.5">
                            <h4 className={`text-sm font-bold ${config.color} mb-1 flex items-center justify-between`}>
                                <span>{formatAlertDescription(anomaly)}</span>
                            </h4>
                            <p className="text-sm text-gray-700 leading-relaxed max-w-2xl">
                                {formatAlertMessage(anomaly)}
                            </p>
                            {anomaly.currentValue !== undefined && anomaly.expectedValue !== undefined && (
                                <div className="mt-3 flex items-center gap-4 text-xs font-mono bg-white/50 inline-flex p-2 rounded-lg border border-white/20">
                                    <div className="flex flex-col">
                                        <span className="text-gray-500 uppercase tracking-wider text-[10px]">{t('dashboard.current')}</span>
                                        <span className={`font-bold ${config.color}`}>{formatCurrency(anomaly.currentValue)}</span>
                                    </div>
                                    <div className="w-px h-6 bg-gray-300"></div>
                                    <div className="flex flex-col">
                                        <span className="text-gray-500 uppercase tracking-wider text-[10px]">{t('dashboard.expected')}</span>
                                        <span className="text-gray-700 font-bold">{formatCurrency(anomaly.expectedValue)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => handleDismiss(anomaly.id)}
                            className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-black/5 rounded-full transition-colors"
                            aria-label={t('common.dismiss')}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
