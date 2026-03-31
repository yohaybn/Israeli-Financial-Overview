import type { Transaction } from './types.js';
import { isTransactionIgnored } from './isTransactionIgnored.js';
import { expenseCategoryKey } from './expenseCategory.js';
import type { DigestLocale } from './financial/anomalyI18n.js';

export const INSIGHT_RULES_EXPORT_FORMAT = 'financial-overview-insight-rules' as const;
export const INSIGHT_RULE_DEFINITION_VERSION = 1 as const;

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
    | { op: 'isExpense' };

export type InsightRuleCondition =
    | { op: 'and'; items: InsightRuleCondition[] }
    | { op: 'or'; items: InsightRuleCondition[] }
    | { op: 'not'; item: InsightRuleCondition }
    | { op: 'existsTxn'; where: TxnCondition }
    | { op: 'sumExpensesGte'; amount: number; category?: string }
    | { op: 'sumExpensesLte'; amount: number; category?: string }
    | { op: 'txnCountGte'; min: number; category?: string };

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
        case 'isExpense':
            return isExpenseTxn(txn);
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
        case 'txnCountGte':
            return countExpenseTxns(txns, c.category) >= c.min;
        default:
            return false;
    }
}

function collectPlaceholders(txns: Transaction[], def: InsightRuleDefinitionV1): Record<string, string> {
    const cat = def.condition;
    let sumCat: string | undefined;
    if (cat.op === 'sumExpensesGte' || cat.op === 'sumExpensesLte') sumCat = cat.category;
    else if (cat.op === 'txnCountGte') sumCat = cat.category;

    const total = sumExpenses(txns, sumCat).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const count = String(countExpenseTxns(txns, sumCat));
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

    return {
        sum: total,
        count,
        category: sumCat || topCat || '',
    };
}

const PLACEHOLDER_RE = /\{\{\s*(sum|count|category)\s*\}\}/g;

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
        placeholders: collectPlaceholders(scoped, def),
    };
}

export function applyMessageTemplates(output: InsightRuleOutputV1, placeholders: Record<string, string>): {
    en: string;
    he: string;
} {
    return {
        en: renderInsightRuleMessage(output.message.en, 'en', placeholders).trim(),
        he: renderInsightRuleMessage(output.message.he, 'he', placeholders).trim(),
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
    if (op === 'txnCountGte') {
        if (typeof c.min !== 'number' || c.min < 0) return 'min invalid';
        if (c.category !== undefined && typeof c.category !== 'string') return 'category must be string';
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
    if (op === 'isExpense') return null;
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
