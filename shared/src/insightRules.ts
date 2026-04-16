import type { Transaction } from './types.js';
import { isTransactionIgnored } from './isTransactionIgnored.js';
import { expenseCategoryKey } from './expenseCategory.js';
import type { DigestLocale } from './financial/anomalyI18n.js';

export const INSIGHT_RULES_EXPORT_FORMAT = 'financial-overview-insight-rules' as const;
export const INSIGHT_RULE_DEFINITION_VERSION = 1 as const;

/**
 * Placeholder names filled when an insight rule matches (`{{name}}` in output.message).
 * Keep in sync with {@link collectPlaceholders} and {@link applyMessageTemplates} (`period_label`).
 */
export const INSIGHT_RULE_MESSAGE_PLACEHOLDER_KEYS = [
    'sum',
    'sum_raw',
    'count',
    'category',
    'threshold',
    'avg_txn',
    'pct_of_total',
    'top_memo',
    'largest_txn_amount',
    'largest_txn_date',
    'largest_txn_memo',
    'dominant_account',
    'delta_prior',
    'currency',
    'preview_3',
    'period_label',
] as const;

export type InsightRuleMessagePlaceholderKey = (typeof INSIGHT_RULE_MESSAGE_PLACEHOLDER_KEYS)[number];

/** One `{{key}}` per line for AI prompts and internal docs. */
export function formatInsightRulePlaceholdersForPrompt(): string {
    return INSIGHT_RULE_MESSAGE_PLACEHOLDER_KEYS.map((k) => `{{${k}}}`).join('\n');
}

/** Bullet list of category labels for AI prompts (exact strings for rule JSON). */
export function formatCategoryLabelsForPrompt(labels: readonly string[]): string {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const raw of labels) {
        const c = raw.trim();
        if (!c || seen.has(c)) continue;
        seen.add(c);
        lines.push(`- ${c}`);
    }
    return lines.length > 0 ? lines.join('\n') : '(no categories configured)';
}

export type InsightRuleSource = 'user' | 'ai';

export type InsightRuleScope = 'current_month' | 'all' | 'last_n_days';

/** Single-transaction condition (no nested existsTxn in v1). */
export type TxnCondition =
    | { op: 'and'; items: TxnCondition[] }
    | { op: 'or'; items: TxnCondition[] }
    | { op: 'not'; item: TxnCondition }
    | { op: 'categoryEquals'; value: string }
    | { op: 'categoryIn'; values: string[] }
    | { op: 'memoOrDescriptionContains'; value: string }
    | { op: 'accountEquals'; value: string }
    | { op: 'ignored'; value: boolean }
    | { op: 'amountAbsGte'; value: number }
    | { op: 'amountAbsLte'; value: number }
    /** Inclusive range on |amount| (or chargedAmount). */
    | { op: 'amountAbsBetween'; min: number; max: number }
    /** 0 = Sunday … 6 = Saturday (local calendar day of transaction date). */
    | { op: 'dayOfWeekIn'; days: number[] }
    | { op: 'isExpense' }
    | { op: 'isIncome' };

export type InsightRuleCondition =
    | { op: 'and'; items: InsightRuleCondition[] }
    | { op: 'or'; items: InsightRuleCondition[] }
    | { op: 'not'; item: InsightRuleCondition }
    | { op: 'existsTxn'; where: TxnCondition }
    | { op: 'sumExpensesGte'; amount: number; category?: string }
    | { op: 'sumExpensesLte'; amount: number; category?: string }
    | { op: 'sumExpensesBetween'; minAmount: number; maxAmount: number; category?: string }
    | { op: 'txnCountGte'; min: number; category?: string }
    | { op: 'txnCountBetween'; min: number; max: number; category?: string }
    | { op: 'sumIncomeGte'; amount: number; category?: string }
    | { op: 'sumIncomeLte'; amount: number; category?: string }
    | { op: 'maxSingleExpenseGte'; amount: number; category?: string }
    /** category share of total expenses in scope: catSum / totalSum >= share */
    | { op: 'shareOfCategoryGte'; category: string; share: number }
    /** Net savings (income total − expense total) is at or below threshold (can be negative). */
    | { op: 'netSavingsLte'; amount: number };

