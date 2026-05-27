import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
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
    MAX_SQL_ANALYTIC_CARDS,
    resolveSqlValueDisplayLabel,
    type SqlAnalyticCardChartKind,
    type SqlAnalyticCardDefinition,
    type SqlChartSeriesRow,
    type SqlQueryResultShape,
} from '@app/shared';
import { useDashboardConfig } from '../../hooks/useDashboardConfig';
import { api } from '../../lib/api';
import { ANALYTICS_CHART_TOOLTIP_STYLE } from './UserCustomChartsSection';

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

type RunResponse = {
    queryResults: Record<string, SqlQueryResultShape>;
    chartRows: SqlChartSeriesRow[];
    chartError?: string;
};

type GenerateResponse = RunResponse & {
    card: SqlAnalyticCardDefinition;
    usedFallbackModel?: string;
};

export function useChartFormatters(language: string) {
    const formatCurrency = (value: number) =>
        new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
        }).format(value);

    const formatValue = (v: number) => {
        const abs = Math.abs(v);
        if (abs >= 1000 || Number.isInteger(v)) {
            return formatCurrency(v);
        }
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            maximumFractionDigits: 2,
        }).format(v);
    };

    return { formatValue };
}

interface SqlAnalyticCardChartBodyProps {
    chartKind: SqlAnalyticCardChartKind;
    title: string;
    valueColumns: string[];
    valueLabels?: string[];
    rows: SqlChartSeriesRow[];
    chartError?: string;
    isLoading?: boolean;
    error?: string | null;
    emptyLabel: string;
    loadingLabel: string;
    formatValue: (v: number) => string;
}

