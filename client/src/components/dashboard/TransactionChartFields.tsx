import { useTranslation } from 'react-i18next';
import {
    MAX_USER_CHART_FILTER_CLAUSES,
    USER_CHART_LAST_N_DAYS_MAX,
    USER_CHART_LAST_N_MONTHS_MAX,
    type UserChartDataScope,
    type UserChartFilterClause,
    type UserChartGroupBy,
    type UserChartKind,
    type UserChartMeasure,
} from '@app/shared';
import {
    newFilterClause,
    withFilterKind,
    type TransactionChartFormInput,
} from '../../utils/transactionChartForm';

interface TransactionChartFieldsProps {
    form: TransactionChartFormInput;
    onChange: (next: TransactionChartFormInput) => void;
    categoryOptions: string[];
}

export function TransactionChartFields({ form, onChange, categoryOptions }: TransactionChartFieldsProps) {
    const { t } = useTranslation();
    const patch = (partial: Partial<TransactionChartFormInput>) => onChange({ ...form, ...partial });

    const pieAllowed = form.measure !== 'net';
    const effectiveKind: UserChartKind = form.chartKind === 'pie' && !pieAllowed ? 'bar' : form.chartKind;

    return (
        <>
            <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">{t('dashboard.custom_charts_data_scope_title')}</p>
                <p className="text-[10px] text-gray-500 leading-snug">{t('dashboard.custom_charts_data_scope_hint')}</p>
                <div>
                    <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                        {t('dashboard.custom_charts_field_scope')}
                    </label>
                    <select
                        value={form.dataScope}
                        onChange={(e) => patch({ dataScope: e.target.value as UserChartDataScope })}
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
                {form.dataScope === 'single_month' && (
                    <div className="pt-1">
                        <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                            {t('dashboard.custom_charts_field_single_month')}
                        </label>
                        <input
                            type="month"
                            value={form.singleMonth}
                            onChange={(e) => patch({ singleMonth: e.target.value })}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white"
                        />
                    </div>
                )}
                {(form.dataScope === 'last_n_days' || form.dataScope === 'last_n_months') && (
                    <div className="pt-1">
                        <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                            {form.dataScope === 'last_n_days'
                                ? t('dashboard.custom_charts_field_last_n_days')
                                : t('dashboard.custom_charts_field_last_n_months')}
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={form.dataScope === 'last_n_days' ? USER_CHART_LAST_N_DAYS_MAX : USER_CHART_LAST_N_MONTHS_MAX}
                            value={form.lastN}
                            onChange={(e) => patch({ lastN: Number(e.target.value) || 1 })}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                        />
                    </div>
                )}
                {form.dataScope === 'custom_range' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                {t('dashboard.custom_charts_custom_from')}
                            </label>
                            <input
                                type="date"
                                value={form.customDateFrom}
                                onChange={(e) => patch({ customDateFrom: e.target.value })}
                                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                                {t('dashboard.custom_charts_custom_to')}
                            </label>
                            <input
                                type="date"
                                value={form.customDateTo}
                                onChange={(e) => patch({ customDateTo: e.target.value })}
                                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                            />
                        </div>
                    </div>
                )}
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {t('dashboard.unified_chart_series_label')}
                </label>
                <input
                    type="text"
                    value={form.seriesLabel}
                    onChange={(e) => patch({ seriesLabel: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    placeholder={t('dashboard.unified_chart_series_label_placeholder')}
                    maxLength={80}
                />
                <p className="text-[10px] text-gray-500 mt-0.5">{t('dashboard.unified_chart_series_label_hint')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                        {t('dashboard.custom_charts_field_chart_type')}
                    </label>
                    <select
                        value={effectiveKind}
                        onChange={(e) => patch({ chartKind: e.target.value as UserChartKind })}
                        className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                    >
                        <option value="bar">{t('dashboard.custom_charts_type_bar')}</option>
                        <option value="line">{t('dashboard.custom_charts_type_line')}</option>
                        <option value="pie" disabled={!pieAllowed}>
                            {t('dashboard.custom_charts_type_pie')}
                        </option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                        {t('dashboard.custom_charts_field_measure')}
                    </label>
                    <select
                        value={form.measure}
                        onChange={(e) => {
                            const m = e.target.value as UserChartMeasure;
                            patch({
                                measure: m,
                                chartKind: m === 'net' && form.chartKind === 'pie' ? 'bar' : form.chartKind,
                            });
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
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {t('dashboard.custom_charts_field_group_by')}
                </label>
                <select
                    value={form.groupBy}
                    onChange={(e) => patch({ groupBy: e.target.value as UserChartGroupBy })}
                    className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                >
                    <option value="month">{t('dashboard.custom_charts_group_month')}</option>
                    <option value="category">{t('dashboard.custom_charts_group_category')}</option>
                    <option value="weekday">{t('dashboard.custom_charts_group_weekday')}</option>
                    <option value="merchant">{t('dashboard.custom_charts_group_merchant')}</option>
                </select>
            </div>
            {form.groupBy === 'merchant' && (
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                        {t('dashboard.custom_charts_field_top_n')}
                    </label>
                    <input
                        type="number"
                        min={1}
                        max={25}
                        value={form.merchantTopN}
                        onChange={(e) => patch({ merchantTopN: Number(e.target.value) || 10 })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                </div>
            )}
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">{t('dashboard.custom_charts_filters_title')}</p>
                <p className="text-[10px] text-gray-500 leading-snug">{t('dashboard.custom_charts_filters_scope_hint')}</p>
                {form.filters.map((f) => (
                    <FilterRow
                        key={f.id}
                        f={f}
                        categoryOptions={categoryOptions}
                        onUpdate={(filters) => patch({ filters })}
                        filters={form.filters}
                    />
                ))}
                {form.filters.length < MAX_USER_CHART_FILTER_CLAUSES && (
                    <button
                        type="button"
                        onClick={() => patch({ filters: [...form.filters, newFilterClause('description_contains')] })}
                        className="text-xs font-semibold text-violet-700 hover:text-violet-900"
                    >
                        + {t('dashboard.custom_charts_filter_add')}
                    </button>
                )}
            </div>
        </>
    );
}

function FilterRow({
    f,
    filters,
    onUpdate,
    categoryOptions,
}: {
    f: UserChartFilterClause;
    filters: UserChartFilterClause[];
    onUpdate: (filters: UserChartFilterClause[]) => void;
    categoryOptions: string[];
}) {
    const { t } = useTranslation();
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <select
                    value={f.kind}
                    onChange={(e) =>
                        onUpdate(withFilterKind(f.id, e.target.value as UserChartFilterClause['kind'], filters))
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
                    onClick={() => onUpdate(filters.filter((x) => x.id !== f.id))}
                    className="text-xs text-red-600 hover:underline shrink-0"
                >
                    {t('dashboard.custom_charts_filter_remove')}
                </button>
            </div>
            {(f.kind === 'category_in' || f.kind === 'category_not_in') && (
                <textarea
                    value={f.categories.join(', ')}
                    onChange={(e) => {
                        const cats = e.target.value
                            .split(/[,;\n]+/)
                            .map((x) => x.trim())
                            .filter(Boolean);
                        onUpdate(
                            filters.map((x) =>
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
            )}
            {(f.kind === 'description_contains' || f.kind === 'description_not_contains') && (
                <input
                    type="text"
                    value={f.text}
                    onChange={(e) =>
                        onUpdate(
                            filters.map((x) =>
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
                        onUpdate(
                            filters.map((x) =>
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
            {categoryOptions.length > 0 && (f.kind === 'category_in' || f.kind === 'category_not_in') ? (
                <p className="text-[10px] text-gray-500">{t('dashboard.custom_charts_filter_categories_hint')}</p>
            ) : null}
        </div>
    );
}