export interface InsightRuleOutputV1 {
    kind: 'insight' | 'alert';
    score: number;
    message: { en: string; he: string };
}

export interface InsightRuleDefinitionV1 {
    version: typeof INSIGHT_RULE_DEFINITION_VERSION;
    scope: InsightRuleScope;
    /** When scope is last_n_days */
    lastNDays?: number;
    /** Optional human-readable strategy / purpose (IFTTT-style description). */
    description?: string;
    condition: InsightRuleCondition;
    output: InsightRuleOutputV1;
}

export type InsightRuleDefinition = InsightRuleDefinitionV1;

export interface InsightRuleExportRow {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    source: InsightRuleSource;
    definition: InsightRuleDefinition;
}

export interface InsightRulesExportDocument {
    format: typeof INSIGHT_RULES_EXPORT_FORMAT;
    version: number;
    exportedAt: string;
    rules: InsightRuleExportRow[];
}

export interface EvaluateInsightRuleResult {
    matched: boolean;
    /** Populated when matched is true */
    placeholders: Record<string, string>;
}

function normCat(txn: Transaction): string {
    return expenseCategoryKey(txn.category);
}

function txnAmount(txn: Transaction): number {
    return txn.chargedAmount ?? txn.amount ?? 0;
}

function isExpenseTxn(txn: Transaction): boolean {
    return txnAmount(txn) < 0;
}

function isIncomeTxn(txn: Transaction): boolean {
    return txnAmount(txn) > 0;
}

function txnDayOfWeek(txn: Transaction): number | null {
    const d = (txn.date || '').slice(0, 10);
    if (!d) return null;
    return new Date(`${d}T12:00:00`).getDay();
}

export function filterTransactionsForRuleScope(
    all: Transaction[],
    scope: InsightRuleScope,
    options: { referenceDate?: Date; lastNDays?: number }
): Transaction[] {
    const ref = options.referenceDate ?? new Date();
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;

    const byDate = (t: Transaction) => {
        const d = (t.date || '').slice(0, 10);
        if (!d) return false;
        if (scope === 'current_month') return (t.date || '').startsWith(monthPrefix);
        if (scope === 'all') return true;
        if (scope === 'last_n_days') {
            const n = Math.max(1, Math.min(366, Math.floor(options.lastNDays ?? 30)));
            const start = new Date(ref);
            start.setHours(0, 0, 0, 0);
            start.setDate(start.getDate() - (n - 1));
            const txnDate = new Date(d + 'T12:00:00');
            return txnDate >= start && txnDate <= ref;
        }
        return true;
    };

    return all.filter(byDate);
}

/**
 * Transactions in the period immediately before the active rule scope (same span rules as {@link filterTransactionsForRuleScope}).
 * Used for `delta_prior` placeholders. Empty when scope is `all`.
 */
export function filterTransactionsForPriorRuleScope(
    all: Transaction[],
    scope: InsightRuleScope,
    options: { referenceDate?: Date; lastNDays?: number }
): Transaction[] {
    const ref = options.referenceDate ?? new Date();
    if (scope === 'all') return [];

    if (scope === 'current_month') {
        const y = ref.getFullYear();
        const m = ref.getMonth();
        let py = y;
        let pm = m - 1;
        if (pm < 0) {
            pm = 11;
            py -= 1;
        }
        const monthPrefix = `${py}-${String(pm + 1).padStart(2, '0')}`;
        return all.filter((t) => (t.date || '').startsWith(monthPrefix));
    }

    const n = Math.max(1, Math.min(366, Math.floor(options.lastNDays ?? 30)));
    const endPrior = new Date(ref);
    endPrior.setHours(0, 0, 0, 0);
    endPrior.setDate(endPrior.getDate() - n);
    const startPrior = new Date(endPrior);
    startPrior.setDate(startPrior.getDate() - (n - 1));

    return all.filter((t) => {
        const d = (t.date || '').slice(0, 10);
        if (!d) return false;
        const txnDate = new Date(`${d}T12:00:00`);
        return txnDate >= startPrior && txnDate <= endPrior;
    });
}

