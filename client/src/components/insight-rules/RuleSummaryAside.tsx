import { useTranslation } from 'react-i18next';
import type { BuilderConditionRow, BuilderState } from '@app/shared';

function summarizeRow(t: (k: string, o?: Record<string, string | number>) => string, row: BuilderConditionRow, index: number): string {
    const n = index + 1;
    switch (row.rowType) {
        case 'sum_expenses': {
            const opSym = row.op === 'gte' ? '≥' : '≤';
            const cat = row.category.trim() ? row.category : t('insight_rules.summary_all_categories');
            return t('insight_rules.summary_sum', { n, op: opSym, amount: row.amount, cat });
        }
        case 'txn_count': {
            const cat = row.category.trim() ? row.category : t('insight_rules.summary_all_categories');
            return t('insight_rules.summary_txn_count', { n, min: row.min, cat });
        }
        case 'txn_exists': {
            const m = row.match;
            switch (m.op) {
                case 'categoryEquals':
                    return t('insight_rules.summary_exists_cat', { n, v: m.value });
                case 'memoOrDescriptionContains':
                    return t('insight_rules.summary_exists_memo', { n, v: m.value });
                case 'accountEquals':
                    return t('insight_rules.summary_exists_account', { n, v: m.value });
                case 'amountAbsGte':
                    return t('insight_rules.summary_exists_amt_gte', { n, v: m.value });
                case 'amountAbsLte':
                    return t('insight_rules.summary_exists_amt_lte', { n, v: m.value });
                case 'isExpense':
                    return t('insight_rules.summary_exists_expense', { n });
                case 'ignored':
                    return t('insight_rules.summary_exists_ignored', {
                        n,
                        v: m.value ? t('common.yes') : t('insight_rules.no'),
                    });
            }
        }
    }
}

export function RuleSummaryAside({ state }: { state: BuilderState }) {
    const { t, i18n } = useTranslation();
    const rtl = i18n.dir() === 'rtl';

    const scopeLabel =
        state.scope === 'current_month'
            ? t('insight_rules.scope_current_month')
            : state.scope === 'all'
              ? t('insight_rules.scope_all')
              : t('insight_rules.summary_scope_last_n', { days: state.lastNDays });

    const combine =
        state.combineMode === 'and' ? t('insight_rules.combine_and') : t('insight_rules.combine_or');

    const ifLines = state.rows.map((row, i) => summarizeRow(t, row, i));

    const thenLine = t('insight_rules.summary_then', {
        kind: state.output.kind === 'insight' ? t('insight_rules.kind_insight') : t('insight_rules.kind_alert'),
        score: state.output.score,
    });

    return (
        <aside
            className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3 text-sm"
            aria-labelledby="summary-heading"
            dir={rtl ? 'rtl' : 'ltr'}
        >
            <h3 id="summary-heading" className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                {t('insight_rules.rule_summary')}
            </h3>
            <div className="text-slate-700">
                <p className="font-medium text-slate-800">{t('insight_rules.summary_when')}</p>
                <p className="text-xs text-slate-600 mt-0.5">{scopeLabel}</p>
                <p className="text-xs text-slate-500 mt-1">{t('insight_rules.summary_combine', { mode: combine })}</p>
                <ul className="list-disc ps-4 mt-2 space-y-1">
                    {ifLines.length === 0 ? (
                        <li className="text-amber-700">{t('insight_rules.summary_no_conditions')}</li>
                    ) : (
                        ifLines.map((line, i) => <li key={i}>{line}</li>)
                    )}
                </ul>
            </div>
            <div className="border-t border-slate-200 pt-2">
                <p className="font-medium text-slate-800">{t('insight_rules.summary_then_title')}</p>
                <p className="mt-1">{thenLine}</p>
                {state.output.messageEn.trim() && (
                    <p className="text-xs text-slate-600 mt-2 line-clamp-3" dir="ltr">
                        EN: {state.output.messageEn}
                    </p>
                )}
                {state.output.messageHe.trim() && (
                    <p className="text-xs text-slate-600 mt-1 line-clamp-3" dir="rtl">
                        HE: {state.output.messageHe}
                    </p>
                )}
            </div>
            <p className="text-xs text-slate-500">{t('insight_rules.summary_test_hint')}</p>
        </aside>
    );
}
