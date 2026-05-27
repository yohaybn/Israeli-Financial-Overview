import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
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
    MAX_USER_CHARTS,
    buildCustomChartSeries,
    sanitizeSqlAnalyticCard,
    type SqlAnalyticCardChartKind,
    type SqlAnalyticCardDefinition,
    type Transaction,
    type UserChartDefinition,
} from '@app/shared';
import { api } from '../../lib/api';
import type { UnifiedChartModalState } from '../../hooks/useUnifiedDashboardCharts';
import {
    buildUserChartDefinitionFromForm,
    userChartToFormInput,
    type TransactionChartFormInput,
} from '../../utils/transactionChartForm';
import { TransactionChartFields } from './TransactionChartFields';
import { ANALYTICS_CHART_TOOLTIP_STYLE } from './UserCustomChartsSection';
import {
    fetchSqlCardRun,
    SQL_CHART_KINDS,
    SqlAnalyticCardChartBody,
    useChartFormatters,
} from './SqlAnalyticCardsSection';

type ChartSource = 'transactions' | 'sql';
type BuildMode = 'manual' | 'ai';

const TXN_PIE_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

export interface UnifiedChartModalProps {
    modal: NonNullable<UnifiedChartModalState>;
    onClose: () => void;
    atLimit: boolean;
    categoryOptions: string[];
    defaultSingleMonth?: string;
    followTransactions: Transaction[];
    fullTransactionPool: Transaction[];
    customCCKeywords: string[];
    weekdayLabels: string[];
    onSaveTransaction: (def: UserChartDefinition) => void;
    onSaveSql: (def: SqlAnalyticCardDefinition) => void;
}

function parseValueLabelsText(text: string, columnCount: number): string[] | undefined {
    if (columnCount === 0) return undefined;
    const parts = text.split(/[,;\n]+/).map((s) => s.trim().slice(0, 80));
    while (parts.length < columnCount) parts.push('');
    const labels = parts.slice(0, columnCount);
    return labels.some(Boolean) ? labels : undefined;
}

function sqlDraftFromForm(input: {
    id?: string;
    title: string;
    description: string;
    chartKind: SqlAnalyticCardChartKind;
    dataQueryKey: string;
    labelColumn: string;
    valueColumnsText: string;
    valueLabelsText: string;
    sql: string;
}): { ok: true; value: SqlAnalyticCardDefinition } | { ok: false; error: string } {
    const valueColumns = input.valueColumnsText
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const valueLabels = parseValueLabelsText(input.valueLabelsText, valueColumns.length);
    const card = sanitizeSqlAnalyticCard({
        id: input.id ?? crypto.randomUUID(),
        title: input.title,
        description: input.description || undefined,
        chartKind: input.chartKind,
        dataQueryKey: input.dataQueryKey.trim() || 'main',
        labelColumn: input.labelColumn.trim(),
        valueColumns,
        ...(valueLabels ? { valueLabels } : {}),
        queries: [{ key: input.dataQueryKey.trim() || 'main', sql: input.sql.trim() }],
        createdAt: new Date().toISOString(),
    });
    if (!card.ok) return card;
    return card;
}