export function evaluateTxnCondition(txn: Transaction, c: TxnCondition): boolean {
    switch (c.op) {
        case 'and':
            return c.items.every((x) => evaluateTxnCondition(txn, x));
        case 'or':
            return c.items.some((x) => evaluateTxnCondition(txn, x));
        case 'not':
            return !evaluateTxnCondition(txn, c.item);
        case 'categoryEquals':
            return normCat(txn) === c.value;
        case 'categoryIn':
            return c.values.includes(normCat(txn));
        case 'memoOrDescriptionContains': {
            const needle = c.value.toLowerCase();
            const memo = (txn.memo || '').toLowerCase();
            const desc = (txn.description || '').toLowerCase();
            return memo.includes(needle) || desc.includes(needle);
        }
        case 'accountEquals':
            return (txn.accountNumber || '') === c.value;
        case 'ignored':
            return isTransactionIgnored(txn) === c.value;
        case 'amountAbsGte':
            return Math.abs(txnAmount(txn)) >= c.value;
        case 'amountAbsLte':
            return Math.abs(txnAmount(txn)) <= c.value;
        case 'amountAbsBetween': {
            const a = Math.abs(txnAmount(txn));
            return a >= c.min && a <= c.max;
        }
        case 'dayOfWeekIn': {
            const dow = txnDayOfWeek(txn);
            if (dow === null) return false;
            return c.days.includes(dow);
        }
        case 'isExpense':
            return isExpenseTxn(txn);
        case 'isIncome':
            return isIncomeTxn(txn);
        default:
            return false;
    }
}

function eligibleForAggregate(txn: Transaction): boolean {
    if (isTransactionIgnored(txn)) return false;
    return isExpenseTxn(txn);
}

function categoryMatchesOptional(txn: Transaction, category?: string): boolean {
    if (category === undefined || category === '') return true;
    return normCat(txn) === category;
}

function sumExpenses(txns: Transaction[], category?: string): number {
    let s = 0;
    for (const t of txns) {
        if (!eligibleForAggregate(t)) continue;
        if (!categoryMatchesOptional(t, category)) continue;
        s += Math.abs(txnAmount(t));
    }
    return Math.round(s * 100) / 100;
}

function countExpenseTxns(txns: Transaction[], category?: string): number {
    let n = 0;
    for (const t of txns) {
        if (!eligibleForAggregate(t)) continue;
        if (!categoryMatchesOptional(t, category)) continue;
        n++;
    }
    return n;
}

function eligibleForIncomeAggregate(txn: Transaction): boolean {
    if (isTransactionIgnored(txn)) return false;
    return isIncomeTxn(txn);
}

function categoryMatchesOptionalIncome(txn: Transaction, category?: string): boolean {
    if (category === undefined || category === '') return true;
    return normCat(txn) === category;
}

function sumIncome(txns: Transaction[], category?: string): number {
    let s = 0;
    for (const t of txns) {
        if (!eligibleForIncomeAggregate(t)) continue;
        if (!categoryMatchesOptionalIncome(t, category)) continue;
        s += txnAmount(t);
    }
    return Math.round(s * 100) / 100;
}

function countIncomeTxns(txns: Transaction[], category?: string): number {
    let n = 0;
    for (const t of txns) {
        if (!eligibleForIncomeAggregate(t)) continue;
        if (!categoryMatchesOptionalIncome(t, category)) continue;
        n++;
    }
    return n;
}

function maxSingleExpense(txns: Transaction[], category?: string): number {
    let m = 0;
    for (const t of txns) {
        if (!eligibleForAggregate(t)) continue;
        if (!categoryMatchesOptional(t, category)) continue;
        const a = Math.abs(txnAmount(t));
        if (a > m) m = a;
    }
    return Math.round(m * 100) / 100;
}

/** Income total minus expense total (both as positive magnitudes). */
function netSavings(txns: Transaction[]): number {
    return Math.round((sumIncome(txns) - sumExpenses(txns)) * 100) / 100;
}

