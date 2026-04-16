import type { BuilderConditionRow, BuilderState } from '@app/shared';

type TLike = (k: string, o?: Record<string, string | number>) => string;

/** One IF condition as a short phrase (used inside the rule summary sentence). */
export function summarizeConditionRow(t: TLike, row: BuilderConditionRow): string {
    switch (row.rowType) {
        case 'sum_expenses': {
            const opSym = row.op === 'gte' ? '≥' : '≤';
            const cat = row.category.trim() ? row.category : t('insight_rules.summary_all_categories');
            return t('insight_rules.summary_sum', { op: opSym, amount: row.amount, cat });
        }
        case 'txn_count': {
            const cat = row.category.trim() ? row.category : t('insight_rules.summary_all_categories');
            return t('insight_rules.summary_txn_count', { min: row.min, cat });
        }
        case 'sum_expenses_between': {
            const cat = row.category.trim() ? row.category : t('insight_rules.summary_all_categories');
            return t('insight_rules.summary_sum_between', { min: row.minAmount, max: row.maxAmount, cat });
        }
        case 'txn_count_between': {
            const cat = row.category.trim() ? row.category : t('insight_rules.summary_all_categories');
            return t('insight_rules.summary_txn_count_between', { min: row.min, max: row.max, cat });
        }
        case 'sum_income': {
            const opSym = row.op === 'gte' ? '≥' : '≤';
            const cat = row.category.trim() ? row.category : t('insight_rules.summary_all_categories');
            return t('insight_rules.summary_sum_income', { op: opSym, amount: row.amount, cat });
        }
        case 'max_single_expense': {
            const cat = row.category.trim() ? row.category : t('insight_rules.summary_all_categories');
            return t('insight_rules.summary_max_single', { amount: row.amount, cat });
        }
        case 'net_savings_lte':
            return t('insight_rules.summary_net_savings', { amount: row.amount });
        case 'share_of_category':
            return t('insight_rules.summary_share', { cat: row.category, pct: row.minSharePercent });
        case 'txn_exists': {
            const m = row.match;
            switch (m.op) {
                case 'categoryEquals':
                    return t('insight_rules.summary_exists_cat', { v: m.value });
                case 'memoOrDescriptionContains':
                    return t('insight_rules.summary_exists_memo', { v: m.value });
                case 'accountEquals':
                    return t('insight_rules.summary_exists_account', { v: m.value });
                case 'amountAbsGte':
                    return t('insight_rules.summary_exists_amt_gte', { v: m.value });
                case 'amountAbsLte':
                    return t('insight_rules.summary_exists_amt_lte', { v: m.value });
                case 'amountAbsBetween':
                    return t('insight_rules.summary_exists_amt_between', { min: m.min, max: m.max });
                case 'dayOfWeekIn':
                    return t('insight_rules.summary_exists_dow', { days: m.days.join(', ') });
                case 'isExpense':
                    return t('insight_rules.summary_exists_expense');
                case 'isIncome':
                    return t('insight_rules.summary_exists_income');
                case 'ignored':
                    return t('insight_rules.summary_exists_ignored', {
                        v: m.value ? t('common.yes') : t('insight_rules.no'),
                    });
            }
        }
    }
}

function scopeLabelForSummary(t: TLike, state: BuilderState): string {
    return state.scope === 'current_month'
        ? t('insight_rules.scope_current_month')
        : state.scope === 'all'
          ? t('insight_rules.scope_all')
          : t('insight_rules.summary_scope_last_n', { days: state.lastNDays });
}

/** Single readable sentence: If in [scope], [conditions], then [outcome]. */
export function formatRuleSummarySentence(t: TLike, state: BuilderState): string {
    const scopeLabel = scopeLabelForSummary(t, state);
    const joiner =
        state.combineMode === 'and' ? t('insight_rules.summary_join_and') : t('insight_rules.summary_join_or');
    const conds = state.rows.map((row) => summarizeConditionRow(t, row));
    const conditionsText =
        conds.length === 0 ? t('insight_rules.summary_no_conditions_inline') : conds.join(` ${joiner} `);

    const thenLine = t('insight_rules.summary_then', {
        kind: state.output.kind === 'insight' ? t('insight_rules.kind_insight') : t('insight_rules.kind_alert'),
        score: state.output.score,
    });

    return t('insight_rules.summary_sentence', { scope: scopeLabel, conditions: conditionsText, then: thenLine });
}

/** Plain-text note for community share (same sentence as the rule summary aside). */
export function formatBuilderStateShareNote(t: TLike, state: BuilderState): string {
    return formatRuleSummarySentence(t, state);
}
