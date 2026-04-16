import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAISettings } from '../../hooks/useScraper';
import type {
    BuilderCombineMode,
    BuilderConditionRow,
    BuilderState,
    BuilderTxnMatch,
} from '@app/shared';

function newRow(kind: BuilderConditionRow['rowType']): BuilderConditionRow {
    switch (kind) {
        case 'sum_expenses':
            return { rowType: 'sum_expenses', op: 'gte', amount: 1000, category: '' };
        case 'txn_count':
            return { rowType: 'txn_count', min: 1, category: '' };
        case 'sum_expenses_between':
            return { rowType: 'sum_expenses_between', minAmount: 500, maxAmount: 2000, category: '' };
        case 'txn_count_between':
            return { rowType: 'txn_count_between', min: 2, max: 20, category: '' };
        case 'sum_income':
            return { rowType: 'sum_income', op: 'gte', amount: 1000, category: '' };
        case 'max_single_expense':
            return { rowType: 'max_single_expense', amount: 500, category: '' };
        case 'net_savings_lte':
            return { rowType: 'net_savings_lte', amount: 0 };
        case 'share_of_category':
            return { rowType: 'share_of_category', category: 'מזון', minSharePercent: 35 };
        case 'txn_exists':
            return { rowType: 'txn_exists', match: { op: 'isExpense' } };
    }
}

const ADD_CONDITION_KINDS: BuilderConditionRow['rowType'][] = [
    'sum_expenses',
    'sum_expenses_between',
    'txn_count',
    'txn_count_between',
    'sum_income',
    'max_single_expense',
    'net_savings_lte',
    'share_of_category',
    'txn_exists',
];

type CategorySelectVariant = 'optionalAll' | 'uncategorizedPlus' | 'required';

/**
 * Same category list as transaction “change category”: AI settings categories (+ current value if not listed).
 */
function CategorySelectField({
    variant,
    value,
    onChange,
    disabled,
    categoryOptions,
}: {
    variant: CategorySelectVariant;
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    categoryOptions: string[];
}) {
    const { t } = useTranslation();
    const sorted = useMemo(
        () =>
            [...categoryOptions]
                .filter((c) => typeof c === 'string' && c.trim())
                .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        [categoryOptions]
    );
    const showOrphan = Boolean(value) && !sorted.includes(value);

    return (
        <select
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
        >
            {variant === 'optionalAll' && <option value="">{t('insight_rules.all_categories')}</option>}
            {variant === 'uncategorizedPlus' && <option value="">{t('table.uncategorized')}</option>}
            {variant === 'required' && !value && (
                <option value="" disabled>
                    {t('insight_rules.category_pick')}
                </option>
            )}
            {sorted.map((c) => (
                <option key={c} value={c}>
                    {c}
                </option>
            ))}
            {showOrphan && (
                <option value={value}>
                    {value} ({t('insight_rules.category_not_in_list')})
                </option>
            )}
        </select>
    );
}