export function SqlAnalyticCardChartBody({
    chartKind,
    title,
    valueColumns,
    valueLabels,
    rows,
    chartError,
    isLoading,
    error,
    emptyLabel,
    loadingLabel,
    formatValue,
}: SqlAnalyticCardChartBodyProps) {
    const primaryValueKey = valueColumns[0] ?? 'value';
    const pieValueColumns = chartKind === 'pie' ? valueColumns.slice(0, 1) : valueColumns;

    const pieTotal = useMemo(
        () => rows.reduce((s, r) => s + Number(r[primaryValueKey] ?? 0), 0),
        [rows, primaryValueKey]
    );

    if (isLoading) {
        return (
            <div className="flex min-h-[220px] flex-1 items-center justify-center text-sm text-gray-400">
                {loadingLabel}
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex min-h-[220px] flex-1 items-center justify-center text-sm text-red-500 px-4 text-center">
                {error}
            </div>
        );
    }
    if (chartError || rows.length === 0) {
        return (
            <div className="flex min-h-[220px] flex-1 items-center justify-center text-sm text-gray-400 px-4 text-center">
                {chartError || emptyLabel}
            </div>
        );
    }

    let chart: ReactNode;
    if (chartKind === 'pie') {
        chart = (
            <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                    <Pie
                        data={rows}
                        dataKey={primaryValueKey}
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={88}
                        label={({ name, percent }) =>
                            `${String(name)} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                    >
                        {rows.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={ANALYTICS_CHART_TOOLTIP_STYLE}
                        formatter={(value) => [formatValue(Number(value ?? 0)), title]}
                    />
                </PieChart>
            </ResponsiveContainer>
        );
    } else if (chartKind === 'line') {
        chart = (
            <ResponsiveContainer width="100%" height={240}>
                <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={56} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatValue(Number(v))} width={68} />
                    <Tooltip
                        contentStyle={ANALYTICS_CHART_TOOLTIP_STYLE}
                        formatter={(value, name) => [formatValue(Number(value ?? 0)), String(name)]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '11px' }} />
                    {pieValueColumns.map((col, i) => (
                        <Line
                            key={col}
                            type="monotone"
                            dataKey={col}
                            name={resolveSqlValueDisplayLabel(col, i, valueLabels)}
                            stroke={PIE_COLORS[i % PIE_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        );
    } else {
        chart = (
            <ResponsiveContainer width="100%" height={240}>
                <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={56} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatValue(Number(v))} width={68} />
                    <Tooltip
                        contentStyle={ANALYTICS_CHART_TOOLTIP_STYLE}
                        formatter={(value, name) => [formatValue(Number(value ?? 0)), String(name)]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '11px' }} />
                    {pieValueColumns.map((col, i) => (
                        <Bar
                            key={col}
                            dataKey={col}
                            name={resolveSqlValueDisplayLabel(col, i, valueLabels)}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                            radius={[4, 4, 0, 0]}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        );
    }

    return (
        <>
            {chart}
            {chartKind === 'pie' && pieTotal > 0 ? (
                <p className="text-[10px] text-gray-400 mt-1 text-center">{formatValue(pieTotal)}</p>
            ) : null}
        </>
    );
}

export const SQL_CHART_KINDS: SqlAnalyticCardChartKind[] = ['bar', 'line', 'pie'];

function useSqlAnalyticCardRun(card: SqlAnalyticCardDefinition | null) {
    return useQuery({
        queryKey: ['sql-analytic-card-run', card?.id, card?.queries, card?.dataQueryKey, card?.labelColumn, card?.valueColumns],
        enabled: Boolean(card),
        queryFn: async () => {
            const { data } = await api.post<{ success: boolean; data: RunResponse; error?: string }>(
                '/ai/sql-analytic-cards/run',
                { card }
            );
            if (!data.success) {
                throw new Error(data.error || 'Failed to run SQL card');
            }
            return data.data;
        },
        staleTime: 60_000,
        retry: 1,
    });
}

interface SqlAnalyticCardProps {
    spec: SqlAnalyticCardDefinition;
    onEdit: () => void;
    onRemove: () => void;
}

export function SqlAnalyticCard({ spec, onEdit, onRemove }: SqlAnalyticCardProps) {
    const { t, i18n } = useTranslation();
    const { data, isLoading, isError, error } = useSqlAnalyticCardRun(spec);
    const { formatValue } = useChartFormatters(i18n.language);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-indigo-100/80 p-4 flex flex-col min-h-0 ring-1 ring-indigo-50">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-700 truncate">{spec.title}</h3>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        {t('dashboard.sql_cards_badge')} · {t(`dashboard.sql_cards_kind_${spec.chartKind}`)}
                        {spec.description ? ` · ${spec.description}` : ''}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={onEdit}
                        className="text-xs text-violet-700 hover:text-violet-900 font-medium px-2 py-1 rounded-lg hover:bg-violet-50"
                    >
                        {t('dashboard.sql_cards_edit')}
                    </button>
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded-lg hover:bg-red-50"
                    >
                        {t('dashboard.sql_cards_remove')}
                    </button>
                </div>
            </div>
            <SqlAnalyticCardChartBody
                chartKind={spec.chartKind}
                title={spec.title}
                valueColumns={spec.valueColumns}
                valueLabels={spec.valueLabels}
                rows={data?.chartRows ?? []}
                chartError={data?.chartError}
                isLoading={isLoading}
                error={isError ? (error instanceof Error ? error.message : t('dashboard.sql_cards_run_error')) : null}
                emptyLabel={t('dashboard.sql_cards_empty_data')}
                loadingLabel={t('dashboard.sql_cards_loading')}
                formatValue={formatValue}
            />
        </div>
    );
}

interface SqlAnalyticCardAiModalProps {
    initial: SqlAnalyticCardDefinition | null;
    onClose: () => void;
    onSave: (card: SqlAnalyticCardDefinition) => void;
    atLimit: boolean;
}

export async function fetchSqlCardRun(card: SqlAnalyticCardDefinition): Promise<RunResponse> {
    const { data } = await api.post<{ success: boolean; data: RunResponse; error?: string }>(
        '/ai/sql-analytic-cards/run',
        { card }
    );
    if (!data.success) {
        throw new Error(data.error || 'Failed to run SQL card');
    }
    return data.data;
}

export function SqlAnalyticCardAiModal({ initial, onClose, onSave, atLimit }: SqlAnalyticCardAiModalProps) {
    const { t, i18n } = useTranslation();
    const { formatValue } = useChartFormatters(i18n.language);
    const isEdit = Boolean(initial);
    const [draft, setDraft] = useState<SqlAnalyticCardDefinition | null>(initial);
    const [aiPrompt, setAiPrompt] = useState('');
    const [previewData, setPreviewData] = useState<RunResponse | null>(null);
    /** Chart type chosen by AI on last successful generate (for “AI suggested” hint). */
    const [aiSuggestedChartKind, setAiSuggestedChartKind] = useState<SqlAnalyticCardChartKind | null>(null);

    const displayCard = draft;

    const previewRunQuery = useQuery({
        queryKey: [
            'sql-analytic-modal-preview',
            displayCard?.id,
            displayCard?.queries,
            displayCard?.dataQueryKey,
            displayCard?.labelColumn,
            displayCard?.valueColumns,
        ],
        queryFn: () => fetchSqlCardRun(displayCard!),
        enabled: Boolean(displayCard) && !previewData,
        staleTime: 30_000,
        retry: 1,
    });

    const previewRows = previewData?.chartRows ?? previewRunQuery.data?.chartRows ?? [];
    const previewChartError = previewData?.chartError ?? previewRunQuery.data?.chartError;
    const previewLoading = previewRunQuery.isLoading && !previewData;

    const generateMutation = useMutation({
        mutationFn: async () => {
            const { data } = await api.post<{ success: boolean; data: GenerateResponse; error?: string }>(
                '/ai/sql-analytic-cards/generate',
                {
                    prompt: aiPrompt.trim(),
                    locale: i18n.language === 'he' ? 'he' : 'en',
                }
            );
            if (!data.success) {
                throw new Error(data.error || 'Generation failed');
            }
            return data.data;
        },
        onSuccess: (d) => {
            setDraft(d.card);
            setAiSuggestedChartKind(d.card.chartKind);
            setPreviewData({
                chartRows: d.chartRows,
                chartError: d.chartError,
                queryResults: d.queryResults,
            });
        },
        onError: (e: Error) => window.alert(e.message),
    });

    const setChartKind = (kind: SqlAnalyticCardChartKind) => {
        if (!draft) return;
        setDraft({ ...draft, chartKind: kind });
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!draft) {
            window.alert(t('dashboard.sql_cards_generate_first'));
            return;
        }
        if (!isEdit && atLimit) {
            window.alert(t('dashboard.sql_cards_limit', { max: MAX_SQL_ANALYTIC_CARDS }));
            return;
        }
        onSave(draft);
        onClose();
    };

    const showAiChartSuggestion =
        aiSuggestedChartKind != null &&
        displayCard != null &&
        displayCard.chartKind === aiSuggestedChartKind;
    const pieMultiSeries = Boolean(displayCard && displayCard.valueColumns.length > 1 && displayCard.chartKind === 'pie');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal>
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">
                    {isEdit ? t('dashboard.sql_cards_edit_title') : t('dashboard.sql_cards_add_title')}
                </h2>
                <p className="text-xs text-gray-500 mb-4">{t('dashboard.sql_cards_modal_hint')}</p>

                {!isEdit && atLimit ? (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                        {t('dashboard.sql_cards_limit', { max: MAX_SQL_ANALYTIC_CARDS })}
                    </p>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                        <label className="block text-xs font-semibold text-indigo-900">
                            {t('dashboard.sql_cards_ai_prompt_label')}
                        </label>
                        <textarea
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-indigo-200 px-3 py-2 text-sm"
                            placeholder={t('dashboard.sql_cards_ai_prompt_placeholder')}
                        />
                        <button
                            type="button"
                            disabled={!aiPrompt.trim() || generateMutation.isPending}
                            onClick={() => generateMutation.mutate()}
                            className="w-full py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {generateMutation.isPending
                                ? t('dashboard.sql_cards_generating')
                                : t('dashboard.sql_cards_generate')}
                        </button>
                    </div>

                    {displayCard ? (
                        <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                            <div>
                                <p className="text-sm font-semibold text-gray-800">{displayCard.title}</p>
                                {displayCard.description ? (
                                    <p className="text-xs text-gray-500 mt-0.5">{displayCard.description}</p>
                                ) : null}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                    {t('dashboard.sql_cards_chart_type_label')}
                                </label>
                                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
                                    {SQL_CHART_KINDS.map((kind) => (
                                        <button
                                            key={kind}
                                            type="button"
                                            onClick={() => setChartKind(kind)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                                displayCard.chartKind === kind
                                                    ? 'bg-indigo-600 text-white shadow-sm'
                                                    : 'text-gray-600 hover:bg-gray-100'
                                            }`}
                                        >
                                            {t(`dashboard.sql_cards_kind_${kind}`)}
                                        </button>
                                    ))}
                                </div>
                                {showAiChartSuggestion ? (
                                    <p className="text-[10px] text-indigo-600 mt-1">
                                        {t('dashboard.sql_cards_ai_chart_suggestion')}
                                    </p>
                                ) : null}
                                {pieMultiSeries ? (
                                    <p className="text-[10px] text-amber-700 mt-1">
                                        {t('dashboard.sql_cards_pie_multi_hint', {
                                            column: displayCard.valueColumns[0],
                                        })}
                                    </p>
                                ) : null}
                            </div>

                            <div className="rounded-lg border border-white bg-white p-2 shadow-inner min-h-[260px]">
                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                                    {t('dashboard.sql_cards_preview_title')}
                                </p>
                                <SqlAnalyticCardChartBody
                                    chartKind={displayCard.chartKind}
                                    title={displayCard.title}
                                    valueColumns={displayCard.valueColumns}
                                    rows={previewRows}
                                    chartError={previewChartError}
                                    isLoading={previewLoading || generateMutation.isPending}
                                    error={
                                        previewRunQuery.isError
                                            ? previewRunQuery.error instanceof Error
                                                ? previewRunQuery.error.message
                                                : t('dashboard.sql_cards_run_error')
                                            : null
                                    }
                                    emptyLabel={t('dashboard.sql_cards_empty_data')}
                                    loadingLabel={t('dashboard.sql_cards_loading')}
                                    formatValue={formatValue}
                                />
                            </div>

                            <details className="text-xs">
                                <summary className="cursor-pointer text-violet-700 font-medium">
                                    {t('dashboard.sql_cards_view_sql')}
                                </summary>
                                <pre className="mt-2 p-2 bg-white rounded-lg overflow-x-auto text-[10px] leading-relaxed max-h-40 border border-gray-100">
                                    {displayCard.queries.map((q) => `-- ${q.key}\n${q.sql}`).join('\n\n')}
                                </pre>
                            </details>
                        </div>
                    ) : null}

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
                            disabled={!displayCard || (!isEdit && atLimit)}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {isEdit ? t('dashboard.sql_cards_save_changes') : t('dashboard.sql_cards_save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function useSqlAnalyticCardsEmbedded() {
    const { config, updateConfig } = useDashboardConfig();
    const cards = config.sqlAnalyticCards ?? [];
    const [modal, setModal] = useState<{ initial: SqlAnalyticCardDefinition | null } | null>(null);
    const atLimit = cards.length >= MAX_SQL_ANALYTIC_CARDS;

    const handleSave = useCallback(
        (def: SqlAnalyticCardDefinition) => {
            const isEdit = cards.some((c) => c.id === def.id);
            if (isEdit) {
                updateConfig({ sqlAnalyticCards: cards.map((c) => (c.id === def.id ? def : c)) });
            } else {
                if (cards.length >= MAX_SQL_ANALYTIC_CARDS) return;
                updateConfig({ sqlAnalyticCards: [...cards, def] });
            }
        },
        [cards, updateConfig]
    );

    const handleRemove = useCallback(
        (id: string) => {
            updateConfig({ sqlAnalyticCards: cards.filter((c) => c.id !== id) });
        },
        [cards, updateConfig]
    );

    return {
        cards,
        atLimit,
        modal,
        setModal,
        handleSave,
        handleRemove,
    };
}
