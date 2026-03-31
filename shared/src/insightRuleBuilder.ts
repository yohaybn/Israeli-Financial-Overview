import type {
    InsightRuleCondition,
    InsightRuleDefinitionV1,
    InsightRuleOutputV1,
    InsightRuleScope,
    TxnCondition,
} from './insightRules.js';

/** How multiple IF rows combine (MVP: global AND or OR). */
export type BuilderCombineMode = 'and' | 'or';

/** Single leaf for “there exists a transaction matching …”. */
export type BuilderTxnMatch =
    | { op: 'categoryEquals'; value: string }
    | { op: 'memoOrDescriptionContains'; value: string }
    | { op: 'accountEquals'; value: string }
    | { op: 'amountAbsGte'; value: number }
    | { op: 'amountAbsLte'; value: number }
    | { op: 'isExpense' }
    | { op: 'ignored'; value: boolean };

export type BuilderConditionRow =
    | {
          rowType: 'sum_expenses';
          op: 'gte' | 'lte';
          amount: number;
          /** Empty string = all categories */
          category: string;
      }
    | {
          rowType: 'txn_count';
          min: number;
          category: string;
      }
    | {
          rowType: 'txn_exists';
          match: BuilderTxnMatch;
      };

export interface BuilderState {
    scope: InsightRuleScope;
    lastNDays: number;
    combineMode: BuilderCombineMode;
    rows: BuilderConditionRow[];
    description: string;
    output: {
        kind: 'insight' | 'alert';
        score: number;
        messageEn: string;
        messageHe: string;
    };
}

function txnMatchToCondition(m: BuilderTxnMatch): TxnCondition {
    switch (m.op) {
        case 'categoryEquals':
            return { op: 'categoryEquals', value: m.value };
        case 'memoOrDescriptionContains':
            return { op: 'memoOrDescriptionContains', value: m.value };
        case 'accountEquals':
            return { op: 'accountEquals', value: m.value };
        case 'amountAbsGte':
            return { op: 'amountAbsGte', value: m.value };
        case 'amountAbsLte':
            return { op: 'amountAbsLte', value: m.value };
        case 'isExpense':
            return { op: 'isExpense' };
        case 'ignored':
            return { op: 'ignored', value: m.value };
    }
}

function rowToInsightCondition(row: BuilderConditionRow): InsightRuleCondition {
    switch (row.rowType) {
        case 'sum_expenses': {
            const cat = row.category.trim();
            if (row.op === 'gte') {
                return {
                    op: 'sumExpensesGte',
                    amount: row.amount,
                    ...(cat ? { category: cat } : {}),
                };
            }
            return {
                op: 'sumExpensesLte',
                amount: row.amount,
                ...(cat ? { category: cat } : {}),
            };
        }
        case 'txn_count': {
            const cat = row.category.trim();
            return {
                op: 'txnCountGte',
                min: Math.max(0, Math.floor(row.min)),
                ...(cat ? { category: cat } : {}),
            };
        }
        case 'txn_exists':
            return {
                op: 'existsTxn',
                where: txnMatchToCondition(row.match),
            };
    }
}

/** Rows that are complete enough to compile into condition leaves (same filter as save). */
export function filterValidConditionRows(rows: BuilderConditionRow[]): BuilderConditionRow[] {
    return rows.filter((r) => {
        if (r.rowType === 'sum_expenses') return Number.isFinite(r.amount) && r.amount >= 0;
        if (r.rowType === 'txn_count') return Number.isFinite(r.min) && r.min >= 0;
        if (r.rowType === 'txn_exists') {
            const m = r.match;
            if (m.op === 'isExpense') return true;
            if (m.op === 'categoryEquals' || m.op === 'memoOrDescriptionContains' || m.op === 'accountEquals') {
                return m.value.trim().length > 0;
            }
            if (m.op === 'amountAbsGte' || m.op === 'amountAbsLte') return m.value >= 0;
            if (m.op === 'ignored') return true;
            return false;
        }
        return false;
    });
}

export function isBuilderStateSavable(state: BuilderState): boolean {
    return filterValidConditionRows(state.rows).length > 0;
}