function TxnMatchFields({
    match,
    onChange,
    disabled,
    categoryOptions,
}: {
    match: BuilderTxnMatch;
    onChange: (m: BuilderTxnMatch) => void;
    disabled?: boolean;
    categoryOptions: string[];
}) {
    const { t } = useTranslation();
    const op = match.op;

    return (
        <div className="flex flex-col gap-2 ms-2 border-s-2 border-indigo-100 ps-3">
            <label className="text-xs font-medium text-gray-600">{t('insight_rules.if_txn_match_type')}</label>
            <select
                value={op}
                disabled={disabled}
                onChange={(e) => {
                    const next = e.target.value as BuilderTxnMatch['op'];
                    switch (next) {
                        case 'categoryEquals':
                            onChange({ op: 'categoryEquals', value: '' });
                            break;
                        case 'memoOrDescriptionContains':
                            onChange({ op: 'memoOrDescriptionContains', value: '' });
                            break;
                        case 'accountEquals':
                            onChange({ op: 'accountEquals', value: '' });
                            break;
                        case 'amountAbsGte':
                            onChange({ op: 'amountAbsGte', value: 0 });
                            break;
                        case 'amountAbsLte':
                            onChange({ op: 'amountAbsLte', value: 0 });
                            break;
                        case 'amountAbsBetween':
                            onChange({ op: 'amountAbsBetween', min: 0, max: 1000 });
                            break;
                        case 'dayOfWeekIn':
                            onChange({ op: 'dayOfWeekIn', days: [5, 6] });
                            break;
                        case 'isExpense':
                            onChange({ op: 'isExpense' });
                            break;
                        case 'isIncome':
                            onChange({ op: 'isIncome' });
                            break;
                        case 'ignored':
                            onChange({ op: 'ignored', value: false });
                            break;
                    }
                }}
                className="rounded-lg border border-gray-200 p-2 text-sm"
            >
                <option value="categoryEquals">{t('insight_rules.match_category')}</option>
                <option value="memoOrDescriptionContains">{t('insight_rules.match_memo')}</option>
                <option value="accountEquals">{t('insight_rules.match_account')}</option>
                <option value="amountAbsGte">{t('insight_rules.match_amount_gte')}</option>
                <option value="amountAbsLte">{t('insight_rules.match_amount_lte')}</option>
                <option value="amountAbsBetween">{t('insight_rules.match_amount_between')}</option>
                <option value="dayOfWeekIn">{t('insight_rules.match_day_of_week')}</option>
                <option value="isExpense">{t('insight_rules.match_is_expense')}</option>
                <option value="isIncome">{t('insight_rules.match_is_income')}</option>
                <option value="ignored">{t('insight_rules.match_ignored')}</option>
            </select>
            {op === 'categoryEquals' && (
                <div>
                    <label className="text-xs font-medium text-gray-600">{t('insight_rules.match_category')}</label>
                    <CategorySelectField
                        variant="uncategorizedPlus"
                        disabled={disabled}
                        categoryOptions={categoryOptions}
                        value={match.op === 'categoryEquals' ? match.value : ''}
                        onChange={(v) => onChange({ op: 'categoryEquals', value: v })}
                    />
                </div>
            )}
            {(op === 'memoOrDescriptionContains' || op === 'accountEquals') && (
                <input
                    type="text"
                    disabled={disabled}
                    value={'value' in match ? match.value : ''}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (op === 'memoOrDescriptionContains') onChange({ op: 'memoOrDescriptionContains', value: v });
                        else onChange({ op: 'accountEquals', value: v });
                    }}
                    className="rounded-lg border border-gray-200 p-2 text-sm"
                    placeholder={t('insight_rules.value_placeholder')}
                />
            )}
            {(op === 'amountAbsGte' || op === 'amountAbsLte') && (
                <input
                    type="number"
                    min={0}
                    step={0.01}
                    disabled={disabled}
                    value={'value' in match ? match.value : 0}
                    onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (op === 'amountAbsGte') onChange({ op: 'amountAbsGte', value: Number.isFinite(n) ? n : 0 });
                        else onChange({ op: 'amountAbsLte', value: Number.isFinite(n) ? n : 0 });
                    }}
                    className="rounded-lg border border-gray-200 p-2 text-sm"
                />
            )}
            {op === 'amountAbsBetween' && (
                <div className="flex flex-wrap gap-2 items-center">
                    <input
                        type="number"
                        min={0}
                        step={0.01}
                        disabled={disabled}
                        value={match.op === 'amountAbsBetween' ? match.min : 0}
                        onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            const min = Number.isFinite(n) ? n : 0;
                            const max = match.op === 'amountAbsBetween' ? Math.max(min, match.max) : min;
                            onChange({ op: 'amountAbsBetween', min, max });
                        }}
                        className="rounded-lg border border-gray-200 p-2 text-sm w-28"
                    />
                    <span className="text-xs text-gray-500">—</span>
                    <input
                        type="number"
                        min={0}
                        step={0.01}
                        disabled={disabled}
                        value={match.op === 'amountAbsBetween' ? match.max : 0}
                        onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            const max = Number.isFinite(n) ? n : 0;
                            const min = match.op === 'amountAbsBetween' ? Math.min(match.min, max) : 0;
                            onChange({ op: 'amountAbsBetween', min, max });
                        }}
                        className="rounded-lg border border-gray-200 p-2 text-sm w-28"
                    />
                </div>
            )}
            {op === 'dayOfWeekIn' && match.op === 'dayOfWeekIn' && (
                <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                        <label key={d} className="flex items-center gap-1 text-xs text-gray-700">
                            <input
                                type="checkbox"
                                disabled={disabled}
                                checked={match.days.includes(d)}
                                onChange={(e) => {
                                    const next = e.target.checked
                                        ? [...match.days, d]
                                        : match.days.filter((x) => x !== d);
                                    onChange({ op: 'dayOfWeekIn', days: next.length ? next : [d] });
                                }}
                            />
                            {t(`insight_rules.dow_${d}` as const)}
                        </label>
                    ))}
                </div>
            )}
            {op === 'ignored' && (
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        disabled={disabled}
                        checked={match.op === 'ignored' ? match.value : false}
                        onChange={(e) => onChange({ op: 'ignored', value: e.target.checked })}
                    />
                    {t('insight_rules.match_ignored_yes')}
                </label>
            )}
        </div>
    );
}

