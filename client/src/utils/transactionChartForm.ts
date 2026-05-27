import {
    MAX_USER_CHART_FILTER_CLAUSES,
    USER_CHART_LAST_N_DAYS_MAX,
    USER_CHART_LAST_N_MONTHS_MAX,
    expenseCategoryKey,
    type UserChartDataScope,
    type UserChartDefinition,
    type UserChartFilterClause,
    type UserChartGroupBy,
    type UserChartKind,
    type UserChartMeasure,
} from '@app/shared';

export function newFilterClause(kind: UserChartFilterClause['kind'], existingId?: string): UserChartFilterClause {
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

export function withFilterKind(
    id: string,
    kind: UserChartFilterClause['kind'],
    prev: UserChartFilterClause[]
): UserChartFilterClause[] {
    return prev.map((f) => (f.id === id ? newFilterClause(kind, id) : f));
}

export function sanitizeChartFilters(rows: UserChartFilterClause[]): UserChartFilterClause[] {
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

export interface TransactionChartFormInput {
    id?: string;
    title: string;
    chartKind: UserChartKind;
    groupBy: UserChartGroupBy;
    measure: UserChartMeasure;
    merchantTopN: number;
    dataScope: UserChartDataScope;
    singleMonth: string;
    lastN: number;
    customDateFrom: string;
    customDateTo: string;
    filters: UserChartFilterClause[];
    /** Legend / tooltip series name. */
    seriesLabel: string;
}

export function buildUserChartDefinitionFromForm(
    input: TransactionChartFormInput
): { ok: true; value: UserChartDefinition } | { ok: false; errorKey: string; errorParams?: Record<string, number> } {
    const trimmed = input.title.trim();
    if (!trimmed) {
        return { ok: false, errorKey: 'dashboard.unified_chart_title_required' };
    }
    if (input.dataScope === 'custom_range') {
        if (!input.customDateFrom || !input.customDateTo || input.customDateFrom > input.customDateTo) {
            return { ok: false, errorKey: 'dashboard.custom_charts_custom_range_invalid' };
        }
    }
    if (input.dataScope === 'single_month') {
        const ym = input.singleMonth.trim();
        if (!/^\d{4}-\d{2}$/.test(ym)) {
            return { ok: false, errorKey: 'dashboard.custom_charts_single_month_invalid' };
        }
    }
    if (input.dataScope === 'last_n_days') {
        const n = Math.floor(Number(input.lastN));
        if (!Number.isFinite(n) || n < 1 || n > USER_CHART_LAST_N_DAYS_MAX) {
            return { ok: false, errorKey: 'dashboard.custom_charts_last_n_days_invalid', errorParams: { max: USER_CHART_LAST_N_DAYS_MAX } };
        }
    }
    if (input.dataScope === 'last_n_months') {
        const n = Math.floor(Number(input.lastN));
        if (!Number.isFinite(n) || n < 1 || n > USER_CHART_LAST_N_MONTHS_MAX) {
            return { ok: false, errorKey: 'dashboard.custom_charts_last_n_months_invalid', errorParams: { max: USER_CHART_LAST_N_MONTHS_MAX } };
        }
    }

    const pieAllowed = input.measure !== 'net';
    const effectiveKind: UserChartKind =
        input.chartKind === 'pie' && !pieAllowed ? 'bar' : input.chartKind;
    const id = input.id ?? crypto.randomUUID();
    const cleanFilters = sanitizeChartFilters(input.filters);
    const seriesLabelRaw = input.seriesLabel.trim();
    const base: UserChartDefinition = {
        id,
        title: trimmed,
        chartKind: input.measure === 'net' && input.chartKind === 'pie' ? 'bar' : effectiveKind,
        groupBy: input.groupBy,
        measure: input.measure,
        merchantTopN:
            input.groupBy === 'merchant' ? Math.min(25, Math.max(1, input.merchantTopN)) : undefined,
        filters: cleanFilters.length > 0 ? cleanFilters : undefined,
        ...(seriesLabelRaw ? { seriesLabel: seriesLabelRaw.slice(0, 80) } : {}),
    };

    switch (input.dataScope) {
        case 'follow_analytics':
            return { ok: true, value: base };
        case 'all_time':
            return { ok: true, value: { ...base, dataScope: 'all_time' } };
        case 'single_month':
            return {
                ok: true,
                value: { ...base, dataScope: 'single_month', singleMonth: input.singleMonth.trim() },
            };
        case 'last_n_days': {
            const n = Math.min(USER_CHART_LAST_N_DAYS_MAX, Math.max(1, Math.floor(Number(input.lastN))));
            return { ok: true, value: { ...base, dataScope: 'last_n_days', lastN: n } };
        }
        case 'last_n_months': {
            const n = Math.min(USER_CHART_LAST_N_MONTHS_MAX, Math.max(1, Math.floor(Number(input.lastN))));
            return { ok: true, value: { ...base, dataScope: 'last_n_months', lastN: n } };
        }
        case 'custom_range':
            return {
                ok: true,
                value: {
                    ...base,
                    dataScope: 'custom_range',
                    customDateFrom: input.customDateFrom,
                    customDateTo: input.customDateTo,
                },
            };
        default:
            return { ok: true, value: base };
    }
}

export function userChartToFormInput(initial: UserChartDefinition | null, defaultSingleMonth?: string): TransactionChartFormInput {
    return {
        id: initial?.id,
        title: initial?.title ?? '',
        chartKind: initial?.chartKind ?? 'bar',
        groupBy: initial?.groupBy ?? 'category',
        measure: initial?.measure ?? 'sum_expense',
        merchantTopN: initial?.merchantTopN ?? 10,
        dataScope: initial?.dataScope ?? 'follow_analytics',
        singleMonth: initial?.singleMonth ?? defaultSingleMonth ?? '',
        lastN:
            initial?.lastN != null && Number.isFinite(initial.lastN)
                ? initial.lastN
                : initial?.dataScope === 'last_n_months'
                  ? 3
                  : 30,
        customDateFrom: initial?.customDateFrom ?? '',
        customDateTo: initial?.customDateTo ?? '',
        filters: (initial?.filters ?? []).map((c) => ({
            ...c,
            id: 'id' in c && typeof (c as { id?: string }).id === 'string' ? (c as { id: string }).id : crypto.randomUUID(),
        })),
        seriesLabel: initial?.seriesLabel ?? '',
    };
}