export function evaluateInsightRuleCondition(txns: Transaction[], c: InsightRuleCondition): boolean {
    switch (c.op) {
        case 'and':
            return c.items.every((x) => evaluateInsightRuleCondition(txns, x));
        case 'or':
            return c.items.some((x) => evaluateInsightRuleCondition(txns, x));
        case 'not':
            return !evaluateInsightRuleCondition(txns, c.item);
        case 'existsTxn':
            return txns.some((t) => evaluateTxnCondition(t, c.where));
        case 'sumExpensesGte':
            return sumExpenses(txns, c.category) >= c.amount;
        case 'sumExpensesLte':
            return sumExpenses(txns, c.category) <= c.amount;
        case 'sumExpensesBetween': {
            const s = sumExpenses(txns, c.category);
            return s >= c.minAmount && s <= c.maxAmount;
        }
        case 'txnCountGte':
            return countExpenseTxns(txns, c.category) >= c.min;
        case 'txnCountBetween': {
            const n = countExpenseTxns(txns, c.category);
            return n >= c.min && n <= c.max;
        }
        case 'sumIncomeGte':
            return sumIncome(txns, c.category) >= c.amount;
        case 'sumIncomeLte':
            return sumIncome(txns, c.category) <= c.amount;
        case 'maxSingleExpenseGte':
            return maxSingleExpense(txns, c.category) >= c.amount;
        case 'shareOfCategoryGte': {
            const total = sumExpenses(txns, undefined);
            if (total <= 0) return false;
            const catSum = sumExpenses(txns, c.category);
            return catSum / total >= c.share;
        }
        case 'netSavingsLte':
            return netSavings(txns) <= c.amount;
        default:
            return false;
    }
}

function extractCategoryFromTxnCondition(c: TxnCondition): string | undefined {
    switch (c.op) {
        case 'categoryEquals':
            return c.value.trim() || undefined;
        case 'categoryIn':
            return c.values.length > 0 ? c.values[0] : undefined;
        case 'and':
        case 'or':
            for (const it of c.items) {
                const f = extractCategoryFromTxnCondition(it);
                if (f) return f;
            }
            return undefined;
        case 'not':
            return extractCategoryFromTxnCondition(c.item);
        default:
            return undefined;
    }
}

function extractOptionalCategoryFromInsightCondition(c: InsightRuleCondition): string | undefined {
    switch (c.op) {
        case 'sumExpensesGte':
        case 'sumExpensesLte':
        case 'sumExpensesBetween':
        case 'txnCountGte':
        case 'txnCountBetween':
        case 'sumIncomeGte':
        case 'sumIncomeLte':
        case 'maxSingleExpenseGte':
            return typeof c.category === 'string' && c.category.trim() ? c.category : undefined;
        case 'shareOfCategoryGte':
            return c.category.trim() || undefined;
        case 'existsTxn':
            return extractCategoryFromTxnCondition(c.where);
        case 'and':
        case 'or':
            for (const it of c.items) {
                const found = extractOptionalCategoryFromInsightCondition(it);
                if (found !== undefined) return found;
            }
            return undefined;
        case 'not':
            return extractOptionalCategoryFromInsightCondition(c.item);
        default:
            return undefined;
    }
}

function extractThresholdFromInsightCondition(c: InsightRuleCondition): string {
    const visit = (x: InsightRuleCondition): string | undefined => {
        switch (x.op) {
            case 'sumExpensesGte':
            case 'sumExpensesLte':
            case 'sumIncomeGte':
            case 'sumIncomeLte':
            case 'maxSingleExpenseGte':
            case 'netSavingsLte':
                return String(x.amount);
            case 'sumExpensesBetween':
                return `${x.minAmount}–${x.maxAmount}`;
            case 'txnCountGte':
                return String(x.min);
            case 'txnCountBetween':
                return `${x.min}–${x.max}`;
            case 'shareOfCategoryGte':
                return `${Math.round(x.share * 100)}%`;
            case 'and':
            case 'or':
                for (const it of x.items) {
                    const v = visit(it);
                    if (v !== undefined) return v;
                }
                return undefined;
            case 'not':
                return visit(x.item);
            default:
                return undefined;
        }
    };
    return visit(c) ?? '';
}

