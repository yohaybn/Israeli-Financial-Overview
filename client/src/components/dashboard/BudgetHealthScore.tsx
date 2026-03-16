import { useTranslation } from 'react-i18next';
import { BudgetHealth } from '@app/shared';

interface BudgetHealthScoreProps {
    health?: BudgetHealth;
}

export function BudgetHealthScore({ health }: BudgetHealthScoreProps) {
    const { t, i18n } = useTranslation();

    if (!health) return null;

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(amount);

    const isSurplus = health.projectedSurplus >= 0;

    // Determine colors
    const colors = {
        on_track: {
            bg: 'bg-emerald-50/80',
            border: 'border-emerald-100',
            iconBg: 'from-emerald-400 to-green-500',
            iconShadow: 'shadow-emerald-200',
            text: 'text-emerald-800',
            stroke: 'text-emerald-500'
        },
        caution: {
            bg: 'bg-amber-50/80',
            border: 'border-amber-100',
            iconBg: 'from-amber-400 to-orange-500',
            iconShadow: 'shadow-amber-200',
            text: 'text-amber-800',
            stroke: 'text-amber-500'
        },
        at_risk: {
            bg: 'bg-rose-50/80',
            border: 'border-rose-100',
            iconBg: 'from-rose-400 to-red-500',
            iconShadow: 'shadow-rose-200',
            text: 'text-rose-800',
            stroke: 'text-rose-500'
        },
    };

    const theme = colors[health.score] || colors.on_track;

    const circumference = 2 * Math.PI * 40; // r=40

    // Pace metric: 50% = 1.0 ratio
    let fillPercentage = 50;
    if (health.velocityRatio <= 1.0) {
        fillPercentage = (health.velocityRatio) * 50;
    } else {
        fillPercentage = 50 + ((health.velocityRatio - 1.0) * 50);
    }
    fillPercentage = Math.max(5, Math.min(100, fillPercentage));

    const strokeDashoffset = circumference - (fillPercentage / 100) * circumference;

    return (
        <div className={`relative ${theme.bg} backdrop-blur-sm rounded-2xl shadow-sm border ${theme.border} p-5 flex items-center gap-6 overflow-hidden transition-all duration-500`}>
            {/* Gauge Graphic */}
            <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 100 100">
                    <circle
                        cx="50" cy="50" r="40"
                        fill="none"
                        className="text-white/60"
                        stroke="currentColor"
                        strokeWidth="8"
                    />
                    <circle
                        cx="50" cy="50" r="40"
                        fill="none"
                        className={`${theme.stroke} transition-all duration-1000 ease-in-out`}
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                    />
                </svg>
                {/* Center Icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-12 h-12 bg-gradient-to-br ${theme.iconBg} rounded-full flex items-center justify-center shadow-md ${theme.iconShadow}`}>
                        {health.score === 'on_track' && (
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        {health.score === 'caution' && (
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        )}
                        {health.score === 'at_risk' && (
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                    {t('dashboard.budget_health')}
                </h3>
                <div className="flex items-baseline gap-3 mb-1">
                    <span className={`text-2xl font-black ${theme.text} capitalize tracking-tight`}>
                        {i18n.exists(`dashboard.health_${health.score}`)
                            ? t(`dashboard.health_${health.score}`)
                            : health.score.replace('_', ' ')}
                    </span>
                </div>
                <p className="text-sm text-gray-700 mb-3 font-medium opacity-90">
                    {i18n.exists(`dashboard.message_${health.message.replace(/ /g, '_').toLowerCase()}`)
                        ? t(`dashboard.message_${health.message.replace(/ /g, '_').toLowerCase()}`)
                        : health.message}
                </p>
                <div className="flex items-center gap-2 bg-white/50 inline-flex px-3 py-1.5 rounded-lg">
                    <span className="text-xs text-gray-500 font-medium">{t('dashboard.projected_end')}:</span>
                    <span className={`text-sm font-bold ${isSurplus ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isSurplus ? '+' : '-'}{formatCurrency(Math.abs(health.projectedSurplus))}
                    </span>
                </div>
            </div>
        </div>
    );
}