export function builderStateToDefinition(state: BuilderState): InsightRuleDefinitionV1 {
    const rows = filterValidConditionRows(state.rows);

    let condition: InsightRuleCondition;
    if (rows.length === 0) {
        condition = { op: 'txnCountGte', min: 0 };
    } else if (rows.length === 1) {
        condition = rowToInsightCondition(rows[0]);
    } else {
        const items = rows.map(rowToInsightCondition);
        condition = { op: state.combineMode, items };
    }

    const out: InsightRuleOutputV1 = {
        kind: state.output.kind,
        score: Math.max(1, Math.min(100, Math.round(state.output.score))),
        message: { en: state.output.messageEn, he: state.output.messageHe },
    };

    const def: InsightRuleDefinitionV1 = {
        version: 1,
        scope: state.scope,
        condition,
        output: out,
    };

    if (state.scope === 'last_n_days') {
        def.lastNDays = Math.max(1, Math.min(366, Math.floor(state.lastNDays)));
    }
    const desc = state.description.trim();
    if (desc) def.description = desc;

    return def;
}

function txnConditionToBuilderMatch(c: TxnCondition): BuilderTxnMatch | null {
    switch (c.op) {
        case 'categoryEquals':
            return { op: 'categoryEquals', value: c.value };
        case 'memoOrDescriptionContains':
            return { op: 'memoOrDescriptionContains', value: c.value };
        case 'accountEquals':
            return { op: 'accountEquals', value: c.value };
        case 'amountAbsGte':
            return { op: 'amountAbsGte', value: c.value };
        case 'amountAbsLte':
            return { op: 'amountAbsLte', value: c.value };
        case 'isExpense':
            return { op: 'isExpense' };
        case 'ignored':
            return { op: 'ignored', value: c.value };
        default:
            return null;
    }
}

function insightLeafToRow(cond: InsightRuleCondition): BuilderConditionRow | null {
    if (!cond || typeof cond !== 'object' || !('op' in cond)) return null;
    const op = (cond as InsightRuleCondition).op;
    if (op === 'sumExpensesGte' || op === 'sumExpensesLte') {
        const c = cond as { op: string; amount: number; category?: string };
        if (typeof c.amount !== 'number' || c.amount < 0) return null;
        return {
            rowType: 'sum_expenses',
            op: op === 'sumExpensesGte' ? 'gte' : 'lte',
            amount: c.amount,
            category: typeof c.category === 'string' ? c.category : '',
        };
    }
    if (op === 'txnCountGte') {
        const c = cond as { op: string; min: number; category?: string };
        if (typeof c.min !== 'number' || c.min < 0) return null;
        return {
            rowType: 'txn_count',
            min: c.min,
            category: typeof c.category === 'string' ? c.category : '',
        };
    }
    if (op === 'existsTxn') {
        const c = cond as { op: string; where: TxnCondition };
        const inner = txnConditionToBuilderMatch(c.where);
        if (!inner) return null;
        return { rowType: 'txn_exists', match: inner };
    }
    return null;
}

export interface DefinitionToBuilderResult {
    state: BuilderState;
    /** Non-fatal notes when structure was simplified */
    warnings: string[];
}

/**
 * Convert a v1 definition to builder state when the condition is a flat AND/OR of supported leaves.
 * Returns null if the condition uses `not`, nested groups, or unsupported ops.
 */
export function definitionToBuilderState(def: InsightRuleDefinitionV1): DefinitionToBuilderResult | null {
    const warnings: string[] = [];
    const cond = def.condition;

    let combineMode: BuilderCombineMode = 'and';
    let leaves: InsightRuleCondition[];

    if (cond.op === 'and' || cond.op === 'or') {
        combineMode = cond.op;
        leaves = cond.items;
    } else {
        leaves = [cond];
    }

    const rows: BuilderConditionRow[] = [];
    for (const leaf of leaves) {
        const row = insightLeafToRow(leaf);
        if (!row) return null;
        rows.push(row);
    }

    return {
        state: {
            scope: def.scope,
            lastNDays: def.lastNDays ?? 30,
            combineMode,
            rows: rows.length > 0 ? rows : defaultBuilderRows(),
            description: def.description ?? '',
            output: {
                kind: def.output.kind,
                score: def.output.score,
                messageEn: def.output.message.en,
                messageHe: def.output.message.he,
            },
        },
        warnings,
    };
}

export function defaultBuilderRows(): BuilderConditionRow[] {
    return [
        {
            rowType: 'sum_expenses',
            op: 'gte',
            amount: 1000,
            category: '',
        },
    ];
}

export function defaultBuilderState(): BuilderState {
    return {
        scope: 'current_month',
        lastNDays: 30,
        combineMode: 'and',
        rows: defaultBuilderRows(),
        description: '',
        output: {
            kind: 'insight',
            score: 70,
            messageEn: 'Rule matched: {{sum}} ₪',
            messageHe: 'הכלל התאים: {{sum}} ₪',
        },
    };
}