export function UnifiedChartModal({
    modal,
    onClose,
    atLimit,
    categoryOptions,
    defaultSingleMonth,
    followTransactions,
    fullTransactionPool,
    customCCKeywords,
    weekdayLabels,
    onSaveTransaction,
    onSaveSql,
}: UnifiedChartModalProps) {
    const { t, i18n } = useTranslation();
    const { formatValue } = useChartFormatters(i18n.language);
    const isEdit = Boolean(modal.initial);

    const [source, setSource] = useState<ChartSource>(modal.source);
    const [buildMode, setBuildMode] = useState<BuildMode>('manual');
    const [aiPrompt, setAiPrompt] = useState('');

    const [txnForm, setTxnForm] = useState<TransactionChartFormInput>(() =>
        modal.source === 'transactions'
            ? userChartToFormInput(modal.initial as UserChartDefinition | null, defaultSingleMonth)
            : userChartToFormInput(null, defaultSingleMonth)
    );

    const initialSql = modal.source === 'sql' ? (modal.initial as SqlAnalyticCardDefinition | null) : null;
    const [sqlDraft, setSqlDraft] = useState<SqlAnalyticCardDefinition | null>(initialSql);
    const [sqlTitle, setSqlTitle] = useState(initialSql?.title ?? '');
    const [sqlDescription, setSqlDescription] = useState(initialSql?.description ?? '');
    const [sqlChartKind, setSqlChartKind] = useState<SqlAnalyticCardChartKind>(initialSql?.chartKind ?? 'bar');
    const [sqlDataQueryKey, setSqlDataQueryKey] = useState(initialSql?.dataQueryKey ?? 'main');
    const [sqlLabelColumn, setSqlLabelColumn] = useState(initialSql?.labelColumn ?? 'label');
    const [sqlValueColumnsText, setSqlValueColumnsText] = useState(
        initialSql?.valueColumns.join(', ') ?? 'total'
    );
    const [sqlValueLabelsText, setSqlValueLabelsText] = useState(
        initialSql?.valueLabels?.join(', ') ?? ''
    );
    const [sqlText, setSqlText] = useState(
        initialSql?.queries.find((q) => q.key === initialSql.dataQueryKey)?.sql ??
            initialSql?.queries[0]?.sql ??
            ''
    );
    const [aiSuggestedSqlKind, setAiSuggestedSqlKind] = useState<SqlAnalyticCardChartKind | null>(null);
    const [sqlPreviewData, setSqlPreviewData] = useState<Awaited<ReturnType<typeof fetchSqlCardRun>> | null>(null);

    useEffect(() => {
        setSource(modal.source);
        if (modal.source === 'transactions') {
            setTxnForm(userChartToFormInput(modal.initial as UserChartDefinition | null, defaultSingleMonth));
            setSqlDraft(null);
        } else {
            const sql = modal.initial as SqlAnalyticCardDefinition | null;
            setSqlDraft(sql);
            setSqlTitle(sql?.title ?? '');
            setSqlDescription(sql?.description ?? '');
            setSqlChartKind(sql?.chartKind ?? 'bar');
            setSqlDataQueryKey(sql?.dataQueryKey ?? 'main');
            setSqlLabelColumn(sql?.labelColumn ?? 'label');
            setSqlValueColumnsText(sql?.valueColumns.join(', ') ?? 'total');
            setSqlValueLabelsText(sql?.valueLabels?.join(', ') ?? '');
            setSqlText(
                sql?.queries.find((q) => q.key === sql.dataQueryKey)?.sql ?? sql?.queries[0]?.sql ?? ''
            );
        }
    }, [modal, defaultSingleMonth]);

    const effectiveSqlCard = useMemo(() => {
        if (sqlDraft) return sqlDraft;
        const built = sqlDraftFromForm({
            id: initialSql?.id,
            title: sqlTitle,
            description: sqlDescription,
            chartKind: sqlChartKind,
            dataQueryKey: sqlDataQueryKey,
            labelColumn: sqlLabelColumn,
            valueColumnsText: sqlValueColumnsText,
            valueLabelsText: sqlValueLabelsText,
            sql: sqlText,
        });
        return built.ok ? built.value : null;
    }, [
        sqlDraft,
        initialSql?.id,
        sqlTitle,
        sqlDescription,
        sqlChartKind,
        sqlDataQueryKey,
        sqlLabelColumn,
        sqlValueColumnsText,
        sqlValueLabelsText,
        sqlText,
    ]);

    const sqlPreviewQuery = useQuery({
        queryKey: [
            'unified-sql-preview',
            effectiveSqlCard?.id,
            effectiveSqlCard?.queries,
            effectiveSqlCard?.chartKind,
        ],
        queryFn: () => fetchSqlCardRun(effectiveSqlCard!),
        enabled: source === 'sql' && Boolean(effectiveSqlCard),
        staleTime: 15_000,
        retry: 0,
    });

    const sqlPreviewRows = sqlPreviewData?.chartRows ?? sqlPreviewQuery.data?.chartRows ?? [];
    const sqlPreviewError = sqlPreviewData?.chartError ?? sqlPreviewQuery.data?.chartError;
    const sqlPreviewLoading = sqlPreviewQuery.isFetching && !sqlPreviewData;

    const txnPreviewDef = useMemo(() => {
        const built = buildUserChartDefinitionFromForm(txnForm);
        return built.ok ? built.value : null;
    }, [txnForm]);

    const txnPreviewSeries = useMemo(() => {
        if (!txnPreviewDef) return { rows: [], isEmpty: true };
        return buildCustomChartSeries(txnPreviewDef, {
            followTransactions,
            fullTransactionPool,
            customCCKeywords,
            weekdayLabels,
        });
    }, [txnPreviewDef, followTransactions, fullTransactionPool, customCCKeywords, weekdayLabels]);

    const txnGenerateMutation = useMutation({
        mutationFn: async () => {
            const built = buildUserChartDefinitionFromForm(txnForm);
            const hints = built.ok ? built.value : undefined;
            const { data } = await api.post<{
                success: boolean;
                data: { chart: UserChartDefinition };
                error?: string;
            }>('/ai/custom-charts/generate', {
                prompt: aiPrompt.trim(),
                locale: i18n.language === 'he' ? 'he' : 'en',
                hints,
            });
            if (!data.success) throw new Error(data.error || 'Generation failed');
            return data.data.chart;
        },
        onSuccess: (chart) => {
            setTxnForm(userChartToFormInput(chart, defaultSingleMonth));
            setBuildMode('manual');
        },
        onError: (e: Error) => window.alert(e.message),
    });

    const sqlGenerateMutation = useMutation({
        mutationFn: async () => {
            const { data } = await api.post<{
                success: boolean;
                data: {
                    card: SqlAnalyticCardDefinition;
                    chartRows: unknown[];
                    chartError?: string;
                };
                error?: string;
            }>('/ai/sql-analytic-cards/generate', {
                prompt: aiPrompt.trim(),
                locale: i18n.language === 'he' ? 'he' : 'en',
            });
            if (!data.success) throw new Error(data.error || 'Generation failed');
            return data.data;
        },
        onSuccess: (d) => {
            setSqlDraft(d.card);
            setSqlTitle(d.card.title);
            setSqlDescription(d.card.description ?? '');
            setSqlChartKind(d.card.chartKind);
            setAiSuggestedSqlKind(d.card.chartKind);
            setSqlDataQueryKey(d.card.dataQueryKey);
            setSqlLabelColumn(d.card.labelColumn);
            setSqlValueColumnsText(d.card.valueColumns.join(', '));
            setSqlValueLabelsText(d.card.valueLabels?.join(', ') ?? '');
            setSqlText(d.card.queries.find((q) => q.key === d.card.dataQueryKey)?.sql ?? d.card.queries[0]?.sql ?? '');
            setSqlPreviewData({
                chartRows: d.chartRows as Awaited<ReturnType<typeof fetchSqlCardRun>>['chartRows'],
                chartError: d.chartError,
                queryResults: {},
            });
            setBuildMode('manual');
        },
        onError: (e: Error) => window.alert(e.message),
    });

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!isEdit && atLimit) {
            window.alert(t('dashboard.unified_chart_limit', { max: MAX_USER_CHARTS }));
            return;
        }

        if (source === 'transactions') {
            const built = buildUserChartDefinitionFromForm(txnForm);
            if (!built.ok) {
                window.alert(t(built.errorKey, built.errorParams));
                return;
            }
            onSaveTransaction(built.value);
            onClose();
            return;
        }

        if (!sqlText.trim()) {
            window.alert(t('dashboard.unified_chart_sql_required'));
            return;
        }
        const built = sqlDraftFromForm({
            id: sqlDraft?.id ?? initialSql?.id,
            title: sqlTitle,
            description: sqlDescription,
            chartKind: sqlChartKind,
            dataQueryKey: sqlDataQueryKey,
            labelColumn: sqlLabelColumn,
            valueColumnsText: sqlValueColumnsText,
            valueLabelsText: sqlValueLabelsText,
            sql: sqlText,
        });
        if (!built.ok) {
            window.alert(built.error);
            return;
        }
        const card = built.value;
        try {
            const run = await fetchSqlCardRun(card);
            if (run.chartError && !run.chartRows.length) {
                window.alert(run.chartError);
                return;
            }
        } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err));
            return;
        }
        onSaveSql(card);
        onClose();
    };

    const syncSqlDraftFromFields = () => {
        const built = sqlDraftFromForm({
            id: sqlDraft?.id ?? initialSql?.id,
            title: sqlTitle,
            description: sqlDescription,
            chartKind: sqlChartKind,
            dataQueryKey: sqlDataQueryKey,
            labelColumn: sqlLabelColumn,
            valueColumnsText: sqlValueColumnsText,
            valueLabelsText: sqlValueLabelsText,
            sql: sqlText,
        });
        if (built.ok) setSqlDraft(built.value);
    };

    const titleValue = source === 'transactions' ? txnForm.title : sqlTitle;
    const setTitleValue = (v: string) => {
        if (source === 'transactions') setTxnForm((f) => ({ ...f, title: v }));
        else setSqlTitle(v);
    };

    const txnChartKind =
        txnPreviewDef?.chartKind === 'pie' && txnPreviewDef.measure === 'net'
            ? 'bar'
            : (txnPreviewDef?.chartKind ?? 'bar');

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-gray-100">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-bold text-gray-900">
                        {isEdit ? t('dashboard.unified_chart_edit_title') : t('dashboard.unified_chart_add_title')}
                    </h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg">
                        <span className="sr-only">{t('common.close')}</span>
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {!isEdit && atLimit && (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            {t('dashboard.unified_chart_limit', { max: MAX_USER_CHARTS })}
                        </p>
                    )}

                    {!isEdit && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-700">{t('dashboard.unified_chart_source')}</p>
                            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setSource('transactions')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                                        source === 'transactions' ? 'bg-white shadow text-violet-800' : 'text-gray-600'
                                    }`}
                                >
                                    {t('dashboard.unified_chart_source_transactions')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSource('sql')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                                        source === 'sql' ? 'bg-white shadow text-indigo-800' : 'text-gray-600'
                                    }`}
                                >
                                    {t('dashboard.unified_chart_source_sql')}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-700">{t('dashboard.unified_chart_build_mode')}</p>
                        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                            <button
                                type="button"
                                onClick={() => setBuildMode('manual')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                                    buildMode === 'manual' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                                }`}
                            >
                                {t('dashboard.unified_chart_mode_manual')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setBuildMode('ai')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                                    buildMode === 'ai' ? 'bg-white shadow text-indigo-800' : 'text-gray-600'
                                }`}
                            >
                                {t('dashboard.unified_chart_mode_ai')}
                            </button>
                        </div>
                    </div>

                    {buildMode === 'ai' && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-2">
                            <label className="block text-xs font-semibold text-indigo-900">
                                {t('dashboard.unified_chart_ai_prompt')}
                            </label>
                            <textarea
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-indigo-200 px-3 py-2 text-sm"
                                placeholder={
                                    source === 'sql'
                                        ? t('dashboard.sql_cards_ai_prompt_placeholder')
                                        : t('dashboard.unified_chart_ai_prompt_placeholder_txn')
                                }
                            />
                            <button
                                type="button"
                                disabled={
                                    !aiPrompt.trim() ||
                                    (source === 'transactions'
                                        ? txnGenerateMutation.isPending
                                        : sqlGenerateMutation.isPending)
                                }
                                onClick={() =>
                                    source === 'transactions'
                                        ? txnGenerateMutation.mutate()
                                        : sqlGenerateMutation.mutate()
                                }
                                className="w-full py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {source === 'transactions'
                                    ? txnGenerateMutation.isPending
                                        ? t('dashboard.sql_cards_generating')
                                        : t('dashboard.unified_chart_ai_generate_txn')
                                    : sqlGenerateMutation.isPending
                                      ? t('dashboard.sql_cards_generating')
                                      : t('dashboard.sql_cards_generate')}
                            </button>
                            {source === 'transactions' && (
                                <p className="text-[10px] text-indigo-700">{t('dashboard.unified_chart_ai_hints_txn')}</p>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                            {t('dashboard.custom_charts_field_title')}
                        </label>
                        <input
                            type="text"
                            value={titleValue}
                            onChange={(e) => setTitleValue(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            maxLength={120}
                        />
                    </div>

                    {source === 'transactions' && (
                        <TransactionChartFields form={txnForm} onChange={setTxnForm} categoryOptions={categoryOptions} />
                    )}

                    {source === 'sql' && (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">
                                    {t('dashboard.unified_chart_sql_description')}
                                </label>
                                <input
                                    type="text"
                                    value={sqlDescription}
                                    onChange={(e) => {
                                        setSqlDescription(e.target.value);
                                        setSqlDraft(null);
                                    }}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    maxLength={400}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                    {t('dashboard.sql_cards_chart_type_label')}
                                </label>
                                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                                    {SQL_CHART_KINDS.map((kind) => (
                                        <button
                                            key={kind}
                                            type="button"
                                            onClick={() => {
                                                setSqlChartKind(kind);
                                                setSqlDraft(null);
                                            }}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                                                sqlChartKind === kind
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'text-gray-600 hover:bg-gray-100'
                                            }`}
                                        >
                                            {t(`dashboard.sql_cards_kind_${kind}`)}
                                        </button>
                                    ))}
                                </div>
                                {aiSuggestedSqlKind != null && sqlChartKind === aiSuggestedSqlKind && (
                                    <p className="text-[10px] text-indigo-600 mt-1">
                                        {t('dashboard.sql_cards_ai_chart_suggestion')}
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                        {t('dashboard.unified_chart_label_column')}
                                    </label>
                                    <input
                                        value={sqlLabelColumn}
                                        onChange={(e) => {
                                            setSqlLabelColumn(e.target.value);
                                            setSqlDraft(null);
                                        }}
                                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                        {t('dashboard.unified_chart_value_columns')}
                                    </label>
                                    <input
                                        value={sqlValueColumnsText}
                                        onChange={(e) => {
                                            setSqlValueColumnsText(e.target.value);
                                            setSqlDraft(null);
                                        }}
                                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                                        placeholder="total, count"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                    {t('dashboard.unified_chart_value_labels')}
                                </label>
                                <input
                                    value={sqlValueLabelsText}
                                    onChange={(e) => {
                                        setSqlValueLabelsText(e.target.value);
                                        setSqlDraft(null);
                                    }}
                                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                                    placeholder={t('dashboard.unified_chart_value_labels_placeholder')}
                                />
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                    {t('dashboard.unified_chart_value_labels_hint')}
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">
                                    {t('dashboard.unified_chart_sql_query')}
                                </label>
                                <textarea
                                    value={sqlText}
                                    onChange={(e) => {
                                        setSqlText(e.target.value);
                                        setSqlDraft(null);
                                    }}
                                    rows={6}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono"
                                    placeholder="SELECT category AS label, SUM(ABS(amount)) AS total FROM transactions WHERE ..."
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    syncSqlDraftFromFields();
                                    setSqlPreviewData(null);
                                    void sqlPreviewQuery.refetch();
                                }}
                                className="text-xs font-medium text-violet-700 hover:underline"
                            >
                                {t('dashboard.unified_chart_refresh_preview')}
                            </button>
                        </div>
                    )}

                    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            {t('dashboard.sql_cards_preview_title')}
                        </p>
                        {source === 'transactions' ? (
                            <TransactionChartPreview
                                rows={txnPreviewSeries.rows.map((r) => ({ label: r.name, value: r.value }))}
                                isEmpty={txnPreviewSeries.isEmpty}
                                chartKind={txnChartKind}
                                measure={txnPreviewDef?.measure ?? 'sum_expense'}
                                seriesLabel={txnForm.seriesLabel.trim() || t('dashboard.custom_charts_value')}
                                formatValue={formatValue}
                                emptyLabel={t('dashboard.custom_charts_empty_data')}
                            />
                        ) : (
                            <SqlAnalyticCardChartBody
                                chartKind={sqlChartKind}
                                title={sqlTitle || t('dashboard.sql_cards_preview_title')}
                                valueColumns={
                                    effectiveSqlCard?.valueColumns ??
                                    sqlValueColumnsText.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
                                }
                                valueLabels={
                                    effectiveSqlCard?.valueLabels ??
                                    parseValueLabelsText(
                                        sqlValueLabelsText,
                                        sqlValueColumnsText.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
                                            .length
                                    )
                                }
                                rows={sqlPreviewRows}
                                chartError={sqlPreviewError}
                                isLoading={sqlPreviewLoading}
                                error={
                                    sqlPreviewQuery.isError
                                        ? sqlPreviewQuery.error instanceof Error
                                            ? sqlPreviewQuery.error.message
                                            : t('dashboard.sql_cards_run_error')
                                        : null
                                }
                                emptyLabel={t('dashboard.sql_cards_empty_data')}
                                loadingLabel={t('dashboard.sql_cards_loading')}
                                formatValue={formatValue}
                            />
                        )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={!titleValue.trim() || (!isEdit && atLimit)}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {isEdit ? t('dashboard.custom_charts_save_changes') : t('dashboard.custom_charts_save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function TransactionChartPreview({
    rows,
    isEmpty,
    chartKind,
    measure,
    seriesLabel,
    formatValue,
    emptyLabel,
}: {
    rows: { label: string; value: number }[];
    isEmpty: boolean;
    chartKind: 'bar' | 'line' | 'pie';
    measure: string;
    seriesLabel: string;
    formatValue: (v: number) => string;
    emptyLabel: string;
}) {
    if (isEmpty || rows.length === 0) {
        return (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-400">{emptyLabel}</div>
        );
    }
    const formatV = (v: number) => (measure === 'count' ? String(Math.round(v)) : formatValue(v));

    if (chartKind === 'pie') {
        return (
            <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                    <Pie data={rows} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={80}>
                        {rows.map((_, i) => (
                            <Cell key={i} fill={TXN_PIE_COLORS[i % TXN_PIE_COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={ANALYTICS_CHART_TOOLTIP_STYLE}
                        formatter={(v) => [formatV(Number(v ?? 0)), seriesLabel]}
                    />
                </PieChart>
            </ResponsiveContainer>
        );
    }
    if (chartKind === 'line') {
        return (
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatV(Number(v))} width={60} />
                    <Tooltip
                        contentStyle={ANALYTICS_CHART_TOOLTIP_STYLE}
                        formatter={(v) => [formatV(Number(v ?? 0)), seriesLabel]}
                    />
                    <Line
                        type="monotone"
                        dataKey="value"
                        name={seriesLabel}
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        );
    }
    return (
        <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatV(Number(v))} width={60} />
                <Tooltip
                    contentStyle={ANALYTICS_CHART_TOOLTIP_STYLE}
                    formatter={(v) => [formatV(Number(v ?? 0)), seriesLabel]}
                />
                <Bar dataKey="value" name={seriesLabel} fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