function ConditionRowEditor({
    row,
    index,
    onChange,
    onRemove,
    disabled,
    categoryOptions,
}: {
    row: BuilderConditionRow;
    index: number;
    onChange: (row: BuilderConditionRow) => void;
    onRemove: () => void;
    disabled?: boolean;
    categoryOptions: string[];
}) {
    const { t } = useTranslation();

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-700 uppercase">{t('insight_rules.if_row_label', { n: index + 1 })}</span>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={onRemove}
                    className="text-xs text-red-600 hover:underline"
                >
                    {t('common.remove')}
                </button>
            </div>
            <div>
                <label className="text-xs text-gray-500">{t('insight_rules.if_parameter')}</label>
                <select
                    value={row.rowType}
                    disabled={disabled}
                    onChange={(e) => onChange(newRow(e.target.value as BuilderConditionRow['rowType']))}
                    className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                >
                    <option value="sum_expenses">{t('insight_rules.param_sum_expenses')}</option>
                    <option value="sum_expenses_between">{t('insight_rules.param_sum_expenses_between')}</option>
                    <option value="txn_count">{t('insight_rules.param_txn_count')}</option>
                    <option value="txn_count_between">{t('insight_rules.param_txn_count_between')}</option>
                    <option value="sum_income">{t('insight_rules.param_sum_income')}</option>
                    <option value="max_single_expense">{t('insight_rules.param_max_single_expense')}</option>
                    <option value="net_savings_lte">{t('insight_rules.param_net_savings_lte')}</option>
                    <option value="share_of_category">{t('insight_rules.param_share_of_category')}</option>
                    <option value="txn_exists">{t('insight_rules.param_txn_exists')}</option>
                </select>
            </div>
            {row.rowType === 'sum_expenses' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.op')}</label>
                        <select
                            value={row.op}
                            disabled={disabled}
                            onChange={(e) => onChange({ ...row, op: e.target.value as 'gte' | 'lte' })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        >
                            <option value="gte">{t('insight_rules.sum_op_gte')}</option>
                            <option value="lte">{t('insight_rules.sum_op_lte')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.amount')}</label>
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            disabled={disabled}
                            value={row.amount}
                            onChange={(e) => onChange({ ...row, amount: parseFloat(e.target.value) || 0 })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.category_optional')}</label>
                        <CategorySelectField
                            variant="optionalAll"
                            disabled={disabled}
                            categoryOptions={categoryOptions}
                            value={row.category}
                            onChange={(v) => onChange({ ...row, category: v })}
                        />
                    </div>
                </div>
            )}
            {row.rowType === 'sum_expenses_between' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.min_amount')}</label>
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            disabled={disabled}
                            value={row.minAmount}
                            onChange={(e) => onChange({ ...row, minAmount: parseFloat(e.target.value) || 0 })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.max_amount')}</label>
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            disabled={disabled}
                            value={row.maxAmount}
                            onChange={(e) => onChange({ ...row, maxAmount: parseFloat(e.target.value) || 0 })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.category_optional')}</label>
                        <CategorySelectField
                            variant="optionalAll"
                            disabled={disabled}
                            categoryOptions={categoryOptions}
                            value={row.category}
                            onChange={(v) => onChange({ ...row, category: v })}
                        />
                    </div>
                </div>
            )}
            {row.rowType === 'txn_count' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.min_count')}</label>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            disabled={disabled}
                            value={row.min}
                            onChange={(e) => onChange({ ...row, min: parseInt(e.target.value, 10) || 0 })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.category_optional')}</label>
                        <CategorySelectField
                            variant="optionalAll"
                            disabled={disabled}
                            categoryOptions={categoryOptions}
                            value={row.category}
                            onChange={(v) => onChange({ ...row, category: v })}
                        />
                    </div>
                </div>
            )}
            {row.rowType === 'txn_count_between' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.min_count')}</label>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            disabled={disabled}
                            value={row.min}
                            onChange={(e) => onChange({ ...row, min: parseInt(e.target.value, 10) || 0 })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.max_count')}</label>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            disabled={disabled}
                            value={row.max}
                            onChange={(e) => onChange({ ...row, max: parseInt(e.target.value, 10) || 0 })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.category_optional')}</label>
                        <CategorySelectField
                            variant="optionalAll"
                            disabled={disabled}
                            categoryOptions={categoryOptions}
                            value={row.category}
                            onChange={(v) => onChange({ ...row, category: v })}
                        />
                    </div>
                </div>
            )}
            {row.rowType === 'sum_income' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.op')}</label>
                        <select
                            value={row.op}
                            disabled={disabled}
                            onChange={(e) => onChange({ ...row, op: e.target.value as 'gte' | 'lte' })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        >
                            <option value="gte">{t('insight_rules.sum_op_gte')}</option>
                            <option value="lte">{t('insight_rules.sum_op_lte')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.amount')}</label>
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            disabled={disabled}
                            value={row.amount}
                            onChange={(e) => onChange({ ...row, amount: parseFloat(e.target.value) || 0 })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.category_optional')}</label>
                        <CategorySelectField
                            variant="optionalAll"
                            disabled={disabled}
                            categoryOptions={categoryOptions}
                            value={row.category}
                            onChange={(v) => onChange({ ...row, category: v })}
                        />
                    </div>
                </div>
            )}
            {row.rowType === 'max_single_expense' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.max_single_threshold')}</label>
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            disabled={disabled}
                            value={row.amount}
                            onChange={(e) => onChange({ ...row, amount: parseFloat(e.target.value) || 0 })}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.category_optional')}</label>
                        <CategorySelectField
                            variant="optionalAll"
                            disabled={disabled}
                            categoryOptions={categoryOptions}
                            value={row.category}
                            onChange={(v) => onChange({ ...row, category: v })}
                        />
                    </div>
                </div>
            )}
            {row.rowType === 'net_savings_lte' && (
                <div>
                    <label className="text-xs text-gray-500">{t('insight_rules.net_savings_threshold')}</label>
                    <input
                        type="number"
                        step={0.01}
                        disabled={disabled}
                        value={row.amount}
                        onChange={(e) => onChange({ ...row, amount: parseFloat(e.target.value) || 0 })}
                        className="mt-1 w-full max-w-xs rounded-lg border border-gray-200 p-2 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('insight_rules.net_savings_help')}</p>
                </div>
            )}
            {row.rowType === 'share_of_category' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.category_required')}</label>
                        <CategorySelectField
                            variant="required"
                            disabled={disabled}
                            categoryOptions={categoryOptions}
                            value={row.category}
                            onChange={(v) => onChange({ ...row, category: v })}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">{t('insight_rules.min_share_percent')}</label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            disabled={disabled}
                            value={row.minSharePercent}
                            onChange={(e) =>
                                onChange({ ...row, minSharePercent: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })
                            }
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                </div>
            )}
            {row.rowType === 'txn_exists' && (
                <TxnMatchFields
                    match={row.match}
                    disabled={disabled}
                    categoryOptions={categoryOptions}
                    onChange={(m) => onChange({ ...row, match: m })}
                />
            )}
        </div>
    );
}

export function IfConditionsSection({
    state,
    onChange,
    disabled,
}: {
    state: BuilderState;
    onChange: (next: BuilderState) => void;
    disabled?: boolean;
}) {
    const { t, i18n } = useTranslation();
    const rtl = i18n.dir() === 'rtl';
    const { data: aiSettings } = useAISettings();
    const categoryOptions = useMemo(() => {
        const raw = aiSettings?.categories;
        return Array.isArray(raw) ? (raw as string[]).filter((c) => typeof c === 'string') : [];
    }, [aiSettings?.categories]);
    const [pendingNewKind, setPendingNewKind] = useState<BuilderConditionRow['rowType']>('sum_expenses');

    const setRows = (rows: BuilderConditionRow[]) => onChange({ ...state, rows });

    return (
        <section className="space-y-3" aria-labelledby="if-heading">
            <h3 id="if-heading" className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                {t('insight_rules.if_heading')}
            </h3>

            <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">{t('insight_rules.when_evaluating')}</p>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1 min-w-0">
                        <label className="text-xs text-gray-500">{t('insight_rules.scope')}</label>
                        <select
                            value={state.scope}
                            disabled={disabled}
                            onChange={(e) => {
                                const scope = e.target.value as BuilderState['scope'];
                                onChange({ ...state, scope });
                            }}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        >
                            <option value="current_month">{t('insight_rules.scope_current_month')}</option>
                            <option value="all">{t('insight_rules.scope_all')}</option>
                            <option value="last_n_days">{t('insight_rules.scope_last_n_days')}</option>
                        </select>
                    </div>
                    {state.scope === 'last_n_days' && (
                        <div className="w-full sm:w-32">
                            <label className="text-xs text-gray-500">{t('insight_rules.last_n_days')}</label>
                            <input
                                type="number"
                                min={1}
                                max={366}
                                disabled={disabled}
                                value={state.lastNDays}
                                onChange={(e) =>
                                    onChange({ ...state, lastNDays: Math.max(1, parseInt(e.target.value, 10) || 30) })
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div>
                <p className="text-xs text-gray-600 mb-2">{t('insight_rules.combine_mode_label')}</p>
                <div
                    className={`inline-flex rounded-lg border border-gray-200 p-0.5 bg-white ${rtl ? 'flex-row-reverse' : ''}`}
                    role="group"
                >
                    {(['and', 'or'] as BuilderCombineMode[]).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange({ ...state, combineMode: mode })}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                                state.combineMode === mode
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {mode === 'and' ? t('insight_rules.combine_and') : t('insight_rules.combine_or')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                {state.rows.map((row, index) => (
                    <ConditionRowEditor
                        key={index}
                        index={index}
                        row={row}
                        disabled={disabled}
                        categoryOptions={categoryOptions}
                        onChange={(next) => {
                            const nextRows = [...state.rows];
                            nextRows[index] = next;
                            setRows(nextRows);
                        }}
                        onRemove={() => setRows(state.rows.filter((_, i) => i !== index))}
                    />
                ))}
            </div>

            <div>
                <p className="text-xs text-gray-500 mb-2">{t('insight_rules.add_condition')}</p>
                <div className={`flex flex-col sm:flex-row flex-wrap gap-2 sm:items-end ${rtl ? 'sm:flex-row-reverse' : ''}`}>
                    <div className="flex-1 min-w-[12rem]">
                        <label className="text-xs text-gray-500">{t('insight_rules.add_condition_type_label')}</label>
                        <select
                            value={pendingNewKind}
                            disabled={disabled}
                            onChange={(e) => setPendingNewKind(e.target.value as BuilderConditionRow['rowType'])}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm bg-white"
                        >
                            {ADD_CONDITION_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                    {t(`insight_rules.param_${kind}`)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setRows([...state.rows, newRow(pendingNewKind)])}
                        className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 shrink-0"
                    >
                        {t('insight_rules.add_condition_button')}
                    </button>
                </div>
            </div>
        </section>
    );
}
