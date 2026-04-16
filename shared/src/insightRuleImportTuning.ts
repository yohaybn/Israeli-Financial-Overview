import type { InsightRuleCondition, InsightRuleDefinitionV1, TxnCondition } from './insightRules.js';

export type InsightRuleImportTuningKind = 'category' | 'categoryList' | 'amount' | 'percent' | 'count' | 'text';

/** One editable value discovered in a rule definition (amounts, categories, %, counts, memo/account text). */
export type InsightRuleImportTuningSlot = {
    /** Stable key within the rule (JSON-stringified path segments). */
    id: string;
    kind: InsightRuleImportTuningKind;
    /** Short English label for tables (UI may map op/field to i18n). */
    label: string;
    /** Path from document rule root into `definition` (always starts with `condition`). */
    path: (string | number)[];
    /** Initial display value (string). */
    initialValue: string;
};

function slotId(path: (string | number)[]): string {
    return JSON.stringify(path);
}

function pushCategory(slots: InsightRuleImportTuningSlot[], path: (string | number)[], value: string, label: string): void {
    const v = value.trim();
    if (!v) return;
    slots.push({
        id: slotId(path),
        kind: 'category',
        label,
        path,
        initialValue: v,
    });
}

function pushText(slots: InsightRuleImportTuningSlot[], path: (string | number)[], value: string, label: string): void {
    slots.push({
        id: slotId(path),
        kind: 'text',
        label,
        path,
        initialValue: value,
    });
}

function pushAmount(slots: InsightRuleImportTuningSlot[], path: (string | number)[], value: number, label: string): void {
    if (!Number.isFinite(value)) return;
    slots.push({
        id: slotId(path),
        kind: 'amount',
        label,
        path,
        initialValue: String(value),
    });
}

function pushCount(slots: InsightRuleImportTuningSlot[], path: (string | number)[], value: number, label: string): void {
    if (!Number.isFinite(value)) return;
    slots.push({
        id: slotId(path),
        kind: 'count',
        label,
        path,
        initialValue: String(Math.floor(value)),
    });
}

function pushPercent(slots: InsightRuleImportTuningSlot[], path: (string | number)[], share01: number, label: string): void {
    if (!Number.isFinite(share01)) return;
    const pct = Math.round(share01 * 1000) / 10;
    slots.push({
        id: slotId(path),
        kind: 'percent',
        label,
        path,
        initialValue: String(pct),
    });
}

function walkTxnCondition(c: TxnCondition, base: (string | number)[], slots: InsightRuleImportTuningSlot[]): void {
    switch (c.op) {
        case 'and':
        case 'or':
            c.items.forEach((it, i) => walkTxnCondition(it, [...base, 'items', i], slots));
            return;
        case 'not':
            walkTxnCondition(c.item, [...base, 'item'], slots);
            return;
        case 'categoryEquals':
            pushCategory(slots, [...base, 'value'], c.value, 'txn · category equals');
            return;
        case 'categoryIn':
            slots.push({
                id: slotId([...base, 'values']),
                kind: 'categoryList',
                label: 'txn · categories (comma-separated)',
                path: [...base, 'values'],
                initialValue: c.values.join(', '),
            });
            return;
        case 'memoOrDescriptionContains':
            pushText(slots, [...base, 'value'], c.value, 'txn · memo / description');
            return;
        case 'accountEquals':
            pushText(slots, [...base, 'value'], c.value, 'txn · account');
            return;
        case 'amountAbsGte':
        case 'amountAbsLte':
            pushAmount(slots, [...base, 'value'], c.value, `txn · ${c.op}`);
            return;
        case 'amountAbsBetween':
            pushAmount(slots, [...base, 'min'], c.min, 'txn · amount between (min)');
            pushAmount(slots, [...base, 'max'], c.max, 'txn · amount between (max)');
            return;
        default:
            return;
    }
}