function topMemoByExpense(txns: Transaction[], category?: string): string {
    const map = new Map<string, number>();
    for (const t of txns) {
        if (!eligibleForAggregate(t)) continue;
        if (!categoryMatchesOptional(t, category)) continue;
        const memo = (t.memo || t.description || '').trim();
        if (!memo) continue;
        const key = memo.length > 80 ? `${memo.slice(0, 77)}…` : memo;
        map.set(key, (map.get(key) || 0) + Math.abs(txnAmount(t)));
    }
    let best = '';
    let bestV = 0;
    for (const [k, v] of map) {
        if (v > bestV) {
            best = k;
            bestV = v;
        }
    }
    return best;
}

function dominantAccountByExpense(txns: Transaction[], category?: string): string {
    const map = new Map<string, number>();
    for (const t of txns) {
        if (!eligibleForAggregate(t)) continue;
        if (!categoryMatchesOptional(t, category)) continue;
        const acct = (t.accountNumber || '').trim() || '—';
        map.set(acct, (map.get(acct) || 0) + Math.abs(txnAmount(t)));
    }
    let best = '';
    let bestV = 0;
    for (const [k, v] of map) {
        if (v > bestV) {
            best = k;
            bestV = v;
        }
    }
    return best;
}

function largestExpenseTxn(txns: Transaction[], category?: string): Transaction | null {
    let best: Transaction | null = null;
    let bestAmt = 0;
    for (const t of txns) {
        if (!eligibleForAggregate(t)) continue;
        if (!categoryMatchesOptional(t, category)) continue;
        const a = Math.abs(txnAmount(t));
        if (a > bestAmt) {
            bestAmt = a;
            best = t;
        }
    }
    return best;
}

function previewTopExpenses(txns: Transaction[], category: string | undefined, maxLines: number): string {
    const rows = txns
        .filter((t) => eligibleForAggregate(t) && categoryMatchesOptional(t, category))
        .map((t) => ({ t, a: Math.abs(txnAmount(t)) }))
        .sort((x, y) => y.a - x.a)
        .slice(0, maxLines);
    return rows
        .map(({ t, a }) => {
            const d = (t.date || '').slice(0, 10);
            const m = (t.memo || t.description || '').trim().slice(0, 40);
            return `${d} ${m} ${a.toFixed(2)}`.trim();
        })
        .join('; ');
}

/** Human-readable label for the rule’s active period (used as `period_label` in messages). */
export function formatInsightRulePeriodLabel(def: InsightRuleDefinitionV1, ref: Date, locale: DigestLocale): string {
    const loc = locale === 'he' ? 'he-IL' : 'en-US';
    if (def.scope === 'all') {
        return locale === 'he' ? 'כל העסקאות' : 'All transactions';
    }
    if (def.scope === 'current_month') {
        return new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(ref);
    }
    const n = Math.max(1, Math.min(366, Math.floor(def.lastNDays ?? 30)));
    const end = ref.toLocaleDateString(loc, { year: 'numeric', month: 'short', day: 'numeric' });
    if (locale === 'he') {
        return `${n} הימים האחרונים (עד ${end})`;
    }
    return `Last ${n} days (through ${end})`;
}

