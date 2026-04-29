import type {
    Transaction,
    UserChartDefinition,
    UserChartFilterClause,
    UserChartMeasure,
} from '../types.js';
import { USER_CHART_LAST_N_DAYS_MAX, USER_CHART_LAST_N_MONTHS_MAX } from '../types.js';
import { expenseCategoryKey } from '../expenseCategory.js';
import { isTransactionIgnored } from '../isTransactionIgnored.js';
import { isInternalTransfer } from '../isInternalTransfer.js';
import { isLoanExpenseCategory } from '../loanCategory.js';

function parseTransactionDate(dateValue: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return new Date(`${dateValue}T12:00:00`);
    }
    return new Date(dateValue);
}

function skipLoanExpense(t: Transaction): boolean {
    const amount = t.chargedAmount || t.amount || 0;
    return amount < 0 && isLoanExpenseCategory(t.category);
}

function getAmount(t: Transaction): number {
    return t.chargedAmount ?? t.amount ?? 0;
}

function txnValueForMeasure(t: Transaction, measure: UserChartMeasure): number | null {
    const amt = getAmount(t);
    if (measure === 'sum_expense') {
        if (amt >= 0 || skipLoanExpense(t)) return null;
        return Math.abs(amt);
    }
    if (measure === 'sum_income') {
        if (amt <= 0) return null;
        return amt;
    }
    if (measure === 'net') {
        if (amt < 0 && skipLoanExpense(t)) return null;
        return amt;
    }
    if (measure === 'count') {
        return 1;
    }
    return null;
}

function monthKey(t: Transaction): string {
    const d = parseTransactionDate(t.date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** AND-combine user filter clauses (after ignored / internal-transfer exclusion). */
export function passesUserChartFilters(t: Transaction, filters: UserChartFilterClause[] | undefined): boolean {
    if (!filters?.length) return true;
    const cat = expenseCategoryKey(t.category);
    const desc = (t.description ?? '').toLowerCase();
    const absAmt = Math.abs(getAmount(t));

    for (const f of filters) {
        switch (f.kind) {
            case 'category_in':
                if (f.categories.length > 0 && !f.categories.includes(cat)) return false;
                break;
            case 'category_not_in':
                if (f.categories.length > 0 && f.categories.includes(cat)) return false;
                break;
            case 'description_contains': {
                const q = f.text.trim().toLowerCase();
                if (q && !desc.includes(q)) return false;
                break;
            }
            case 'description_not_contains': {
                const q = f.text.trim().toLowerCase();
                if (q && desc.includes(q)) return false;
                break;
            }
            case 'amount_min':
                if (absAmt < f.value) return false;
                break;
            case 'amount_max':
                if (absAmt > f.value) return false;
                break;
            default:
                break;
        }
    }
    return true;
}

function toYmdLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Pick transaction list for a chart: analytics toggle, presets, or custom range over the full pool. */
export function getTransactionsForUserChart(
    spec: UserChartDefinition,
    followTransactions: Transaction[],
    fullTransactionPool: Transaction[]
): Transaction[] {
    const pool = fullTransactionPool;
    const scope = spec.dataScope ?? 'follow_analytics';

    if (scope === 'follow_analytics') {
        return followTransactions;
    }

    if (scope === 'all_time') {
        return pool;
    }

    if (scope === 'single_month') {
        const ym = spec.singleMonth?.trim() ?? '';
        if (!/^\d{4}-\d{2}$/.test(ym)) {
            return followTransactions;
        }
        return pool.filter((t) => t.date.startsWith(ym));
    }

    if (scope === 'last_n_days') {
        const n = Math.min(USER_CHART_LAST_N_DAYS_MAX, Math.max(1, spec.lastN ?? 30));
        const end = new Date();
        const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        start.setDate(start.getDate() - (n - 1));
        const startStr = toYmdLocal(start);
        const endStr = toYmdLocal(end);
        return pool.filter((t) => {
            const d = t.date.slice(0, 10);
            return d >= startStr && d <= endStr;
        });
    }

    if (scope === 'last_n_months') {
        const n = Math.min(USER_CHART_LAST_N_MONTHS_MAX, Math.max(1, spec.lastN ?? 3));
        const monthKeys = new Set<string>();
        const ref = new Date();
        const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
        for (let i = 0; i < n; i++) {
            monthKeys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            d.setMonth(d.getMonth() - 1);
        }
        return pool.filter((t) => monthKeys.has(t.date.slice(0, 7)));
    }

    if (scope === 'custom_range') {
        const from = spec.customDateFrom?.trim();
        const to = spec.customDateTo?.trim();
        if (!from || !to || from.length < 10 || to.length < 10 || from > to) {
            return followTransactions;
        }
        return pool.filter((t) => {
            const d = t.date.slice(0, 10);
            return d >= from && d <= to;
        });
    }

    return followTransactions;
}

/**
 * `followTransactions` = current analytics slice (e.g. report month for PDF, or dashboard month).
 * `fullTransactionPool` = all loaded transactions (used for `all_time`, `single_month`, rolling windows, and `custom_range`).
 */
export function buildCustomChartSeries(
    spec: UserChartDefinition,
    options: {
        followTransactions: Transaction[];
        fullTransactionPool: Transaction[];
        customCCKeywords: string[];
        weekdayLabels: string[];
    }
): { rows: { name: string; value: number }[]; isEmpty: boolean } {
    const { followTransactions, fullTransactionPool, customCCKeywords, weekdayLabels } = options;

    const transactions = getTransactionsForUserChart(spec, followTransactions, fullTransactionPool);

    const base = transactions.filter((t) => {
        if (isTransactionIgnored(t)) return false;
        if (isInternalTransfer(t, customCCKeywords)) return false;
        if (!passesUserChartFilters(t, spec.filters)) return false;
        return true;
    });

    const { groupBy, measure } = spec;
    const merchantTopN = Math.min(25, Math.max(1, spec.merchantTopN ?? 10));

    const map = new Map<string, number>();

    for (const t of base) {
        const v = txnValueForMeasure(t, measure);
        if (v === null) continue;

        let key: string;
        switch (groupBy) {
            case 'month':
                key = monthKey(t);
                break;
            case 'category':
                key = expenseCategoryKey(t.category);
                break;
            case 'weekday':
                key = String(parseTransactionDate(t.date).getDay());
                break;
            case 'merchant':
                key = t.description?.trim() || '—';
                break;
            default:
                key = '';
        }

        if (key === '') continue;
        map.set(key, (map.get(key) ?? 0) + v);
    }

    let entries = Array.from(map.entries());

    if (groupBy === 'merchant') {
        entries.sort((a, b) => b[1] - a[1]);
        entries = entries.slice(0, merchantTopN);
    } else if (groupBy === 'month') {
        entries.sort((a, b) => a[0].localeCompare(b[0]));
    } else if (groupBy === 'weekday') {
        entries.sort((a, b) => Number(a[0]) - Number(b[0]));
    } else {
        entries.sort((a, b) => b[1] - a[1]);
    }

    const rows = entries.map(([k, value]) => {
        const rounded = Math.round(value * 100) / 100;
        if (groupBy === 'weekday') {
            const idx = Number(k);
            const name = weekdayLabels[idx] ?? k;
            return { name, value: rounded };
        }
        return { name: k, value: rounded };
    });

    return {
        rows,
        isEmpty: rows.length === 0 || rows.every((r) => r.value === 0),
    };
}
