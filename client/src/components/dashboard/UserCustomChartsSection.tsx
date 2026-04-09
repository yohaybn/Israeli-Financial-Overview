import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { enUS, he } from 'date-fns/locale';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    expenseCategoryKey,
    MAX_USER_CHARTS,
    MAX_USER_CHART_FILTER_CLAUSES,
    USER_CHART_LAST_N_DAYS_MAX,
    USER_CHART_LAST_N_MONTHS_MAX,
    type Transaction,
    type UserChartDataScope,
    type UserChartDefinition,
    type UserChartFilterClause,
    type UserChartGroupBy,
    type UserChartKind,
    type UserChartMeasure,
} from '@app/shared';
import { useDashboardConfig } from '../../hooks/useDashboardConfig';
import { buildCustomChartSeries } from '../../utils/customChartSeries';

/** Matches built-in analytics Recharts tooltips (see AnalyticsDashboard). */
export const ANALYTICS_CHART_TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
} as const;

const PIE_COLORS = [
    '#6366f1',
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ec4899',
    '#8b5cf6',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#64748b',
];

function truncateLabel(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function newFilterClause(kind: UserChartFilterClause['kind'], existingId?: string): UserChartFilterClause {
    const id = existingId ?? crypto.randomUUID();
    switch (kind) {
        case 'category_in':
        case 'category_not_in':
            return { id, kind, categories: [] };
        case 'description_contains':
        case 'description_not_contains':
            return { id, kind, text: '' };
        case 'amount_min':
        case 'amount_max':
            return { id, kind, value: 0 };
    }
}

function withFilterKind(id: string, kind: UserChartFilterClause['kind'], prev: UserChartFilterClause[]): UserChartFilterClause[] {
    return prev.map((f) => (f.id === id ? newFilterClause(kind, id) : f));
}

function sanitizeChartFilters(rows: UserChartFilterClause[]): UserChartFilterClause[] {
    const out: UserChartFilterClause[] = [];
    for (const f of rows.slice(0, MAX_USER_CHART_FILTER_CLAUSES)) {
        if (f.kind === 'category_in' || f.kind === 'category_not_in') {
            const categories = [...new Set(f.categories.map((c) => expenseCategoryKey(c)).filter(Boolean))];
            if (categories.length === 0) continue;
            out.push({ ...f, categories });
        } else if (f.kind === 'description_contains' || f.kind === 'description_not_contains') {
            const text = f.text.trim();
            if (!text) continue;
            out.push({ ...f, text });
        } else if (f.kind === 'amount_min' || f.kind === 'amount_max') {
            if (!Number.isFinite(f.value) || f.value < 0) continue;
            out.push({ ...f, value: f.value });
        }
    }
    return out;
}

interface CustomChartCardProps {
    spec: UserChartDefinition;
    /** Same slice as built-in charts when scope is “follow analytics”. */
    followTransactions: Transaction[];
    /** All loaded transactions (for custom date range). */
    fullTransactionPool: Transaction[];
    /** Label when following analytics (this month / all months). */
    analyticsViewLabel: string;
    customCCKeywords: string[];
    weekdayLabels: string[];
    onEdit: () => void;
    onRemove: () => void;
}

/** Renders one saved user chart; same card chrome as built-in analytics tiles. */
export function CustomChartCard({
    spec,
    followTransactions,
    fullTransactionPool,
    analyticsViewLabel,
    customCCKeywords,
    weekdayLabels,
    onEdit,
    onRemove,
}: CustomChartCardProps) {
    const { t, i18n } = useTranslation();

    const dataScopeLabel = useMemo(() => {
        const scope = spec.dataScope ?? 'follow_analytics';
        if (scope === 'follow_analytics') return analyticsViewLabel;
        if (scope === 'all_time') return t('dashboard.custom_charts_scope_all');
        if (scope === 'single_month' && spec.singleMonth && /^\d{4}-\d{2}$/.test(spec.singleMonth)) {
            try {
                const formatted = format(parseISO(`${spec.singleMonth}-01`), i18n.language === 'he' ? 'MMMM yyyy' : 'MMM yyyy', {
                    locale: i18n.language === 'he' ? he : enUS,
                });
                return t('dashboard.custom_charts_scope_single_month_label', { month: formatted });
            } catch {
                return spec.singleMonth;
            }
        }
        if (scope === 'last_n_days') {
            const n = spec.lastN ?? 30;
            return t('dashboard.custom_charts_scope_last_n_days_label', { count: n });
        }
        if (scope === 'last_n_months') {
            const n = spec.lastN ?? 3;
            return t('dashboard.custom_charts_scope_last_n_months_label', { count: n });
        }
        if (scope === 'custom_range' && spec.customDateFrom && spec.customDateTo) {
            return t('dashboard.custom_charts_scope_custom_range_label', {
                start: spec.customDateFrom,
                end: spec.customDateTo,
            });
        }
        return analyticsViewLabel;
    }, [spec, analyticsViewLabel, t, i18n.language]);

    const { rows, isEmpty } = useMemo(
        () =>
            buildCustomChartSeries(spec, {
                followTransactions,
                fullTransactionPool,
                customCCKeywords,
                weekdayLabels,
            }),
        [spec, followTransactions, fullTransactionPool, customCCKeywords, weekdayLabels]
    );

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(value);

    const formatValue = (v: number) => (spec.measure === 'count' ? String(Math.round(v)) : formatCurrency(v));

    const pieTotal = useMemo(() => rows.reduce((s, r) => s + r.value, 0), [rows]);

    const monthTickFormatter = (v: string) => {
        if (/^\d{4}-\d{2}$/.test(v)) {
            try {
                return format(parseISO(`${v}-01`), i18n.language === 'he' ? 'MM/yy' : 'MMM yy', {
                    locale: i18n.language === 'he' ? he : enUS,
                });
            } catch {
                return v;
            }
        }
        return truncateLabel(v, 14);
    };

    const chartKind: UserChartKind =
        spec.chartKind === 'pie' && spec.measure === 'net' ? 'bar' : spec.chartKind;

    const chartBody =
        isEmpty || rows.length === 0 ? (
            <div className="flex min-h-[220px] flex-1 items-center justify-center text-sm text-gray-400">
                {t('dashboard.custom_charts_empty_data')}
            </div>
        ) : chartKind === 'pie' ? (
            <div className="flex flex-col gap-3">
                <ResponsiveContainer width="100%" height={220}>
                    <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                        <Pie
                            data={rows}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={0}
                            outerRadius={92}
                            paddingAngle={1}
                            labelLine={false}
                            label={false}
                        >
                            {rows.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={1} />
                            ))}
                        </Pie>
                        <Tooltip
                            content={({ active, payload }): ReactNode => {
                                if (!active || !payload?.length) return null;
                                const item = payload[0];
                                const p = item.payload as { name?: string; value?: number };
                                const name = String(p.name ?? '');
                                const val = Number(p.value ?? 0);
                                const pct = pieTotal > 0 ? (val / pieTotal) * 100 : 0;
                                return (
                                    <div
                                        className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm max-w-[min(100vw-2rem,20rem)]"
                                        style={ANALYTICS_CHART_TOOLTIP_STYLE}
                                    >
                                        <p className="font-semibold text-gray-900 break-words">{name}</p>
                                        <p className="text-gray-600 mt-1 tabular-nums">
                                            {formatValue(val)}
                                            {spec.measure !== 'count' ? (
                                                <span className="text-gray-400 ms-1">({pct.toFixed(1)}%)</span>
                                            ) : null}
                                        </p>
                                    </div>
                                );
                            }}
                        />
                        <Legend
                            verticalAlign="bottom"
                            layout="horizontal"
                            align="center"
                            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <ul className="text-xs text-gray-600 space-y-1 border-t border-gray-100 pt-2 max-h-32 overflow-y-auto">
                    {rows.map((r, i) => {
                        const pct = pieTotal > 0 ? (r.value / pieTotal) * 100 : 0;
                        return (
                            <li key={`${r.name}-${i}`} className="flex justify-between gap-2">
                                <span className="min-w-0 flex items-start gap-1.5">
                                    <span
                                        className="size-2 shrink-0 rounded-sm mt-1"
                                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                                        aria-hidden
                                    />
                                    <span className="break-words">{r.name}</span>
                                </span>
                                <span className="shrink-0 tabular-nums text-gray-800">
                                    {formatValue(r.value)}
                                    {spec.measure !== 'count' ? <span className="text-gray-400 ms-1">({pct.toFixed(1)}%)</span> : null}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        ) : chartKind === 'line' ? (
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) =>
                            spec.groupBy === 'month' ? monthTickFormatter(String(v)) : truncateLabel(String(v), 12)
                        }
                        interval={0}
                        angle={spec.groupBy === 'merchant' ? -35 : 0}
                        textAnchor={spec.groupBy === 'merchant' ? 'end' : 'middle'}
                        height={spec.groupBy === 'merchant' ? 56 : 32}
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => (spec.measure === 'count' ? String(v) : `${Math.round(Number(v) / 1000)}k`)}
                    />
                    <Tooltip
                        contentStyle={ANALYTICS_CHART_TOOLTIP_STYLE}
                        formatter={(value) => [formatValue(Number(value ?? 0)), t('dashboard.custom_charts_value')]}
                        labelFormatter={(label) => String(label)}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="value" name={t('dashboard.custom_charts_value')} stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
            </ResponsiveContainer>
        ) : (
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) =>
                            spec.groupBy === 'month' ? monthTickFormatter(String(v)) : truncateLabel(String(v), 12)
                        }
                        interval={0}
                        angle={spec.groupBy === 'merchant' ? -35 : 0}
                        textAnchor={spec.groupBy === 'merchant' ? 'end' : 'middle'}
                        height={spec.groupBy === 'merchant' ? 56 : 32}
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => (spec.measure === 'count' ? String(v) : `${Math.round(Number(v) / 1000)}k`)}
                    />
                    <Tooltip
                        contentStyle={ANALYTICS_CHART_TOOLTIP_STYLE}
                        formatter={(value) => [formatValue(Number(value ?? 0)), t('dashboard.custom_charts_value')]}
                        labelFormatter={(label) => String(label)}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    <Bar dataKey="value" name={t('dashboard.custom_charts_value')} fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col min-h-0">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-700 truncate">{spec.title}</h3>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        {t(`dashboard.custom_charts_meta_${spec.measure}`)} · {t(`dashboard.custom_charts_group_${spec.groupBy}`)} ·{' '}
                        {dataScopeLabel}
                        {spec.filters?.length ? (
                            <>
                                {' '}
                                ·{' '}
                                {t('dashboard.custom_charts_filters_count', { count: spec.filters.length })}
                            </>
                        ) : null}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={onEdit}
                        className="text-xs text-violet-700 hover:text-violet-900 font-medium px-2 py-1 rounded-lg hover:bg-violet-50"
                    >
                        {t('dashboard.custom_charts_edit')}
                    </button>
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded-lg hover:bg-red-50"
                    >
                        {t('dashboard.custom_charts_remove')}
                    </button>
                </div>
            </div>
            {chartBody}
        </div>
    );
}

