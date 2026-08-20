import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, useQueries } from '@tanstack/react-query';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { TrendingUp, RefreshCw, Plus, X } from 'lucide-react';
import { DashboardCardHeader, dashboardCardShellClass } from './DashboardCardChrome';
import {
    useCreateInvestment,
    useDeleteInvestment,
    useInvestmentsList,
    usePortfolioSummary,
    useUpdateInvestment,
    refreshPortfolioInvestmentData,
    investmentsKeys,
    type InvestmentPriceHistoryDto,
    type InvestmentRow,
} from '../../hooks/useInvestments';
import { api } from '../../lib/api';

function formatIls(n: number | null | undefined, locale: string): string {
    if (n == null || !Number.isFinite(n)) return '—';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
}

function pnlClass(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return 'text-gray-500';
    if (v > 0) return 'text-emerald-600';
    if (v < 0) return 'text-rose-600';
    return 'text-gray-700';
}

function positionQuoteErrorText(t: (key: string) => string, err: string): string {
    if (err === 'fx_unavailable') return t('dashboard.portfolio.fx_rate_missing');
    if (err === 'quote_unavailable') return t('dashboard.portfolio.quote_unavailable');
    return err;
}

const ALLOCATION_COLORS = ['#14b8a6', '#0d9488', '#06b6d4', '#38bdf8', '#60a5fa', '#a78bfa', '#f59e0b', '#f97316'];

function TaListingSwitch({
    checked,
    onChange,
    disabled,
    title,
    label,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    title: string;
    label: string;
}) {
    return (
        <div className="flex items-center gap-2 shrink-0" title={title}>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                dir="ltr"
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 ${checked ? 'bg-emerald-600' : 'bg-gray-300'
                    }`}
            >
                <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform m-0.5 ${checked ? 'translate-x-5' : 'translate-x-0'
                        }`}
                />
            </button>
            <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">{label}</span>
        </div>
    );
}