function walkInsightCondition(c: InsightRuleCondition, base: (string | number)[], slots: InsightRuleImportTuningSlot[]): void {
    switch (c.op) {
        case 'and':
        case 'or':
            c.items.forEach((it, i) => walkInsightCondition(it, [...base, 'items', i], slots));
            return;
        case 'not':
            walkInsightCondition(c.item, [...base, 'item'], slots);
            return;
        case 'existsTxn':
            walkTxnCondition(c.where, [...base, 'where'], slots);
            return;
        case 'sumExpensesGte':
        case 'sumExpensesLte':
            pushAmount(slots, [...base, 'amount'], c.amount, `${c.op} · amount`);
            if (c.category !== undefined && c.category.trim()) {
                pushCategory(slots, [...base, 'category'], c.category, `${c.op} · category`);
            }
            return;
        case 'sumExpensesBetween':
            pushAmount(slots, [...base, 'minAmount'], c.minAmount, 'sumExpensesBetween · min');
            pushAmount(slots, [...base, 'maxAmount'], c.maxAmount, 'sumExpensesBetween · max');
            if (c.category !== undefined && c.category.trim()) {
                pushCategory(slots, [...base, 'category'], c.category, 'sumExpensesBetween · category');
            }
            return;
        case 'txnCountGte':
            pushCount(slots, [...base, 'min'], c.min, 'txnCountGte · min');
            if (c.category !== undefined && c.category.trim()) {
                pushCategory(slots, [...base, 'category'], c.category, 'txnCountGte · category');
            }
            return;
        case 'txnCountBetween':
            pushCount(slots, [...base, 'min'], c.min, 'txnCountBetween · min');
            pushCount(slots, [...base, 'max'], c.max, 'txnCountBetween · max');
            if (c.category !== undefined && c.category.trim()) {
                pushCategory(slots, [...base, 'category'], c.category, 'txnCountBetween · category');
            }
            return;
        case 'sumIncomeGte':
        case 'sumIncomeLte':
            pushAmount(slots, [...base, 'amount'], c.amount, `${c.op} · amount`);
            if (c.category !== undefined && c.category.trim()) {
                pushCategory(slots, [...base, 'category'], c.category, `${c.op} · category`);
            }
            return;
        case 'maxSingleExpenseGte':
            pushAmount(slots, [...base, 'amount'], c.amount, 'maxSingleExpenseGte · amount');
            if (c.category !== undefined && c.category.trim()) {
                pushCategory(slots, [...base, 'category'], c.category, 'maxSingleExpenseGte · category');
            }
            return;
        case 'netSavingsLte':
            pushAmount(slots, [...base, 'amount'], c.amount, 'netSavingsLte · amount');
            return;
        case 'shareOfCategoryGte':
            pushCategory(slots, [...base, 'category'], c.category, 'shareOfCategoryGte · category');
            pushPercent(slots, [...base, 'share'], c.share, 'shareOfCategoryGte · share %');
            return;
        default:
            return;
    }
}

/** Lists concrete categories, amounts, percentages, etc. so importers can adjust before save. */
export function extractInsightRuleImportTuningSlots(def: InsightRuleDefinitionV1): InsightRuleImportTuningSlot[] {
    const slots: InsightRuleImportTuningSlot[] = [];
    walkInsightCondition(def.condition, ['condition'], slots);
    return slots;
}

function getAt(obj: unknown, seg: string | number): unknown {
    if (obj === null || obj === undefined) return undefined;
    if (typeof seg === 'number') {
        return Array.isArray(obj) ? obj[seg] : undefined;
    }
    if (typeof obj === 'object' && seg in (obj as object)) return (obj as Record<string, unknown>)[seg];
    return undefined;
}

function setAt(obj: unknown, path: (string | number)[], value: unknown): void {
    if (path.length === 0) return;
    let cur: unknown = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const s = path[i]!;
        const next = getAt(cur, s);
        if (next === undefined) return;
        cur = next;
    }
    const last = path[path.length - 1]!;
    if (cur !== null && typeof cur === 'object') {
        if (typeof last === 'number' && Array.isArray(cur)) {
            (cur as unknown[])[last] = value;
        } else if (typeof last === 'string') {
            (cur as Record<string, unknown>)[last] = value;
        }
    }
}

function coerceValue(kind: InsightRuleImportTuningKind, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
    const t = raw.trim();
    if (kind === 'category' || kind === 'text') {
        return { ok: true, value: t };
    }
    if (kind === 'categoryList') {
        const parts = t
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (parts.length === 0) return { ok: false, error: 'at least one category required' };
        return { ok: true, value: parts };
    }
    if (kind === 'count') {
        const n = parseInt(t, 10);
        if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'invalid integer' };
        return { ok: true, value: n };
    }
    if (kind === 'amount') {
        const n = parseFloat(t);
        if (!Number.isFinite(n)) return { ok: false, error: 'invalid number' };
        return { ok: true, value: n };
    }
    if (kind === 'percent') {
        const n = parseFloat(t);
        if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'percent must be 0–100' };
        return { ok: true, value: Math.round((n / 100) * 1000000) / 1000000 };
    }
    return { ok: false, error: 'unknown kind' };
}

/**
 * Deep-clones `def` and writes user values into the paths from {@link extractInsightRuleImportTuningSlots}.
 * `values` is keyed by slot `id`. Missing keys keep the original value at that path.
 */
export function applyInsightRuleImportTuningSlots(
    def: InsightRuleDefinitionV1,
    slots: InsightRuleImportTuningSlot[],
    values: Record<string, string>
): { ok: true; value: InsightRuleDefinitionV1 } | { ok: false; error: string } {
    const next = JSON.parse(JSON.stringify(def)) as InsightRuleDefinitionV1;
    for (const slot of slots) {
        const raw = values[slot.id];
        if (raw === undefined) continue;
        const coerced = coerceValue(slot.kind, raw);
        if (!coerced.ok) return { ok: false, error: `${slot.label}: ${coerced.error}` };
        setAt(next, slot.path, coerced.value);
    }
    return { ok: true, value: next };
}
