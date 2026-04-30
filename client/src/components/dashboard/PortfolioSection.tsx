import { useEffect, useMemo, useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { DashboardCardHeader, dashboardCardShellClass } from './DashboardCardChrome';
import {
    useCreateInvestment,
    useDeleteInvestment,
    useInvestmentsList,
    useInvestmentPriceHistory,
    usePortfolioHistory,
    usePortfolioSummary,
    useUpdateInvestment,
    type InvestmentRow,
} from '../../hooks/useInvestments';

function formatIls(n: number | null | undefined, locale: string): string {
    if (n == null || !Number.isFinite(n)) return '—';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
}

function formatPositionMoney(n: number | null | undefined, currency: string, locale: string): string {
    if (n == null || !Number.isFinite(n)) return '—';
    const c = currency.toUpperCase() === 'USD' ? 'USD' : 'ILS';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: c,
        maximumFractionDigits: c === 'USD' ? 4 : 2,
    }).format(n);
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
                className={`relative inline-flex h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 ${
                    checked ? 'bg-emerald-600' : 'bg-gray-300'
                }`}
            >
                <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform m-0.5 ${
                        checked ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
            </button>
            <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">{label}</span>
        </div>
    );
}

function InvestmentPriceChartPanel({
    investmentId,
    currency,
    locale,
}: {
    investmentId: string;
    currency: string;
    locale: string;
}) {
    const { t } = useTranslation();
    const { data, isLoading, isError, error } = useInvestmentPriceHistory(investmentId);

    if (isLoading) {
        return <p className="text-xs text-gray-400 py-2">{t('dashboard.portfolio.price_chart_loading')}</p>;
    }
    if (isError) {
        const code = error instanceof Error ? error.message : '';
        const msg =
            code === 'eodhd_token_required'
                ? t('dashboard.portfolio.price_chart_need_eodhd')
                : code === 'eodhd_no_data'
                  ? t('dashboard.portfolio.price_chart_no_data')
                  : code === 'invalid_buy_date'
                    ? t('dashboard.portfolio.price_chart_bad_date')
                    : t('dashboard.portfolio.price_chart_error');
        return <p className="text-xs text-rose-600 py-2">{msg}</p>;
    }
    if (!data?.points.length) {
        return <p className="text-xs text-gray-400 py-2">{t('dashboard.portfolio.price_chart_empty')}</p>;
    }

    const chartData = data.points.map((p, index) => ({
        date: p.date,
        price: p.price,
        isPurchase: p.source === 'purchase',
        idx: index,
    }));

    return (
        <div className="py-3 ps-1">
            <p className="text-[11px] text-gray-500 mb-2">
                {t('dashboard.portfolio.price_chart_hint', { symbol: data.resolvedSymbol })}
            </p>
            <div className="h-44 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <YAxis
                            tick={{ fontSize: 10 }}
                            stroke="#9ca3af"
                            domain={['auto', 'auto']}
                            tickFormatter={(v) =>
                                new Intl.NumberFormat(locale, {
                                    notation: 'compact',
                                    maximumFractionDigits: 2,
                                }).format(Number(v))
                            }
                        />
                        <Tooltip
                            formatter={(value: number | undefined, _n, item) => {
                                const src = (item?.payload as { isPurchase?: boolean } | undefined)?.isPurchase;
                                const label = src
                                    ? t('dashboard.portfolio.price_chart_purchase')
                                    : t('dashboard.portfolio.price_chart_eod');
                                return [formatPositionMoney(value, currency, locale), label];
                            }}
                            labelFormatter={(l) => String(l)}
                        />
                        <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#0d9488"
                            strokeWidth={2}
                            dot={(props: { cx?: number; cy?: number; index?: number; payload?: { isPurchase?: boolean } }) => {
                                const show = props.payload?.isPurchase === true || props.index === chartData.length - 1;
                                if (!show) return false;
                                return <circle cx={props.cx} cy={props.cy} r={props.payload?.isPurchase ? 4 : 3} fill="#0f766e" />;
                            }}
                            activeDot={{ r: 5 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
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
    const locale = i18n.language === 'he' || i18n.language.startsWith('he') ? 'he-IL' : 'en-US';

    const fromDate = useMemo(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().slice(0, 10);
    }, []);

    const { data: list, isLoading: listLoading, error: listError } = useInvestmentsList();
    const { data: summary, isLoading: sumLoading, error: sumError } = usePortfolioSummary();
    const { data: valueHist, isLoading: histLoading, error: histError } = usePortfolioHistory(fromDate);

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
    const [chartRowId, setChartRowId] = useState<string | null>(null);
    const [cardCollapsed, setCardCollapsed] = useState(defaultCollapsed);

    useEffect(() => {
        if (collapseAllSignal > 0) setCardCollapsed(true);
    }, [collapseAllSignal]);

    useEffect(() => {
        setNewTelAviv(newCur === 'ILS');
        if (newCur !== 'ILS') setNewValueInAgorot(false);
    }, [newCur]);

    const loading = listLoading || sumLoading;
    const error = listError || sumError;

    const chartRows = useMemo(
        () =>
            (valueHist?.points ?? []).map((h) => ({
                date: h.date,
                value: h.totalValueIls,
                changePct: h.changePct,
            })),
        [valueHist]
    );

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
    };

    return (
        <div className={dashboardCardShellClass}>
            <DashboardCardHeader
                collapsed={cardCollapsed}
                onToggle={() => setCardCollapsed((c) => !c)}
                icon={<TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden />}
                iconTileClassName="bg-gradient-to-br from-emerald-500 to-teal-700 shadow-emerald-200"
                title={t('dashboard.portfolio.title')}
                subtitle={<span className="text-gray-500">{t('dashboard.portfolio.subtitle')}</span>}
            />

            {!cardCollapsed && (
                <div className="px-5 pb-6 sm:px-6 sm:pb-8 border-t border-gray-100/80">
            {loading && <p className="text-sm text-gray-400">{t('dashboard.portfolio.loading')}</p>}
            {error && <p className="text-sm text-rose-600">{t('dashboard.portfolio.error_load')}</p>}

            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            {t('dashboard.portfolio.total_value')}
                        </div>
                        <div className="text-2xl font-black text-gray-900 mt-1">
                            {formatIls(summary.totalMarketValueIls, locale)}
                        </div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            {t('dashboard.portfolio.total_pnl')}
                        </div>
                        <div className={`text-2xl font-black mt-1 ${pnlClass(summary.totalPnlIls)}`}>
                            {formatIls(summary.totalPnlIls, locale)}
                        </div>
                        {summary.totalPnlPctOfCost != null && Number.isFinite(summary.totalPnlPctOfCost) ? (
                            <div className={`text-sm font-bold mt-1 ${pnlClass(summary.totalPnlIls)}`}>
                                {summary.totalPnlPctOfCost >= 0 ? '+' : ''}
                                {summary.totalPnlPctOfCost.toFixed(2)}%
                            </div>
                        ) : null}
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            {t('dashboard.portfolio.usd_ils')}
                        </div>
                        <div className="text-2xl font-black text-gray-900 mt-1">
                            {summary.usdIlsRate != null && Number.isFinite(summary.usdIlsRate)
                                ? summary.usdIlsRate.toFixed(2)
                                : '—'}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 leading-snug">{t('dashboard.portfolio.usd_ils_hint')}</p>
                    </div>
                </div>
            )}

            {summary?.partialQuotes && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
                    {t('dashboard.portfolio.partial_quotes')}
                </p>
            )}

            <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    {t('dashboard.portfolio.chart_title')}
                </h4>
                <p className="text-[11px] text-gray-400 mb-1">{t('dashboard.portfolio.chart_eod_hint')}</p>
                <p className="text-[11px] text-gray-400 mb-2">{t('dashboard.portfolio.chart_schedule_hint')}</p>
                {valueHist?.fxMode === 'spot' ? (
                    <p className="text-[11px] text-amber-800/90 mb-2">{t('dashboard.portfolio.chart_fx_spot')}</p>
                ) : (
                    <p className="text-[11px] text-gray-500 mb-2">{t('dashboard.portfolio.chart_fx_historic')}</p>
                )}
                {valueHist?.partial ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-2">
                        {t('dashboard.portfolio.value_chart_partial')}
                    </p>
                ) : null}
                {histError ? (
                    <p className="text-sm text-rose-600 mb-2">{t('dashboard.portfolio.value_history_error')}</p>
                ) : null}
                {histLoading ? (
                    <p className="text-xs text-gray-400">…</p>
                ) : chartRows.length === 0 ? (
                    <p className="text-sm text-gray-400">{t('dashboard.portfolio.history_empty')}</p>
                ) : (
                    <div className="h-48 w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                                <YAxis
                                    tick={{ fontSize: 10 }}
                                    stroke="#9ca3af"
                                    tickFormatter={(v) =>
                                        new Intl.NumberFormat(locale, {
                                            notation: 'compact',
                                            maximumFractionDigits: 1,
                                        }).format(Number(v))
                                    }
                                />
                                <Tooltip
                                    formatter={(value: number | undefined, _name, item) => {
                                        const row = item?.payload as { changePct?: number | null } | undefined;
                                        const pct = row?.changePct;
                                        const pctStr =
                                            pct != null && Number.isFinite(pct)
                                                ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`
                                                : '';
                                        return [`${formatIls(value, locale)}${pctStr}`, t('dashboard.portfolio.total_value')];
                                    }}
                                    labelFormatter={(l) => l}
                                />
                                <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div className="overflow-x-auto">
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
                            <th className="py-2 pe-3">P&amp;L (₪)</th>
                            <th className="py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {(list ?? []).map((row) => (
                            <Fragment key={row.id}>
                                <tr className="border-b border-gray-50">
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
                                                    className="text-teal-700 text-xs font-semibold me-2"
                                                    onClick={() => setChartRowId((id) => (id === row.id ? null : row.id))}
                                                >
                                                    {chartRowId === row.id
                                                        ? t('dashboard.portfolio.price_chart_hide')
                                                        : t('dashboard.portfolio.price_chart_show')}
                                                </button>
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
                                                            void deleteMut.mutateAsync(row.id).then(() => {
                                                                if (chartRowId === row.id) setChartRowId(null);
                                                            });
                                                        }
                                                    }}
                                                >
                                                    {t('dashboard.portfolio.delete')}
                                                </button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                                {chartRowId === row.id && editingId !== row.id ? (
                                    <tr className="border-b border-gray-100 bg-gray-50/90">
                                        <td colSpan={9} className="py-1 px-3">
                                            <InvestmentPriceChartPanel
                                                investmentId={row.id}
                                                currency={row.currency}
                                                locale={locale}
                                            />
                                        </td>
                                    </tr>
                                ) : null}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
                {!list?.length && !listLoading && (
                    <p className="text-sm text-gray-400 py-4">{t('dashboard.portfolio.no_positions')}</p>
                )}
            </div>

            <div className="mt-4 w-full min-w-0 border-t border-gray-100 pt-4">
                <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:gap-3">
                    <div className="flex w-full min-w-0 flex-1 flex-wrap items-end gap-2 sm:gap-3">
                        <input
                            placeholder={t('dashboard.portfolio.symbol')}
                            className="min-w-0 flex-1 basis-[8rem] rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono uppercase"
                            value={newSymbol}
                            onChange={(e) => setNewSymbol(e.target.value)}
                        />
                        <input
                            placeholder={t('dashboard.portfolio.nickname_placeholder')}
                            className="min-w-0 flex-1 basis-[7rem] rounded-xl border border-gray-200 px-3 py-2 text-sm"
                            maxLength={120}
                            value={newNickname}
                            onChange={(e) => setNewNickname(e.target.value)}
                        />
                        <input
                            type="number"
                            placeholder={t('dashboard.portfolio.quantity')}
                            className="w-full min-w-[4.5rem] max-w-[6.5rem] shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm sm:w-24"
                            value={newQty}
                            onChange={(e) => setNewQty(e.target.value)}
                        />
                        <input
                            type="number"
                            placeholder={t('dashboard.portfolio.purchase_price')}
                            className="min-w-0 flex-1 basis-[6rem] rounded-xl border border-gray-200 px-3 py-2 text-sm"
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                        />
                        <select
                            className="w-full min-w-[5.5rem] max-w-[7rem] shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                            value={newCur}
                            onChange={(e) => setNewCur(e.target.value as 'USD' | 'ILS')}
                        >
                            <option value="USD">USD</option>
                            <option value="ILS">ILS</option>
                        </select>
                        <TaListingSwitch
                            checked={newTelAviv}
                            onChange={setNewTelAviv}
                            disabled={createMut.isPending}
                            title={t('dashboard.portfolio.tase_quote_help')}
                            label={t('dashboard.portfolio.tase_quote_short')}
                        />
                        {newCur === 'ILS' && (
                            <label
                                className="flex min-w-0 max-w-full flex-1 basis-[10rem] cursor-pointer items-center gap-2 text-xs text-gray-600"
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
                        <input
                            type="date"
                            className="min-w-0 flex-1 basis-[10rem] rounded-xl border border-gray-200 px-3 py-2 text-sm sm:max-w-[11rem]"
                            value={newFrom}
                            onChange={(e) => setNewFrom(e.target.value)}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void onAdd()}
                        disabled={createMut.isPending}
                        className="w-full shrink-0 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 lg:ms-auto lg:w-auto lg:min-w-[10.5rem]"
                    >
                        {t('dashboard.portfolio.add')}
                    </button>
                </div>
            </div>
                </div>
            )}
        </div>
    );
}
