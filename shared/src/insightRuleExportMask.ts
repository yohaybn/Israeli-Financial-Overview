import type { InsightRuleDefinitionV1 } from './insightRules.js';

/** Placeholder used in exported/shared JSON instead of numeric thresholds (privacy). */
export const INSIGHT_RULE_AMOUNT_PLACEHOLDER = 'X' as const;

function slotId(path: (string | number)[]): string {
    return JSON.stringify(path);
}

function isObj(x: unknown): x is Record<string, unknown> {
    return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function maskTxnConditionForExport(c: unknown): unknown {
    if (!isObj(c)) return c;
    const op = c.op;
    if (op === 'and' || op === 'or') {
        const items = Array.isArray(c.items) ? c.items.map((it) => maskTxnConditionForExport(it)) : [];
        return { ...c, items };
    }
    if (op === 'not') {
        return { ...c, item: maskTxnConditionForExport(c.item) };
    }
    if (op === 'amountAbsGte' || op === 'amountAbsLte') {
        return { ...c, value: INSIGHT_RULE_AMOUNT_PLACEHOLDER };
    }
    if (op === 'amountAbsBetween') {
        return { ...c, min: INSIGHT_RULE_AMOUNT_PLACEHOLDER, max: INSIGHT_RULE_AMOUNT_PLACEHOLDER };
    }
    return c;
}

function maskInsightConditionForExport(c: unknown): unknown {
    if (!isObj(c)) return c;
    const op = c.op;
    if (op === 'and' || op === 'or') {
        const items = Array.isArray(c.items) ? c.items.map((it) => maskInsightConditionForExport(it)) : [];
        return { ...c, items };
    }
    if (op === 'not') {
        return { ...c, item: maskInsightConditionForExport(c.item) };
    }
    if (op === 'existsTxn') {
        return { ...c, where: maskTxnConditionForExport(c.where) };
    }
    if (op === 'sumExpensesGte' || op === 'sumExpensesLte' || op === 'sumIncomeGte' || op === 'sumIncomeLte' || op === 'maxSingleExpenseGte' || op === 'netSavingsLte') {
        return { ...c, amount: INSIGHT_RULE_AMOUNT_PLACEHOLDER };
    }
    if (op === 'sumExpensesBetween') {
        return { ...c, minAmount: INSIGHT_RULE_AMOUNT_PLACEHOLDER, maxAmount: INSIGHT_RULE_AMOUNT_PLACEHOLDER };
    }
    if (op === 'txnCountGte') {
        return { ...c, min: INSIGHT_RULE_AMOUNT_PLACEHOLDER };
    }
    if (op === 'txnCountBetween') {
        return { ...c, min: INSIGHT_RULE_AMOUNT_PLACEHOLDER, max: INSIGHT_RULE_AMOUNT_PLACEHOLDER };
    }
    if (op === 'shareOfCategoryGte') {
        return { ...c, share: INSIGHT_RULE_AMOUNT_PLACEHOLDER };
    }
    return c;
}

/**
 * Returns a JSON-serializable document copy with threshold numbers replaced by `"X"`.
 * Message text and categories are unchanged.
 */
export function maskInsightRuleDefinitionForExport(def: InsightRuleDefinitionV1): unknown {
    const o = JSON.parse(JSON.stringify(def)) as Record<string, unknown>;
    o.condition = maskInsightConditionForExport(o.condition);
    return o;
}

function isPlaceholder(v: unknown): boolean {
    return v === INSIGHT_RULE_AMOUNT_PLACEHOLDER;
}

function stripTxnCondition(c: unknown, base: (string | number)[], maskedSlotIds: string[]): unknown {
    if (!isObj(c)) return c;
    const op = c.op;
    if (op === 'and' || op === 'or') {
        const items = Array.isArray(c.items) ? c.items : [];
        return {
            ...c,
            items: items.map((it, i) => stripTxnCondition(it, [...base, 'items', i], maskedSlotIds)),
        };
    }
    if (op === 'not') {
        return { ...c, item: stripTxnCondition(c.item, [...base, 'item'], maskedSlotIds) };
    }
    if (op === 'amountAbsGte' || op === 'amountAbsLte') {
        const v = c.value;
        if (isPlaceholder(v)) {
            maskedSlotIds.push(slotId([...base, 'value']));
            return { ...c, value: 0 };
        }
        return c;
    }
    if (op === 'amountAbsBetween') {
        let next = { ...c };
        if (isPlaceholder(c.min)) {
            maskedSlotIds.push(slotId([...base, 'min']));
            next = { ...next, min: 0 };
        }
        if (isPlaceholder(c.max)) {
            maskedSlotIds.push(slotId([...base, 'max']));
            next = { ...next, max: 0 };
        }
        return next;
    }
    return c;
}

function stripInsightCondition(c: unknown, base: (string | number)[], maskedSlotIds: string[]): unknown {
    if (!isObj(c)) return c;
    const op = c.op;
    if (op === 'and' || op === 'or') {
        const items = Array.isArray(c.items) ? c.items : [];
        return {
            ...c,
            items: items.map((it, i) => stripInsightCondition(it, [...base, 'items', i], maskedSlotIds)),
        };
    }
    if (op === 'not') {
        return { ...c, item: stripInsightCondition(c.item, [...base, 'item'], maskedSlotIds) };
    }
    if (op === 'existsTxn') {
        return { ...c, where: stripTxnCondition(c.where, [...base, 'where'], maskedSlotIds) };
    }
    if (op === 'sumExpensesGte' || op === 'sumExpensesLte' || op === 'sumIncomeGte' || op === 'sumIncomeLte' || op === 'maxSingleExpenseGte' || op === 'netSavingsLte') {
        if (isPlaceholder(c.amount)) {
            maskedSlotIds.push(slotId([...base, 'amount']));
            return { ...c, amount: 0 };
        }
        return c;
    }
    if (op === 'sumExpensesBetween') {
        let next = { ...c };
        if (isPlaceholder(c.minAmount)) {
            maskedSlotIds.push(slotId([...base, 'minAmount']));
            next = { ...next, minAmount: 0 };
        }
        if (isPlaceholder(c.maxAmount)) {
            maskedSlotIds.push(slotId([...base, 'maxAmount']));
            next = { ...next, maxAmount: 0 };
        }
        return next;
    }
    if (op === 'txnCountGte') {
        if (isPlaceholder(c.min)) {
            maskedSlotIds.push(slotId([...base, 'min']));
            return { ...c, min: 0 };
        }
        return c;
    }
    if (op === 'txnCountBetween') {
        let next = { ...c };
        if (isPlaceholder(c.min)) {
            maskedSlotIds.push(slotId([...base, 'min']));
            next = { ...next, min: 0 };
        }
        if (isPlaceholder(c.max)) {
            maskedSlotIds.push(slotId([...base, 'max']));
            next = { ...next, max: 0 };
        }
        return next;
    }
    if (op === 'shareOfCategoryGte') {
        if (isPlaceholder(c.share)) {
            maskedSlotIds.push(slotId([...base, 'share']));
            return { ...c, share: 0 };
        }
        return c;
    }
    return c;
}

/**
 * Replaces exported `"X"` placeholders with numeric zeros for validation and collects
 * tuning-slot ids (same keys as {@link extractInsightRuleImportTuningSlots}) so the UI can show X.
 */
export function stripInsightRuleDefinitionAmountPlaceholders(
    raw: unknown
): { ok: true; normalized: unknown; maskedSlotIds: string[] } | { ok: false; error: string } {
    if (!isObj(raw)) return { ok: false, error: 'definition must be object' };
    const maskedSlotIds: string[] = [];
    const next = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    next.condition = stripInsightCondition(next.condition, ['condition'], maskedSlotIds);
    return { ok: true, normalized: next, maskedSlotIds };
}