export interface CustomChartModalProps {
    onClose: () => void;
    onSave: (def: UserChartDefinition) => void;
    initial: UserChartDefinition | null;
    atLimit: boolean;
    /** Category labels from AI settings (for datalist hints). */
    categoryOptions: string[];
    /** Default YYYY-MM for “single calendar month” when adding a chart. */
    defaultSingleMonth?: string;
}

export function CustomChartModal({ onClose, onSave, initial, atLimit, categoryOptions, defaultSingleMonth }: CustomChartModalProps) {
    const { t } = useTranslation();
    const isEdit = Boolean(initial);
    const [title, setTitle] = useState(initial?.title ?? '');
    const [chartKind, setChartKind] = useState<UserChartKind>(initial?.chartKind ?? 'bar');
    const [groupBy, setGroupBy] = useState<UserChartGroupBy>(initial?.groupBy ?? 'category');
    const [measure, setMeasure] = useState<UserChartMeasure>(initial?.measure ?? 'sum_expense');
    const [merchantTopN, setMerchantTopN] = useState(initial?.merchantTopN ?? 10);
    const [dataScope, setDataScope] = useState<UserChartDataScope>(initial?.dataScope ?? 'follow_analytics');
    const [singleMonth, setSingleMonth] = useState(initial?.singleMonth ?? defaultSingleMonth ?? '');
    const [lastN, setLastN] = useState(() => {
        if (initial?.lastN != null && Number.isFinite(initial.lastN)) return initial.lastN;
        if (initial?.dataScope === 'last_n_months') return 3;
        return 30;
    });
    const [customDateFrom, setCustomDateFrom] = useState(initial?.customDateFrom ?? '');
    const [customDateTo, setCustomDateTo] = useState(initial?.customDateTo ?? '');
    const [filters, setFilters] = useState<UserChartFilterClause[]>(() => {
        if (!initial?.filters?.length) return [];
        return initial.filters.map((c) => ({
            ...c,
            id: 'id' in c && typeof (c as { id?: string }).id === 'string' ? (c as { id: string }).id : crypto.randomUUID(),
        }));
    });

    const pieAllowed = measure !== 'net';
    const effectiveKind: UserChartKind = chartKind === 'pie' && !pieAllowed ? 'bar' : chartKind;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        if (!isEdit && atLimit) return;
        if (dataScope === 'custom_range') {
            if (!customDateFrom || !customDateTo || customDateFrom > customDateTo) {
                window.alert(t('dashboard.custom_charts_custom_range_invalid'));
                return;
            }
        }
        if (dataScope === 'single_month') {
            const ym = singleMonth.trim();
            if (!/^\d{4}-\d{2}$/.test(ym)) {
                window.alert(t('dashboard.custom_charts_single_month_invalid'));
                return;
            }
        }
        if (dataScope === 'last_n_days') {
            const n = Math.floor(Number(lastN));
            if (!Number.isFinite(n) || n < 1 || n > USER_CHART_LAST_N_DAYS_MAX) {
                window.alert(t('dashboard.custom_charts_last_n_days_invalid', { max: USER_CHART_LAST_N_DAYS_MAX }));
                return;
            }
        }
        if (dataScope === 'last_n_months') {
            const n = Math.floor(Number(lastN));
            if (!Number.isFinite(n) || n < 1 || n > USER_CHART_LAST_N_MONTHS_MAX) {
                window.alert(t('dashboard.custom_charts_last_n_months_invalid', { max: USER_CHART_LAST_N_MONTHS_MAX }));
                return;
            }
        }
        const id = initial?.id ?? crypto.randomUUID();
        const cleanFilters = sanitizeChartFilters(filters);
        const base: UserChartDefinition = {
            id,
            title: trimmed,
            chartKind: measure === 'net' && chartKind === 'pie' ? 'bar' : effectiveKind,
            groupBy,
            measure,
            merchantTopN: groupBy === 'merchant' ? Math.min(25, Math.max(1, merchantTopN)) : undefined,
            filters: cleanFilters.length > 0 ? cleanFilters : undefined,
        };

        let payload: UserChartDefinition = base;
        switch (dataScope) {
            case 'follow_analytics':
                break;
            case 'all_time':
                payload = { ...base, dataScope: 'all_time' };
                break;
            case 'single_month':
                payload = {
                    ...base,
                    dataScope: 'single_month',
                    singleMonth: singleMonth.trim(),
                };
                break;
            case 'last_n_days': {
                const n = Math.min(USER_CHART_LAST_N_DAYS_MAX, Math.max(1, Math.floor(Number(lastN))));
                payload = { ...base, dataScope: 'last_n_days', lastN: n };
                break;
            }
            case 'last_n_months': {
                const n = Math.min(USER_CHART_LAST_N_MONTHS_MAX, Math.max(1, Math.floor(Number(lastN))));
                payload = { ...base, dataScope: 'last_n_months', lastN: n };
                break;
            }
            case 'custom_range':
                payload = { ...base, dataScope: 'custom_range', customDateFrom, customDateTo };
                break;
            default:
                break;
        }

        onSave(payload);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div
                className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-gray-100"
                role="dialog"
                aria-labelledby="custom-chart-modal-title"
            >
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <h2 id="custom-chart-modal-title" className="text-lg font-bold text-gray-900">
                        {isEdit ? t('dashboard.custom_charts_edit_title') : t('dashboard.custom_charts_add_title')}
                    </h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg">
                        <span className="sr-only">{t('common.close')}</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {!isEdit && atLimit && (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            {t('dashboard.custom_charts_limit', { max: MAX_USER_CHARTS })}
                        </p>
                    )}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">{t('dashboard.custom_charts_field_title')}</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                            placeholder={t('dashboard.custom_charts_title_placeholder')}
                            maxLength={120}
                            autoFocus
                        />
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">{t('dashboard.custom_charts_data_scope_title')}</p>
                        <p className="text-[10px] text-gray-500 leading-snug">{t('dashboard.custom_charts_data_scope_hint')}</p>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                {t('dashboard.custom_charts_field_scope')}
                            </label>
                            <select
                                value={dataScope}
                                onChange={(e) => setDataScope(e.target.value as UserChartDataScope)}
                                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm bg-white"
                            >
                                <option value="follow_analytics">{t('dashboard.custom_charts_scope_follow')}</option>
                                <option value="all_time">{t('dashboard.custom_charts_scope_all_time')}</option>
                                <option value="single_month">{t('dashboard.custom_charts_scope_single_month')}</option>
                                <option value="last_n_days">{t('dashboard.custom_charts_scope_last_n_days')}</option>
                                <option value="last_n_months">{t('dashboard.custom_charts_scope_last_n_months')}</option>
                                <option value="custom_range">{t('dashboard.custom_charts_scope_custom')}</option>
                            </select>
                        </div>
                        {dataScope === 'single_month' && (
                            <div className="pt-1">
                                <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                    {t('dashboard.custom_charts_field_single_month')}
                                </label>
                                <input
                                    type="month"
                                    value={singleMonth}
                                    onChange={(e) => setSingleMonth(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white"
                                />
                            </div>
                        )}
                        {(dataScope === 'last_n_days' || dataScope === 'last_n_months') && (
                            <div className="pt-1">
                                <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                    {dataScope === 'last_n_days'
                                        ? t('dashboard.custom_charts_field_last_n_days')
                                        : t('dashboard.custom_charts_field_last_n_months')}
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={dataScope === 'last_n_days' ? USER_CHART_LAST_N_DAYS_MAX : USER_CHART_LAST_N_MONTHS_MAX}
                                    value={lastN}
                                    onChange={(e) => setLastN(Number(e.target.value) || 1)}
                                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                                />
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                    {dataScope === 'last_n_days'
                                        ? t('dashboard.custom_charts_last_n_days_hint')
                                        : t('dashboard.custom_charts_last_n_months_hint')}
                                </p>
                            </div>
                        )}
                        {dataScope === 'custom_range' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                        {t('dashboard.custom_charts_custom_from')}
                                    </label>
                                    <input
                                        type="date"
                                        value={customDateFrom}
                                        onChange={(e) => setCustomDateFrom(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                        {t('dashboard.custom_charts_custom_to')}
                                    </label>
                                    <input
                                        type="date"
                                        value={customDateTo}
                                        onChange={(e) => setCustomDateTo(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">{t('dashboard.custom_charts_field_chart_type')}</label>
                            <select
                                value={effectiveKind}
                                onChange={(e) => setChartKind(e.target.value as UserChartKind)}
                                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                            >
                                <option value="bar">{t('dashboard.custom_charts_type_bar')}</option>
                                <option value="line">{t('dashboard.custom_charts_type_line')}</option>
                                <option value="pie" disabled={!pieAllowed}>
                                    {t('dashboard.custom_charts_type_pie')}
                                </option>
                            </select>
                            {!pieAllowed && <p className="text-[10px] text-gray-500 mt-1">{t('dashboard.custom_charts_pie_net_hint')}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">{t('dashboard.custom_charts_field_measure')}</label>
                            <select
                                value={measure}
                                onChange={(e) => {
                                    const m = e.target.value as UserChartMeasure;
                                    setMeasure(m);
                                    if (m === 'net' && chartKind === 'pie') setChartKind('bar');
                                }}
                                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                            >
                                <option value="sum_expense">{t('dashboard.custom_charts_measure_sum_expense')}</option>
                                <option value="sum_income">{t('dashboard.custom_charts_measure_sum_income')}</option>
                                <option value="net">{t('dashboard.custom_charts_measure_net')}</option>
                                <option value="count">{t('dashboard.custom_charts_measure_count')}</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">{t('dashboard.custom_charts_field_group_by')}</label>
                        <select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value as UserChartGroupBy)}
                            className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                        >
                            <option value="month">{t('dashboard.custom_charts_group_month')}</option>
                            <option value="category">{t('dashboard.custom_charts_group_category')}</option>
                            <option value="weekday">{t('dashboard.custom_charts_group_weekday')}</option>
                            <option value="merchant">{t('dashboard.custom_charts_group_merchant')}</option>
                        </select>
                    </div>
                    {groupBy === 'merchant' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">{t('dashboard.custom_charts_field_top_n')}</label>
                            <input
                                type="number"
                                min={1}
                                max={25}
                                value={merchantTopN}
                                onChange={(e) => setMerchantTopN(Number(e.target.value) || 10)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                        </div>
                    )}
                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">{t('dashboard.custom_charts_filters_title')}</p>
                        <p className="text-[10px] text-gray-500 leading-snug">{t('dashboard.custom_charts_filters_scope_hint')}</p>
                        {filters.map((f) => (
                            <div key={f.id} className="rounded-lg border border-gray-200 bg-white p-2 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <select
                                        value={f.kind}
                                        onChange={(e) =>
                                            setFilters((prev) =>
                                                withFilterKind(f.id, e.target.value as UserChartFilterClause['kind'], prev)
                                            )
                                        }
                                        className="flex-1 min-w-[10rem] rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                                    >
                                        <option value="category_in">{t('dashboard.custom_charts_filter_kind_category_in')}</option>
                                        <option value="category_not_in">{t('dashboard.custom_charts_filter_kind_category_not_in')}</option>
                                        <option value="description_contains">{t('dashboard.custom_charts_filter_kind_description_contains')}</option>
                                        <option value="description_not_contains">{t('dashboard.custom_charts_filter_kind_description_not_contains')}</option>
                                        <option value="amount_min">{t('dashboard.custom_charts_filter_kind_amount_min')}</option>
                                        <option value="amount_max">{t('dashboard.custom_charts_filter_kind_amount_max')}</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setFilters((prev) => prev.filter((x) => x.id !== f.id))}
                                        className="text-xs text-red-600 hover:underline shrink-0"
                                    >
                                        {t('dashboard.custom_charts_filter_remove')}
                                    </button>
                                </div>
                                {(f.kind === 'category_in' || f.kind === 'category_not_in') && (
                                    <>
                                        <textarea
                                            value={f.categories.join(', ')}
                                            onChange={(e) => {
                                                const cats = e.target.value
                                                    .split(/[,;\n]+/)
                                                    .map((x) => x.trim())
                                                    .filter(Boolean);
                                                setFilters((prev) =>
                                                    prev.map((x) =>
                                                        x.id === f.id && (x.kind === 'category_in' || x.kind === 'category_not_in')
                                                            ? { ...x, categories: cats }
                                                            : x
                                                    )
                                                );
                                            }}
                                            rows={2}
                                            placeholder={t('dashboard.custom_charts_filter_categories_placeholder')}
                                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                                        />
                                        {categoryOptions.length > 0 && (
                                            <p className="text-[10px] text-gray-500">
                                                {t('dashboard.custom_charts_filter_categories_hint')}
                                            </p>
                                        )}
                                    </>
                                )}
                                {(f.kind === 'description_contains' || f.kind === 'description_not_contains') && (
                                    <input
                                        type="text"
                                        value={f.text}
                                        onChange={(e) =>
                                            setFilters((prev) =>
                                                prev.map((x) =>
                                                    x.id === f.id &&
                                                    (x.kind === 'description_contains' || x.kind === 'description_not_contains')
                                                        ? { ...x, text: e.target.value }
                                                        : x
                                                )
                                            )
                                        }
                                        placeholder={t('dashboard.custom_charts_filter_text_placeholder')}
                                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                                    />
                                )}
                                {(f.kind === 'amount_min' || f.kind === 'amount_max') && (
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={f.value || ''}
                                        onChange={(e) => {
                                            const v = Number(e.target.value);
                                            setFilters((prev) =>
                                                prev.map((x) =>
                                                    x.id === f.id && (x.kind === 'amount_min' || x.kind === 'amount_max')
                                                        ? { ...x, value: Number.isFinite(v) ? v : 0 }
                                                        : x
                                                )
                                            );
                                        }}
                                        placeholder={t('dashboard.custom_charts_filter_amount_placeholder')}
                                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                                    />
                                )}
                            </div>
                        ))}
                        {filters.length < MAX_USER_CHART_FILTER_CLAUSES && (
                            <button
                                type="button"
                                onClick={() => setFilters((prev) => [...prev, newFilterClause('description_contains')])}
                                className="text-xs font-semibold text-violet-700 hover:text-violet-900"
                            >
                                + {t('dashboard.custom_charts_filter_add')}
                            </button>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={!title.trim() || (!isEdit && atLimit)}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isEdit ? t('dashboard.custom_charts_save_changes') : t('dashboard.custom_charts_save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function useUserCustomChartsEmbedded() {
    const { i18n } = useTranslation();
    const { config, updateConfig } = useDashboardConfig();
    const charts = config.customCharts ?? [];
    const [modal, setModal] = useState<{ initial: UserChartDefinition | null } | null>(null);

    const weekdayLabels = useMemo(() => {
        const locale = i18n.language === 'he' ? he : enUS;
        return Array.from({ length: 7 }, (_, i) => format(new Date(2024, 0, 7 + i), 'EEE', { locale }));
    }, [i18n.language]);

    const atLimit = charts.length >= MAX_USER_CHARTS;

    const handleSaveChart = useCallback(
        (def: UserChartDefinition) => {
            const isEdit = charts.some((c) => c.id === def.id);
            if (isEdit) {
                updateConfig({ customCharts: charts.map((c) => (c.id === def.id ? def : c)) });
            } else {
                if (charts.length >= MAX_USER_CHARTS) return;
                updateConfig({ customCharts: [...charts, def] });
            }
        },
        [charts, updateConfig]
    );

    const handleRemove = useCallback(
        (id: string) => {
            updateConfig({ customCharts: charts.filter((c) => c.id !== id) });
        },
        [charts, updateConfig]
    );

    return {
        charts,
        weekdayLabels,
        atLimit,
        modal,
        setModal,
        handleSaveChart,
        handleRemove,
    };
}

interface UserCustomChartsSectionProps {
    /** Scoped the same way as built-in analytics (month vs all). */
    displayTransactions: Transaction[];
    /** All loaded transactions (for custom-range charts). */
    fullTransactionPool: Transaction[];
    analyticsViewLabel: string;
    customCCKeywords: string[];
    categoryOptions?: string[];
    /** Default YYYY-MM for “single calendar month” when adding a chart. */
    chartDefaultSingleMonth?: string;
}

/** Standalone section (e.g. legacy layout); prefer embedding via AnalyticsDashboard. */
export function UserCustomChartsSection({
    displayTransactions,
    fullTransactionPool,
    analyticsViewLabel,
    customCCKeywords,
    categoryOptions = [],
    chartDefaultSingleMonth,
}: UserCustomChartsSectionProps) {
    const { t } = useTranslation();
    const { charts, weekdayLabels, atLimit, modal, setModal, handleSaveChart, handleRemove } = useUserCustomChartsEmbedded();

    return (
        <div className="mt-8 border-t border-gray-200 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-violet-400 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3 3 7-7M6 3h9l3 3v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{t('dashboard.custom_charts_section_title')}</h3>
                </div>
                <button
                    type="button"
                    onClick={() => setModal({ initial: null })}
                    disabled={atLimit}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('dashboard.custom_charts_add')}
                </button>
            </div>

            <p className="text-xs text-gray-500 mb-4">{t('dashboard.custom_charts_intro')}</p>

            {charts.length === 0 ? (
                <p className="text-sm text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center">
                    {t('dashboard.custom_charts_none')}
                </p>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {charts.map((spec) => (
                        <CustomChartCard
                            key={spec.id}
                            spec={spec}
                            followTransactions={displayTransactions}
                            fullTransactionPool={fullTransactionPool}
                            analyticsViewLabel={analyticsViewLabel}
                            customCCKeywords={customCCKeywords}
                            weekdayLabels={weekdayLabels}
                            onEdit={() => setModal({ initial: spec })}
                            onRemove={() => handleRemove(spec.id)}
                        />
                    ))}
                </div>
            )}

            {modal && (
                <CustomChartModal
                    key={modal.initial?.id ?? `add-${chartDefaultSingleMonth ?? 'none'}`}
                    initial={modal.initial}
                    onClose={() => setModal(null)}
                    onSave={handleSaveChart}
                    atLimit={atLimit}
                    categoryOptions={categoryOptions}
                    defaultSingleMonth={chartDefaultSingleMonth}
                />
            )}
        </div>
    );
}
