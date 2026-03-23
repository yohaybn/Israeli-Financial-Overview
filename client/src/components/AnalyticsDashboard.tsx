import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Treemap } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TREEMAP_SMALL_MERGED_ID, useAnalytics } from '../hooks/useAnalytics';
import type { CategoryParentGroupKey } from '../utils/categoryParentGroup';
import { Transaction } from '@app/shared';

interface AnalyticsDashboardProps {
    transactions: Transaction[];
    allTransactions?: Transaction[];
    onCategoryClick?: (category: string) => void;
    customCCKeywords?: string[];
    onViewRangeChange?: (range: ViewRange) => void;
    onDayFilterChange?: (filter: AnalyticsDayFilter | null) => void;
    activeDayFilter?: AnalyticsDayFilter | null;
}

type MerchantSortBy = 'amount' | 'frequency';
type ViewRange = 'month' | 'all';
export type DayFilterKind = 'weekday' | 'monthday';
export interface AnalyticsDayFilter {
    kind: DayFilterKind;
    value: number;
    viewRange: ViewRange;
    label: string;
}

function truncateLabel(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function AnalyticsDashboard({
    transactions: monthTransactions,
    allTransactions,
    onCategoryClick,
    customCCKeywords = [],
    onViewRangeChange,
    onDayFilterChange,
    activeDayFilter
}: AnalyticsDashboardProps) {
    const { t, i18n } = useTranslation();
    const [viewRange, setViewRange] = useState<ViewRange>('month');
    const [merchantSortBy, setMerchantSortBy] = useState<MerchantSortBy>('amount');
    const [selectedDayFilter, setSelectedDayFilter] = useState<{ kind: DayFilterKind; value: number } | null>(null);

    const displayTransactions = viewRange === 'all' && allTransactions ? allTransactions : monthTransactions;
    const analytics = useAnalytics(displayTransactions, customCCKeywords);

    useEffect(() => {
        if (!activeDayFilter) {
            setSelectedDayFilter(null);
            return;
        }

        setSelectedDayFilter({
            kind: activeDayFilter.kind,
            value: activeDayFilter.value
        });
    }, [activeDayFilter]);

    const treemapCell = useMemo(() => {
        const rtl = i18n.dir() === 'rtl';
        const lang = i18n.language;
        const fmt = (n: number) =>
            new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', {
                style: 'currency',
                currency: 'ILS',
                maximumFractionDigits: 0,
            }).format(n);

        return function CategoryTreemapCell(props: Record<string, unknown>) {
            const x = Number(props.x);
            const y = Number(props.y);
            const width = Number(props.width);
            const height = Number(props.height);
            const depth = Number(props.depth);
            const name = String(props.name ?? '');
            const value = Number(props.value ?? 0);
            const fill = (props.color as string | undefined) ?? '#94a3b8';
            const parentKey = (props.parentKey as CategoryParentGroupKey | undefined) ?? 'other';
            const aggregated = props.aggregated as { name: string; value: number }[] | undefined;
            const isMerged = name === TREEMAP_SMALL_MERGED_ID || Boolean(aggregated?.length);

            if (depth === 0) {
                return <rect x={x} y={y} width={width} height={height} fill="transparent" stroke="none" />;
            }
            if (depth === 1) {
                return <rect x={x} y={y} width={width} height={height} fill="transparent" stroke="none" />;
            }

            // Stroke is centered on the rect edge (~1.5px inward); keep text inside the visible fill.
            const strokeInset = 2;
            // Hebrew/RTL: SVG textAnchor="end" clips glyphs at the right edge; use start + direction rtl instead.
            const insetX = rtl
                ? Math.max(16, Math.min(22, width * 0.1)) + strokeInset
                : Math.max(12, Math.min(16, width * 0.08)) + strokeInset;
            const textX = rtl ? x + width - insetX : x + insetX;
            const textDir = rtl ? 'rtl' : 'ltr';
            const parentTracking = rtl ? '0.02em' : '0.07em';
            /** LTR amounts: anchor at right inset in RTL so digits don’t spill past the tile edge. */
            const amountAnchor = rtl ? 'end' : 'start';

            const displayTitle = isMerged ? t('analytics.treemap_merged_tile') : name;
            const parentLabel = String(t(`analytics.treemap_group_${parentKey}`)).toUpperCase();

            const showFull = width >= 92 && height >= 58;
            const showCompact = !showFull && width >= 68 && height >= 46;
            const showAny = showFull || showCompact;

            const parentSize = width >= 140 ? 10 : 9;
            const titleSize = width >= 140 ? 14 : width >= 100 ? 13 : 12;
            const amountSize = 11;
            const maxChars = width < 100 ? 12 : width < 140 ? 22 : 36;
            const title = truncateLabel(displayTitle, maxChars);

            const line1Y = y + parentSize + 6;
            const line2Y = line1Y + (showFull ? titleSize + 5 : titleSize + 3);

            return (
                <g className={isMerged ? 'cursor-default' : 'cursor-pointer'} style={{ overflow: 'visible' }}>
                    <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={8}
                        ry={8}
                        fill={fill}
                        stroke="#f3f4f6"
                        strokeWidth={3}
                    />
                    {showAny && (
                        <>
                            {showFull && (
                                <text
                                    className="analytics-treemap-label"
                                    x={textX}
                                    y={line1Y}
                                    textAnchor="start"
                                    fill="#111827"
                                    stroke="none"
                                    fontSize={parentSize}
                                    fontWeight={700}
                                    letterSpacing={parentTracking}
                                    style={{
                                        fontFamily: 'inherit',
                                        direction: textDir,
                                        unicodeBidi: rtl ? 'plaintext' : 'normal',
                                        fill: '#111827',
                                        stroke: 'none',
                                    }}
                                >
                                    {parentLabel}
                                </text>
                            )}
                            <text
                                className="analytics-treemap-label"
                                x={textX}
                                y={showFull ? line2Y : y + titleSize + 10}
                                textAnchor="start"
                                fill="#111827"
                                stroke="none"
                                fontSize={titleSize}
                                fontWeight={800}
                                style={{
                                    fontFamily: 'inherit',
                                    direction: textDir,
                                    unicodeBidi: rtl ? 'plaintext' : 'normal',
                                    fill: '#111827',
                                    stroke: 'none',
                                }}
                            >
                                {title}
                            </text>
                            {(showFull && height > 62) || (showCompact && height > 50) ? (
                                <text
                                    className="analytics-treemap-label-amount"
                                    x={textX}
                                    y={y + height - 10}
                                    textAnchor={amountAnchor}
                                    fill="#1f2937"
                                    stroke="none"
                                    fontSize={amountSize}
                                    fontWeight={700}
                                    style={{
                                        fontFamily: 'inherit',
                                        direction: 'ltr',
                                        unicodeBidi: 'isolate',
                                        fill: '#1f2937',
                                        stroke: 'none',
                                    }}
                                >
                                    {fmt(value)}
                                </text>
                            ) : null}
                        </>
                    )}
                </g>
            );
        };
    }, [t, i18n]);

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0
        }).format(value);

    if (!displayTransactions || displayTransactions.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400">
                <p>{t('analytics.no_data')}</p>
            </div>
        );
    }

    const getWeekdayLabel = (dayIndex: number) => {
        const baseSunday = new Date(Date.UTC(2024, 0, 7 + dayIndex));
        return new Intl.DateTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', {
            weekday: 'short'
        }).format(baseSunday);
    };

    const handleViewRangeChange = (range: ViewRange) => {
        setViewRange(range);
        setSelectedDayFilter(null);
        onViewRangeChange?.(range);
        onDayFilterChange?.(null);
    };

    const handleDayFilterClick = (kind: DayFilterKind, value: number, label: string) => {
        if (selectedDayFilter?.kind === kind && selectedDayFilter.value === value) {
            setSelectedDayFilter(null);
            onDayFilterChange?.(null);
            return;
        }

        setSelectedDayFilter({ kind, value });
        onDayFilterChange?.({
            kind,
            value,
            viewRange,
            label
        });
    };

    return (
        <div className="space-y-6 p-4">
            <div className="flex justify-end mb-2">
                <div className="inline-flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-sm">
                    <button
                        onClick={() => handleViewRangeChange('month')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewRange === 'month'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t('analytics.this_month')}
                    </button>
                    <button
                        onClick={() => handleViewRangeChange('all')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewRange === 'all'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t('analytics.all_months')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">{t('analytics.spending_by_category')}</h3>
                    {analytics.byCategoryTree.length === 0 ? (
                        <div className="flex items-center justify-center h-[300px] text-sm text-gray-400">
                            {t('analytics.no_data')}
                        </div>
                    ) : (
                        <div>
                            <ResponsiveContainer width="100%" height={analytics.treemapSmallParts.length > 0 ? 300 : 320}>
                                <Treemap
                                    data={analytics.byCategoryTree as unknown as Record<string, unknown>[]}
                                    dataKey="value"
                                    nameKey="name"
                                    type="flat"
                                    aspectRatio={0.5 * (1 + Math.sqrt(5))}
                                    stroke="#f3f4f6"
                                    fill="#888888"
                                    isAnimationActive={false}
                                    content={treemapCell}
                                    onClick={(node: { depth?: number; name?: string }) => {
                                        if (node?.depth !== 2 || !node.name || node.name === TREEMAP_SMALL_MERGED_ID) return;
                                        onCategoryClick?.(node.name);
                                    }}
                                >
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const raw = payload[0]?.payload as Record<string, unknown> | undefined;
                                            if (!raw) return null;
                                            const v = Number(raw.value ?? 0);
                                            const nm = String(raw.name ?? '');
                                            const agg = raw.aggregated as { name: string; value: number }[] | undefined;
                                            const label =
                                                nm === TREEMAP_SMALL_MERGED_ID
                                                    ? t('analytics.treemap_merged_tile')
                                                    : nm;
                                            return (
                                                <div
                                                    className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm shadow-lg"
                                                    style={{ maxWidth: 280 }}
                                                >
                                                    <p className="font-bold text-gray-900">{label}</p>
                                                    <p className="mt-0.5 font-semibold text-gray-700">{formatCurrency(v)}</p>
                                                    {agg && agg.length > 0 && (
                                                        <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600">
                                                            {agg.map((a) => (
                                                                <li key={a.name} className="flex justify-between gap-3">
                                                                    <span className="min-w-0 truncate font-medium">{a.name}</span>
                                                                    <span className="shrink-0 tabular-nums">{formatCurrency(a.value)}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            );
                                        }}
                                    />
                                </Treemap>
                            </ResponsiveContainer>
                            {analytics.treemapSmallParts.length > 0 && (
                                <div className="mt-3 space-y-1.5">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                                        {t('analytics.treemap_small_strip_title')}
                                    </p>
                                    <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:thin]">
                                        {analytics.treemapSmallParts.map((part) => (
                                            <button
                                                key={part.name}
                                                type="button"
                                                title={`${part.name} — ${formatCurrency(part.value)}`}
                                                aria-label={`${part.name}, ${formatCurrency(part.value)}`}
                                                onClick={() => onCategoryClick?.(part.name)}
                                                disabled={!onCategoryClick}
                                                className={`flex h-[56px] w-[104px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                                                    onCategoryClick
                                                        ? 'cursor-pointer hover:brightness-[0.97] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                                                        : 'cursor-default opacity-90'
                                                }`}
                                                style={{
                                                    backgroundColor: `${part.color}40`,
                                                    border: '1px solid rgba(0,0,0,0.06)',
                                                }}
                                            >
                                                <span className="line-clamp-2 w-full text-[11px] font-bold leading-tight text-gray-900">
                                                    {part.name}
                                                </span>
                                                <span className="text-[10px] font-semibold tabular-nums text-gray-800">
                                                    {formatCurrency(part.value)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <p className="text-[10px] text-center text-gray-400 mt-2">
                        {t('analytics.click_hint')}
                    </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">{t('analytics.monthly_spending_trend')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.byMonth}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `ILS ${Math.round(v / 1000)}k`} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(value) => formatCurrency(Number(value))}
                            />
                            <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                            <Bar dataKey="income" name={t('analytics.income')} fill="#10ac84" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="expenses" name={t('analytics.expenses')} fill="#ee5253" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">{t('analytics.spending_by_weekday')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.byWeekday}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis
                                dataKey="dayIndex"
                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(value) => getWeekdayLabel(Number(value))}
                            />
                            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `ILS ${Math.round(v / 1000)}k`} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                labelFormatter={(value) => getWeekdayLabel(Number(value))}
                                formatter={(value) => formatCurrency(Number(value))}
                            />
                            <Bar
                                dataKey="value"
                                name={t('analytics.expenses')}
                                radius={[4, 4, 0, 0]}
                                onClick={(data: any) => {
                                    if (!data) return;
                                    handleDayFilterClick('weekday', data.dayIndex, getWeekdayLabel(data.dayIndex));
                                }}
                            >
                                {analytics.byWeekday.map((entry) => {
                                    const isSelected = selectedDayFilter?.kind === 'weekday' && selectedDayFilter.value === entry.dayIndex;
                                    return (
                                        <Cell
                                            key={`weekday-${entry.dayIndex}`}
                                            fill={isSelected ? '#2563eb' : '#60a5fa'}
                                            className="cursor-pointer"
                                        />
                                    );
                                })}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">{t('analytics.spending_by_month_day')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.byMonthDay}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="day" tick={{ fontSize: 8, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={2} />
                            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `ILS ${Math.round(v / 1000)}k`} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(value) => formatCurrency(Number(value))}
                            />
                            <Bar
                                dataKey="value"
                                name={t('analytics.expenses')}
                                radius={[3, 3, 0, 0]}
                                onClick={(data: any) => {
                                    if (!data) return;
                                    handleDayFilterClick('monthday', data.day, String(data.day));
                                }}
                            >
                                {analytics.byMonthDay.map((entry) => {
                                    const isSelected = selectedDayFilter?.kind === 'monthday' && selectedDayFilter.value === entry.day;
                                    return (
                                        <Cell
                                            key={`monthday-${entry.day}`}
                                            fill={isSelected ? '#ea580c' : '#fb923c'}
                                            className="cursor-pointer"
                                        />
                                    );
                                })}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-800">{t('analytics.top_merchants')}</h3>
                        <p className="text-xs text-gray-400 mt-1">{t('analytics.merchants_subtitle')}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMerchantSortBy('amount')}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all border ${merchantSortBy === 'amount'
                                ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                                : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'
                                }`}
                        >
                            {t('analytics.total_amount')}
                        </button>
                        <button
                            onClick={() => setMerchantSortBy('frequency')}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all border ${merchantSortBy === 'frequency'
                                ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                                : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'
                                }`}
                        >
                            {t('analytics.txns')}
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-50">
                                <th className="pb-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('transactions.merchant')}</th>
                                <th className="pb-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">{t('analytics.txns')}</th>
                                <th className="pb-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">{t('analytics.total_amount')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {analytics.topMerchants
                                .slice(0, 10)
                                .sort((a, b) =>
                                    merchantSortBy === 'amount'
                                        ? b.total - a.total
                                        : b.count - a.count
                                )
                                .map((m, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">
                                                    {m.description.charAt(0)}
                                                </div>
                                                <span className="text-sm font-semibold text-gray-700">{m.description}</span>
                                            </div>
                                        </td>
                                        <td className="py-3.5 text-center">
                                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                {m.count}
                                            </span>
                                        </td>
                                        <td className="py-3.5 text-right font-black text-gray-900 text-sm">
                                            {formatCurrency(m.total)}
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