export function PortfolioSection({
    collapseAllSignal = 0,
    defaultCollapsed = false,
}: {
    collapseAllSignal?: number;
    defaultCollapsed?: boolean;
} = {}) {
    const { t, i18n } = useTranslation();
    const isHebrew = i18n.language === 'he' || i18n.language.startsWith('he');
    const locale = i18n.language === 'he' || i18n.language.startsWith('he') ? 'he-IL' : 'en-US';
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    useEffect(() => {
        if (collapseAllSignal > 0) setCollapsed(true);
    }, [collapseAllSignal]);
    const qc = useQueryClient();
    const [eodRefreshing, setEodRefreshing] = useState(false);

    const { data: list, isLoading: listLoading, error: listError } = useInvestmentsList();
    const { data: summary, isLoading: sumLoading, error: sumError } = usePortfolioSummary();

    const createMut = useCreateInvestment();
    const updateMut = useUpdateInvestment();
    const deleteMut = useDeleteInvestment();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Partial<InvestmentRow>>({});

    const [newSymbol, setNewSymbol] = useState('');
    const [newQty, setNewQty] = useState('1');
    const [newPrice, setNewPrice] = useState('');
    const [newCur, setNewCur] = useState<'USD' | 'ILS'>('USD');
    const [newTelAviv, setNewTelAviv] = useState(false);
    const [newValueInAgorot, setNewValueInAgorot] = useState(false);
    const [newFrom, setNewFrom] = useState(() => new Date().toISOString().slice(0, 10));
    const [newNickname, setNewNickname] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    useEffect(() => {
        setNewTelAviv(newCur === 'ILS');
        if (newCur !== 'ILS') setNewValueInAgorot(false);
    }, [newCur]);

    const loading = listLoading || sumLoading;
    const error = listError || sumError;

    const priceHistoryQueries = useQueries({
        queries: (list ?? []).map((row) => ({
            queryKey: investmentsKeys.priceHistory(row.id),
            queryFn: async () => {
                const { data } = await api.get<{
                    success: boolean;
                    data?: InvestmentPriceHistoryDto;
                    error?: string;
                    detail?: string;
                }>(`/investments/${row.id}/price-history`, { validateStatus: () => true });
                if (!data.success || !data.data) {
                    throw new Error(data.error || data.detail || 'load_failed');
                }
                return data.data;
            },
            staleTime: 0,
            gcTime: 5 * 60_000,
            enabled: true,
        })),
    });
    const stockLines = useMemo(() => {
        return (list ?? [])
            .map((row, index) => {
                const q = priceHistoryQueries[index];
                const data = q?.data;
                if (!data?.points?.length) return null;
                const base = data.points[0]?.price;
                if (!Number.isFinite(base) || base <= 0) return null;
                const indexed = data.points
                    .filter((p) => Number.isFinite(p.price) && p.price > 0)
                    .map((p) => ({ date: p.date, value: (p.price / base) * 100 }));
                if (!indexed.length) return null;
                return {
                    id: row.id,
                    label: row.symbol,
                    tooltipLabel: row.nickname?.trim() ? row.nickname.trim() : row.symbol,
                    points: indexed,
                };
            })
            .filter(
                (
                    line
                ): line is { id: string; label: string; tooltipLabel: string; points: { date: string; value: number }[] } =>
                    Boolean(line)
            );
    }, [list, priceHistoryQueries]);
    const stockLineNameById = useMemo(
        () =>
            Object.fromEntries(
                stockLines.map((line) => [
                    line.id,
                    {
                        label: line.label,
                        tooltipLabel: line.tooltipLabel,
                    },
                ])
            ),
        [stockLines]
    );
    const stockChartRows = useMemo(() => {
        const allDates = new Set<string>();
        stockLines.forEach((line) => {
            line.points.forEach((p) => allDates.add(p.date));
        });
        const dates = Array.from(allDates).sort((a, b) => a.localeCompare(b));
        return dates.map((date) => {
            const row: Record<string, number | string | null> = { date };
            stockLines.forEach((line) => {
                const point = line.points.find((p) => p.date === date);
                row[line.id] = point ? point.value : null;
            });
            return row;
        });
    }, [stockLines]);
    const stockChartLoading = (list?.length ?? 0) > 0 && priceHistoryQueries.some((q) => q.isLoading);
    const stockChartError = priceHistoryQueries.find((q) => q.isError)?.error;
    const allocationRows = useMemo(() => {
        const positions = summary?.positions ?? [];
        const valid = positions
            .map((p) => ({
                ...p,
                marketValueIls: p.marketValueIls ?? 0,
            }))
            .filter((p) => Number.isFinite(p.marketValueIls) && p.marketValueIls > 0);
        const total = valid.reduce((sum, p) => sum + p.marketValueIls, 0);
        if (!total) return [];
        return valid
            .map((p) => ({
                key: p.investmentId,
                label: p.nickname?.trim() ? `${p.symbol} (${p.nickname})` : p.symbol,
                symbol: p.symbol,
                valueIls: p.marketValueIls,
                percent: (p.marketValueIls / total) * 100,
            }))
            .sort((a, b) => b.valueIls - a.valueIls);
    }, [summary]);
    const holdingsRows = useMemo(() => {
        const positions = summary?.positions ?? [];
        const totalValue = positions.reduce((sum, p) => sum + Math.max(0, p.marketValueIls ?? 0), 0);
        return positions
            .map((p) => {
                const marketValue = p.marketValueIls ?? 0;
                const percent = totalValue > 0 && marketValue > 0 ? (marketValue / totalValue) * 100 : 0;
                return {
                    id: p.investmentId,
                    symbol: p.symbol,
                    nickname: p.nickname?.trim() || '',
                    quantity: p.quantity,
                    marketValue,
                    percent,
                    pnlIls: p.pnlIls ?? null,
                    pnlPctOfCost: p.pnlPctOfCost ?? null,
                    quoteError: p.quoteError,
                };
            })
            .sort((a, b) => b.marketValue - a.marketValue);
    }, [summary]);

    const startEdit = (row: InvestmentRow) => {
        setEditingId(row.id);
        setDraft({ ...row });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setDraft({});
    };

    const saveEdit = async () => {
        if (!editingId || !draft.symbol) return;
        const curU = String(draft.currency ?? '').toUpperCase();
        await updateMut.mutateAsync({
            id: editingId,
            patch: {
                symbol: draft.symbol,
                quantity: draft.quantity,
                purchase_price_per_unit: draft.purchasePricePerUnit,
                currency: draft.currency,
                track_from_date: draft.trackFromDate,
                use_tel_aviv_listing: draft.useTelAvivListing,
                nickname:
                    draft.nickname === undefined || draft.nickname === null
                        ? null
                        : String(draft.nickname).trim() === ''
                            ? null
                            : String(draft.nickname).trim(),
                ...(curU === 'ILS' ? { value_in_agorot: Boolean(draft.valueInAgorot) } : { value_in_agorot: false }),
            },
        });
        cancelEdit();
    };

    const onAdd = async () => {
        const sym = newSymbol.trim().toUpperCase();
        const qty = parseFloat(newQty);
        const price = parseFloat(newPrice);
        if (!sym || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return;
        await createMut.mutateAsync({
            symbol: sym,
            quantity: qty,
            purchase_price_per_unit: price,
            currency: newCur,
            track_from_date: newFrom,
            use_tel_aviv_listing: newTelAviv,
            ...(newCur === 'ILS' && newValueInAgorot ? { value_in_agorot: true } : {}),
            ...(newNickname.trim() ? { nickname: newNickname.trim() } : {}),
        });
        setNewSymbol('');
        setNewQty('1');
        setNewPrice('');
        setNewNickname('');
        setNewValueInAgorot(false);
        setIsCreateModalOpen(false);
    };

    return (
        <div className={dashboardCardShellClass}>
            <DashboardCardHeader
                collapsed={collapsed}
                onToggle={() => setCollapsed((c) => !c)}
                collapsible={true}
                icon={<TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden />}
                iconTileClassName="bg-gradient-to-br from-emerald-500 to-teal-700 shadow-emerald-200"
                title={t('dashboard.portfolio.title')}
                subtitle={<span className="text-gray-500">{t('dashboard.portfolio.subtitle')}</span>}
            />
            {!collapsed && (
                <div className="px-4 pb-5 sm:px-5 sm:pb-6 border-t border-gray-100/80">
                {loading && <p className="text-sm text-gray-400">{t('dashboard.portfolio.loading')}</p>}
                {error && <p className="text-sm text-rose-600">{t('dashboard.portfolio.error_load')}</p>}

                {summary && (
                    <div className="mb-4 rounded-3xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-4 shadow-sm">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div className={isHebrew ? 'text-right' : ''}>
                                <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700/80">
                                    {t('dashboard.portfolio.total_value')}
                                </div>
                                <div className="text-3xl sm:text-[2rem] font-black text-gray-900 mt-1 leading-none">
                                    {formatIls(summary.totalMarketValueIls, locale)}
                                </div>
                            </div>
                            <div className={isHebrew ? 'text-left' : 'text-right'}>
                                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                    {t('dashboard.portfolio.total_pnl')}
                                </div>
                                <div className={`text-xl font-black mt-1 ${pnlClass(summary.totalPnlIls)}`}>
                                    {formatIls(summary.totalPnlIls, locale)}
                                </div>
                                {summary.totalPnlPctOfCost != null && Number.isFinite(summary.totalPnlPctOfCost) ? (
                                    <div className={`text-sm font-bold mt-0.5 ${pnlClass(summary.totalPnlIls)}`}>
                                        {summary.totalPnlPctOfCost >= 0 ? '+' : ''}
                                        {summary.totalPnlPctOfCost.toFixed(2)}%
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <div className={`mt-2 text-[11px] text-gray-500 ${isHebrew ? 'text-right' : ''}`}>
                            {t('dashboard.portfolio.usd_ils')}:&nbsp;
                            {summary.usdIlsRate != null && Number.isFinite(summary.usdIlsRate) ? summary.usdIlsRate.toFixed(2) : '—'}
                        </div>
                    </div>
                )}

                {summary?.partialQuotes && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
                        {t('dashboard.portfolio.partial_quotes')}
                    </p>
                )}

                <div className="mb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h4 className={`text-xs font-bold text-gray-500 uppercase tracking-wider ${isHebrew ? 'text-right' : ''}`}>
                            {t('dashboard.portfolio.chart_title')}
                        </h4>
                    </div>
                    {stockChartError ? (
                        <p className="text-sm text-rose-600 mb-2">
                            {stockChartError instanceof Error ? stockChartError.message : t('dashboard.portfolio.value_history_error')}
                        </p>
                    ) : null}
                    {stockChartLoading ? (
                        <p className="text-xs text-gray-400">…</p>
                    ) : stockChartRows.length === 0 || stockLines.length === 0 ? (
                        <p className="text-sm text-gray-400">{t('dashboard.portfolio.history_empty')}</p>
                    ) : (
                        <div className="h-48 w-full min-w-0 rounded-3xl border border-emerald-100/70 bg-gradient-to-b from-white to-emerald-50/40 p-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stockChartRows} margin={{ top: 8, right: 12, left: 6, bottom: 2 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="date"
                                        minTickGap={20}
                                        tick={{ fontSize: 10 }}
                                        stroke="#94a3b8"
                                        tickMargin={8}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10 }}
                                        stroke="#94a3b8"
                                        domain={['auto', 'auto']}
                                        tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                                    />
                                    <Tooltip
                                        formatter={(value: number | undefined, name, item) => {
                                            const dataKey = String(item?.dataKey ?? '');
                                            const displayName = stockLineNameById[dataKey]?.tooltipLabel || String(name);
                                            if (!Number.isFinite(value)) return ['—', String(name)];
                                            return [`${Number(value).toFixed(2)}%`, displayName];
                                        }}
                                        labelFormatter={(l) => l}
                                    />
                                    {stockLines.map((line, index) => (
                                        <Line
                                            key={line.id}
                                            type="monotone"
                                            dataKey={line.id}
                                            name={line.label}
                                            stroke={ALLOCATION_COLORS[index % ALLOCATION_COLORS.length]}
                                            strokeWidth={2.3}
                                            dot={false}
                                            connectNulls
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {holdingsRows.length > 0 ? (
                    <div className="mb-4 rounded-3xl border border-teal-100/70 bg-gradient-to-br from-teal-50/70 to-cyan-50/40 p-3">
                        <h4 className={`text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 ${isHebrew ? 'text-right' : ''}`}>
                            {t('dashboard.portfolio.positions')}
                        </h4>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="h-44 w-full max-w-[260px] mx-auto md:mx-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={allocationRows.length > 1 ? allocationRows : [{ key: 'single', label: holdingsRows[0]?.symbol ?? '', valueIls: Math.max(holdingsRows[0]?.marketValue ?? 0, 1), percent: 100 }]}
                                            dataKey="valueIls"
                                            nameKey="label"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={70}
                                            innerRadius={40}
                                            paddingAngle={2}
                                        >
                                            {(allocationRows.length > 1 ? allocationRows : [{ key: 'single' }]).map((row, index) => (
                                                <Cell key={row.key} fill={ALLOCATION_COLORS[index % ALLOCATION_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number | undefined, _name, item) => {
                                                const payload = item?.payload as { percent?: number; label?: string } | undefined;
                                                const pct = payload?.percent ?? 0;
                                                const stockDisplay = payload?.label?.trim() || t('dashboard.portfolio.symbol');
                                                return [`${formatIls(value, locale)} (${pct.toFixed(1)}%)`, stockDisplay];
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-2">
                                {holdingsRows.map((row, index) => (
                                    <div
                                        key={row.id}
                                        className="flex items-center justify-between gap-2.5 rounded-2xl border border-white/90 bg-white/95 px-2.5 py-2 shadow-sm"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className="inline-block h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white"
                                                style={{ backgroundColor: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] }}
                                            />
                                            <div className={`min-w-0 ${isHebrew ? 'text-right' : ''}`}>
                                                <div className="text-sm font-semibold text-gray-800 truncate" title={row.nickname ? `${row.symbol} (${row.nickname})` : row.symbol}>
                                                    {row.symbol}
                                                    {row.nickname ? <span className="text-gray-500 font-medium"> ({row.nickname})</span> : null}
                                                </div>
                                                <div className="text-[11px] text-gray-500">{row.percent.toFixed(1)}%</div>
                                            </div>
                                        </div>
                                        <div className={`${isHebrew ? 'text-left' : 'text-right'} shrink-0`}>

                                            <div className="text-[11px] text-gray-500">{formatIls(row.marketValue, locale)}</div>
                                            <div className={`text-xs font-bold mt-0.5 ${pnlClass(row.pnlIls)}`}>
                                                {row.pnlPctOfCost != null && Number.isFinite(row.pnlPctOfCost) ? (
                                                    <>
                                                        {row.pnlPctOfCost >= 0 ? '+' : ''}
                                                        {row.pnlPctOfCost.toFixed(2)}%
                                                        {' · '}
                                                    </>
                                                ) : null}
                                                {formatIls(row.pnlIls, locale)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}

                <div className={`mb-4 flex flex-wrap items-center gap-2 ${isHebrew ? 'justify-start' : 'justify-end'}`}>
                    <button
                        type="button"
                        title={t('dashboard.portfolio.add')}
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    >
                        <Plus className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                        type="button"
                        title={t('dashboard.portfolio.refresh_eod_tooltip')}
                        aria-busy={eodRefreshing}
                        disabled={eodRefreshing || listLoading || sumLoading}
                        onClick={() => {
                            void (async () => {
                                setEodRefreshing(true);
                                try {
                                    await refreshPortfolioInvestmentData(qc);
                                } catch {
                                    await qc.invalidateQueries({ queryKey: ['investments'], refetchType: 'active' });
                                } finally {
                                    setEodRefreshing(false);
                                }
                            })();
                        }}
                        className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-45 disabled:pointer-events-none"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${eodRefreshing ? 'animate-spin' : ''}`} aria-hidden />
                        <span className="truncate max-w-[8.5rem]">
                            {eodRefreshing ? t('dashboard.portfolio.refresh_eod_busy') : t('dashboard.portfolio.refresh_eod')}
                        </span>
                    </button>
                </div>

                <details className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
                    <summary className={`cursor-pointer list-none px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 ${isHebrew ? 'text-right' : ''}`}>
                        {t('dashboard.portfolio.manage_positions')}
                    </summary>
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                                <th className="py-2 pe-3">{t('dashboard.portfolio.symbol')}</th>
                                <th className="py-2 pe-3">{t('dashboard.portfolio.nickname')}</th>
                                <th className="py-2 pe-3">{t('dashboard.portfolio.quantity')}</th>
                                <th className="py-2 pe-3 align-bottom" title={t('dashboard.portfolio.purchase_price_agorot_title')}>
                                    <span className="block">{t('dashboard.portfolio.purchase_price')}</span>
                                    <span className="block text-[9px] font-normal normal-case text-gray-400 font-medium leading-tight mt-0.5 max-w-[7rem]">
                                        {t('dashboard.portfolio.purchase_price_agorot_sub')}
                                    </span>
                                </th>
                                <th className="py-2 pe-3">{t('dashboard.portfolio.currency')}</th>
                                <th className="py-2 pe-2 text-center" title={t('dashboard.portfolio.tase_quote_help')}>
                                    {t('dashboard.portfolio.tase_quote_short')}
                                </th>
                                <th className="py-2 pe-3">{t('dashboard.portfolio.track_from')}</th>
                                <th className="py-2 pe-3">{t('dashboard.portfolio.pnl_ils')}</th>
                                <th className="py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {(list ?? []).map((row) => (
                                <tr key={row.id} className="border-b border-gray-50">
                                    {editingId === row.id ? (
                                        <>
                                            <td className="py-2 pe-2">
                                                <input
                                                    className="w-20 rounded border border-gray-200 px-1 py-0.5"
                                                    value={draft.symbol ?? ''}
                                                    onChange={(e) =>
                                                        setDraft((d) => ({ ...d, symbol: e.target.value.toUpperCase() }))
                                                    }
                                                />
                                            </td>
                                            <td className="py-2 pe-2">
                                                <input
                                                    className="w-[7.5rem] max-w-full rounded border border-gray-200 px-1 py-0.5 text-xs"
                                                    maxLength={120}
                                                    placeholder={t('dashboard.portfolio.nickname_placeholder')}
                                                    value={draft.nickname ?? ''}
                                                    onChange={(e) => setDraft((d) => ({ ...d, nickname: e.target.value }))}
                                                />
                                            </td>
                                            <td className="py-2 pe-2">
                                                <input
                                                    type="number"
                                                    className="w-20 rounded border border-gray-200 px-1 py-0.5"
                                                    value={draft.quantity ?? ''}
                                                    onChange={(e) =>
                                                        setDraft((d) => ({ ...d, quantity: parseFloat(e.target.value) }))
                                                    }
                                                />
                                            </td>
                                            <td className="py-2 pe-2">
                                                <input
                                                    type="number"
                                                    className="w-24 rounded border border-gray-200 px-1 py-0.5"
                                                    value={draft.purchasePricePerUnit ?? ''}
                                                    onChange={(e) =>
                                                        setDraft((d) => ({
                                                            ...d,
                                                            purchasePricePerUnit: parseFloat(e.target.value),
                                                        }))
                                                    }
                                                />
                                                {String(draft.currency ?? '').toUpperCase() === 'ILS' && (
                                                    <label className="flex items-center gap-1.5 text-[10px] text-gray-600 mt-1 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(draft.valueInAgorot)}
                                                            onChange={(e) =>
                                                                setDraft((d) => ({ ...d, valueInAgorot: e.target.checked }))
                                                            }
                                                        />
                                                        <span>{t('dashboard.portfolio.agorot_checkbox')}</span>
                                                    </label>
                                                )}
                                            </td>
                                            <td className="py-2 pe-2">
                                                <select
                                                    className="rounded border border-gray-200 px-1 py-0.5"
                                                    value={draft.currency ?? 'USD'}
                                                    onChange={(e) => {
                                                        const c = e.target.value as 'USD' | 'ILS';
                                                        setDraft((d) => ({
                                                            ...d,
                                                            currency: c,
                                                            useTelAvivListing: c === 'ILS' ? (d.useTelAvivListing ?? true) : false,
                                                            ...(c !== 'ILS' ? { valueInAgorot: false } : {}),
                                                        }));
                                                    }}
                                                >
                                                    <option value="USD">USD</option>
                                                    <option value="ILS">ILS</option>
                                                </select>
                                            </td>
                                            <td className="py-2 pe-2">
                                                <div className="flex justify-center">
                                                    <TaListingSwitch
                                                        checked={Boolean(
                                                            draft.useTelAvivListing ??
                                                            String(draft.currency).toUpperCase() === 'ILS'
                                                        )}
                                                        onChange={(next) => setDraft((d) => ({ ...d, useTelAvivListing: next }))}
                                                        disabled={updateMut.isPending}
                                                        title={t('dashboard.portfolio.tase_quote_help')}
                                                        label={t('dashboard.portfolio.tase_quote_short')}
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-2 pe-2">
                                                <input
                                                    type="date"
                                                    className="rounded border border-gray-200 px-1 py-0.5"
                                                    value={draft.trackFromDate ?? ''}
                                                    onChange={(e) =>
                                                        setDraft((d) => ({ ...d, trackFromDate: e.target.value }))
                                                    }
                                                />
                                            </td>
                                            <td className="py-2 pe-2 text-gray-400">…</td>
                                            <td className="py-2 whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    className="text-emerald-600 font-semibold me-2"
                                                    onClick={() => void saveEdit()}
                                                >
                                                    {t('dashboard.portfolio.save')}
                                                </button>
                                                <button type="button" className="text-gray-500" onClick={cancelEdit}>
                                                    {t('dashboard.portfolio.cancel')}
                                                </button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="py-2 pe-3 font-mono font-semibold">{row.symbol}</td>
                                            <td className="py-2 pe-3 text-xs text-gray-600 max-w-[9rem] truncate" title={row.nickname ?? ''}>
                                                {row.nickname?.trim() ? row.nickname : '—'}
                                            </td>
                                            <td className="py-2 pe-3">{row.quantity}</td>
                                            <td className="py-2 pe-3">
                                                <span>{row.purchasePricePerUnit}</span>
                                                {row.currency?.toUpperCase() === 'ILS' && row.valueInAgorot ? (
                                                    <span className="text-[10px] text-gray-500 ms-1">
                                                        {t('dashboard.portfolio.agorot_unit')}
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="py-2 pe-3">{row.currency}</td>
                                            <td className="py-2 pe-2 text-center text-xs">
                                                {row.useTelAvivListing ?? row.currency?.toUpperCase() === 'ILS' ? '✓' : '—'}
                                            </td>
                                            <td className="py-2 pe-3">{row.trackFromDate}</td>
                                            <td className="py-2 pe-3">
                                                {(() => {
                                                    const pos = summary?.positions.find((p) => p.investmentId === row.id);
                                                    return (
                                                        <>
                                                            <div className={`font-medium ${pnlClass(pos?.pnlIls)}`}>
                                                                {formatIls(pos?.pnlIls ?? null, locale)}
                                                            </div>
                                                            {pos?.pnlPctOfCost != null && Number.isFinite(pos.pnlPctOfCost) ? (
                                                                <div className={`text-[10px] font-semibold mt-0.5 ${pnlClass(pos?.pnlIls)}`}>
                                                                    {pos.pnlPctOfCost >= 0 ? '+' : ''}
                                                                    {pos.pnlPctOfCost.toFixed(1)}%
                                                                </div>
                                                            ) : null}
                                                            {pos?.quoteError ? (
                                                                <p
                                                                    className="text-[10px] text-rose-600 mt-0.5 max-w-[min(100%,18rem)] break-words leading-snug"
                                                                    title={positionQuoteErrorText(t, pos.quoteError)}
                                                                >
                                                                    {positionQuoteErrorText(t, pos.quoteError)}
                                                                </p>
                                                            ) : null}
                                                        </>
                                                    );
                                                })()}
                                            </td>
                                            <td className="py-2 whitespace-nowrap text-end">
                                                <button
                                                    type="button"
                                                    className="text-blue-600 text-xs font-semibold me-2"
                                                    onClick={() => startEdit(row)}
                                                >
                                                    {t('dashboard.portfolio.edit')}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-rose-600 text-xs font-semibold"
                                                    onClick={() => {
                                                        if (window.confirm(t('common.delete') + '?')) {
                                                            void deleteMut.mutateAsync(row.id);
                                                        }
                                                    }}
                                                >
                                                    {t('dashboard.portfolio.delete')}
                                                </button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!list?.length && !listLoading && (
                        <p className="text-sm text-gray-400 py-4">{t('dashboard.portfolio.no_positions')}</p>
                    )}
                </details>
                {isCreateModalOpen && (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/40" onClick={() => setIsCreateModalOpen(false)} />
                        <div className="relative w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h4 className="text-lg font-bold text-gray-900">{t('dashboard.portfolio.add')}</h4>
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                                >
                                    <X className="h-4 w-4" aria-hidden />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <input
                                    placeholder={t('dashboard.portfolio.symbol')}
                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono uppercase"
                                    value={newSymbol}
                                    onChange={(e) => setNewSymbol(e.target.value)}
                                />
                                <input
                                    placeholder={t('dashboard.portfolio.nickname_placeholder')}
                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    maxLength={120}
                                    value={newNickname}
                                    onChange={(e) => setNewNickname(e.target.value)}
                                />
                                <input
                                    type="number"
                                    placeholder={t('dashboard.portfolio.quantity')}
                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={newQty}
                                    onChange={(e) => setNewQty(e.target.value)}
                                />
                                <input
                                    type="number"
                                    placeholder={t('dashboard.portfolio.purchase_price')}
                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={newPrice}
                                    onChange={(e) => setNewPrice(e.target.value)}
                                />
                                <select
                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={newCur}
                                    onChange={(e) => setNewCur(e.target.value as 'USD' | 'ILS')}
                                >
                                    <option value="USD">USD</option>
                                    <option value="ILS">ILS</option>
                                </select>
                                <input
                                    type="date"
                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={newFrom}
                                    onChange={(e) => setNewFrom(e.target.value)}
                                />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <TaListingSwitch
                                    checked={newTelAviv}
                                    onChange={setNewTelAviv}
                                    disabled={createMut.isPending}
                                    title={t('dashboard.portfolio.tase_quote_help')}
                                    label={t('dashboard.portfolio.tase_quote_short')}
                                />
                                {newCur === 'ILS' && (
                                    <label
                                        className="flex cursor-pointer items-center gap-2 text-xs text-gray-600"
                                        title={t('dashboard.portfolio.purchase_price_agorot_title')}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={newValueInAgorot}
                                            onChange={(e) => setNewValueInAgorot(e.target.checked)}
                                        />
                                        <span className="leading-snug">{t('dashboard.portfolio.agorot_checkbox')}</span>
                                    </label>
                                )}
                            </div>
                            <div className="mt-4 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => void onAdd()}
                                    disabled={createMut.isPending}
                                    className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                                >
                                    {t('dashboard.portfolio.add')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                </div>
            )}
        </div>
    );
}