function collectPlaceholders(
    txns: Transaction[],
    def: InsightRuleDefinitionV1,
    options: { referenceDate: Date; allTransactions: Transaction[] }
): Record<string, string> {
    const sumCat = extractOptionalCategoryFromInsightCondition(def.condition);
    const sumNum = sumExpenses(txns, sumCat);
    const cnt = countExpenseTxns(txns, sumCat);
    const totalAll = sumExpenses(txns, undefined);
    const topCat = (() => {
        const map = new Map<string, number>();
        for (const t of txns) {
            if (!eligibleForAggregate(t)) continue;
            const k = normCat(t);
            map.set(k, (map.get(k) || 0) + Math.abs(txnAmount(t)));
        }
        let best = '';
        let bestV = 0;
        for (const [k, v] of map) {
            if (v > bestV) {
                best = k;
                bestV = v;
            }
        }
        return best;
    })();

    const priorTxns = filterTransactionsForPriorRuleScope(options.allTransactions, def.scope, {
        referenceDate: options.referenceDate,
        lastNDays: def.lastNDays,
    });
    const priorSum = sumExpenses(priorTxns, sumCat);
    const deltaRaw = sumNum - priorSum;
    const deltaStr =
        priorTxns.length === 0
            ? ''
            : `${deltaRaw > 0 ? '+' : ''}${deltaRaw.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

    const pct =
        sumCat && totalAll > 0 ? String(Math.round((sumNum / totalAll) * 1000) / 10) : '';

    const largest = largestExpenseTxn(txns, sumCat);
    const largestAmt = largest ? Math.abs(txnAmount(largest)) : 0;
    const largestDate = largest ? (largest.date || '').slice(0, 10) : '';
    const largestMemo = largest
        ? ((largest.memo || largest.description || '').trim().slice(0, 120) || '—')
        : '';

    const avg =
        cnt > 0 ? (Math.round((sumNum / cnt) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';

    return {
        sum: sumNum.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        sum_raw: String(sumNum),
        count: String(cnt),
        category: sumCat || topCat || '',
        threshold: extractThresholdFromInsightCondition(def.condition),
        avg_txn: avg,
        pct_of_total: pct,
        top_memo: topMemoByExpense(txns, sumCat),
        dominant_account: dominantAccountByExpense(txns, sumCat),
        largest_txn_amount: largestAmt.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        largest_txn_date: largestDate,
        largest_txn_memo: largestMemo,
        delta_prior: deltaStr,
        currency: '₪',
        preview_3: previewTopExpenses(txns, sumCat, 3),
    };
}

/** Placeholders use `{{name}}` with letters, numbers, and underscores. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function renderInsightRuleMessage(
    template: string,
    locale: DigestLocale,
    placeholders: Record<string, string>
): string {
    return template.replace(PLACEHOLDER_RE, (_m, key: string) => placeholders[key] ?? '');
}

export function evaluateInsightRuleDefinition(
    allTransactions: Transaction[],
    def: InsightRuleDefinitionV1,
    options?: { referenceDate?: Date }
): EvaluateInsightRuleResult {
    const ref = options?.referenceDate ?? new Date();
    const scoped = filterTransactionsForRuleScope(allTransactions, def.scope, {
        referenceDate: ref,
        lastNDays: def.lastNDays,
    });

    const matched = evaluateInsightRuleCondition(scoped, def.condition);
    if (!matched) {
        return { matched: false, placeholders: {} };
    }
    return {
        matched: true,
        placeholders: collectPlaceholders(scoped, def, {
            referenceDate: ref,
            allTransactions,
        }),
    };
}

export function applyMessageTemplates(
    output: InsightRuleOutputV1,
    placeholders: Record<string, string>,
    options?: { referenceDate?: Date; definition?: InsightRuleDefinitionV1 }
): {
    en: string;
    he: string;
} {
    const ref = options?.referenceDate ?? new Date();
    const def = options?.definition;
    const periodEn = def ? formatInsightRulePeriodLabel(def, ref, 'en') : '';
    const periodHe = def ? formatInsightRulePeriodLabel(def, ref, 'he') : '';
    const enPh = { ...placeholders, period_label: periodEn };
    const hePh = { ...placeholders, period_label: periodHe };
    return {
        en: renderInsightRuleMessage(output.message.en, 'en', enPh).trim(),
        he: renderInsightRuleMessage(output.message.he, 'he', hePh).trim(),
    };
}

/** Dedupe bucket for persisted fires (same rule + period → one row). */
export function computeRulePeriodKey(def: InsightRuleDefinitionV1, ref: Date): string {
    const y = ref.getFullYear();
    const m = ref.getMonth() + 1;
    const month = `${y}-${String(m).padStart(2, '0')}`;
    if (def.scope === 'current_month') return `m:${month}`;
    if (def.scope === 'all') return 'a:all';
    const n = Math.max(1, Math.min(366, Math.floor(def.lastNDays ?? 30)));
    const d = ref.toISOString().slice(0, 10);
    return `d:${n}:${d}`;
}

function isObject(x: unknown): x is Record<string, unknown> {
    return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function parseInsightRuleDefinition(raw: unknown): { ok: true; value: InsightRuleDefinitionV1 } | { ok: false; error: string } {
    if (!isObject(raw)) return { ok: false, error: 'definition must be an object' };
    if (raw.version !== 1) return { ok: false, error: 'unsupported definition.version' };
    const scope = raw.scope;
    if (scope !== 'current_month' && scope !== 'all' && scope !== 'last_n_days') {
        return { ok: false, error: 'invalid scope' };
    }
    const lastNDays = raw.lastNDays;
    if (scope === 'last_n_days') {
        if (typeof lastNDays !== 'number' || lastNDays < 1 || lastNDays > 366) {
            return { ok: false, error: 'lastNDays required (1–366) for last_n_days scope' };
        }
    }
    const cond = raw.condition;
    const out = raw.output;
    if (!isObject(out)) return { ok: false, error: 'output required' };
    if (out.kind !== 'insight' && out.kind !== 'alert') return { ok: false, error: 'output.kind invalid' };
    const score = out.score;
    if (typeof score !== 'number' || score < 1 || score > 100) return { ok: false, error: 'output.score must be 1–100' };
    const msg = out.message;
    if (!isObject(msg)) return { ok: false, error: 'output.message required' };
    if (typeof msg.en !== 'string' || typeof msg.he !== 'string') {
        return { ok: false, error: 'output.message.en and .he must be strings' };
    }

    const condErr = validateCondition(cond);
    if (condErr) return { ok: false, error: condErr };

    const description = raw.description;
    if (description !== undefined && typeof description !== 'string') {
        return { ok: false, error: 'description must be a string when present' };
    }
    const descriptionTrimmed = typeof description === 'string' ? description.trim() : '';

    return {
        ok: true,
        value: {
            version: 1,
            scope,
            ...(scope === 'last_n_days' ? { lastNDays: Math.floor(lastNDays as number) } : {}),
            ...(descriptionTrimmed.length > 0 ? { description: descriptionTrimmed } : {}),
            condition: cond as InsightRuleCondition,
            output: {
                kind: out.kind,
                score: Math.round(score),
                message: { en: msg.en, he: msg.he },
            },
        },
    };
}

function validateCondition(c: unknown): string | null {
    if (!isObject(c)) return 'invalid condition';
    const op = c.op;
    if (op === 'and' || op === 'or') {
        const items = c.items;
        if (!Array.isArray(items) || items.length === 0) return `${op}.items required`;
        for (const it of items) {
            const e = validateCondition(it);
            if (e) return e;
        }
        return null;
    }
    if (op === 'not') {
        return validateCondition(c.item);
    }
    if (op === 'existsTxn') {
        return validateTxnCondition(c.where);
    }
    if (op === 'sumExpensesGte' || op === 'sumExpensesLte') {
        if (typeof c.amount !== 'number' || c.amount < 0) return 'amount invalid';
        if (c.category !== undefined && typeof c.category !== 'string') return 'category must be string';
        return null;
    }
    if (op === 'sumExpensesBetween') {
        if (typeof c.minAmount !== 'number' || typeof c.maxAmount !== 'number') return 'minAmount/maxAmount invalid';
        if (c.minAmount < 0 || c.maxAmount < 0 || c.minAmount > c.maxAmount) return 'sumExpensesBetween range invalid';
        if (c.category !== undefined && typeof c.category !== 'string') return 'category must be string';
        return null;
    }
    if (op === 'txnCountGte') {
        if (typeof c.min !== 'number' || c.min < 0) return 'min invalid';
        if (c.category !== undefined && typeof c.category !== 'string') return 'category must be string';
        return null;
    }
    if (op === 'txnCountBetween') {
        if (typeof c.min !== 'number' || typeof c.max !== 'number') return 'txnCountBetween min/max invalid';
        if (c.min < 0 || c.max < 0 || c.min > c.max) return 'txnCountBetween range invalid';
        if (c.category !== undefined && typeof c.category !== 'string') return 'category must be string';
        return null;
    }
    if (op === 'sumIncomeGte' || op === 'sumIncomeLte') {
        if (typeof c.amount !== 'number' || c.amount < 0) return 'sumIncome amount invalid';
        if (c.category !== undefined && typeof c.category !== 'string') return 'category must be string';
        return null;
    }
    if (op === 'maxSingleExpenseGte') {
        if (typeof c.amount !== 'number' || c.amount < 0) return 'maxSingleExpenseGte amount invalid';
        if (c.category !== undefined && typeof c.category !== 'string') return 'category must be string';
        return null;
    }
    if (op === 'shareOfCategoryGte') {
        if (typeof c.category !== 'string' || !c.category.trim()) return 'shareOfCategoryGte.category required';
        if (typeof c.share !== 'number' || c.share < 0 || c.share > 1) return 'shareOfCategoryGte.share must be 0–1';
        return null;
    }
    if (op === 'netSavingsLte') {
        if (typeof c.amount !== 'number' || !Number.isFinite(c.amount)) return 'netSavingsLte.amount invalid';
        return null;
    }
    return `unknown condition op: ${String(op)}`;
}

function validateTxnCondition(c: unknown): string | null {
    if (!isObject(c)) return 'invalid txn condition';
    const op = c.op;
    if (op === 'and' || op === 'or') {
        const items = c.items;
        if (!Array.isArray(items) || items.length === 0) return `${op}.items required`;
        for (const it of items) {
            const e = validateTxnCondition(it);
            if (e) return e;
        }
        return null;
    }
    if (op === 'not') return validateTxnCondition(c.item);
    if (op === 'categoryEquals') return typeof c.value === 'string' ? null : 'categoryEquals.value';
    if (op === 'categoryIn') return Array.isArray(c.values) && c.values.every((x) => typeof x === 'string') ? null : 'categoryIn.values';
    if (op === 'memoOrDescriptionContains') return typeof c.value === 'string' ? null : 'memo value';
    if (op === 'accountEquals') return typeof c.value === 'string' ? null : 'accountEquals';
    if (op === 'ignored') return typeof c.value === 'boolean' ? null : 'ignored';
    if (op === 'amountAbsGte' || op === 'amountAbsLte') return typeof c.value === 'number' ? null : 'amount';
    if (op === 'amountAbsBetween') {
        if (typeof c.min !== 'number' || typeof c.max !== 'number') return 'amountAbsBetween min/max';
        if (c.min < 0 || c.max < 0 || c.min > c.max) return 'amountAbsBetween range';
        return null;
    }
    if (op === 'dayOfWeekIn') {
        if (!Array.isArray(c.days) || c.days.length === 0) return 'dayOfWeekIn.days required';
        if (!c.days.every((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6)) return 'dayOfWeekIn days 0–6';
        return null;
    }
    if (op === 'isExpense') return null;
    if (op === 'isIncome') return null;
    return `unknown txn op: ${String(op)}`;
}

export function parseInsightRulesExportDocument(raw: unknown): { ok: true; value: InsightRulesExportDocument } | { ok: false; error: string } {
    if (!isObject(raw)) return { ok: false, error: 'root must be object' };
    if (raw.format !== INSIGHT_RULES_EXPORT_FORMAT) return { ok: false, error: 'invalid format field' };
    if (raw.version !== 1) return { ok: false, error: 'unsupported export version' };
    if (typeof raw.exportedAt !== 'string') return { ok: false, error: 'exportedAt required' };
    const rules = raw.rules;
    if (!Array.isArray(rules)) return { ok: false, error: 'rules must be array' };
    const parsed: InsightRuleExportRow[] = [];
    for (const r of rules) {
        if (!isObject(r)) return { ok: false, error: 'rule must be object' };
        if (typeof r.id !== 'string' || !r.id) return { ok: false, error: 'rule.id' };
        if (typeof r.name !== 'string') return { ok: false, error: 'rule.name' };
        if (typeof r.enabled !== 'boolean') return { ok: false, error: 'rule.enabled' };
        if (typeof r.priority !== 'number') return { ok: false, error: 'rule.priority' };
        if (r.source !== 'user' && r.source !== 'ai') return { ok: false, error: 'rule.source' };
        const def = parseInsightRuleDefinition(r.definition);
        if (!def.ok) return { ok: false, error: def.error };
        parsed.push({
            id: r.id,
            name: r.name,
            enabled: r.enabled,
            priority: r.priority,
            source: r.source,
            definition: def.value,
        });
    }
    return {
        ok: true,
        value: {
            format: INSIGHT_RULES_EXPORT_FORMAT,
            version: 1,
            exportedAt: raw.exportedAt,
            rules: parsed,
        },
    };
}
