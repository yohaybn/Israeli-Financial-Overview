import { useTranslation } from 'react-i18next';
import type { BuilderState } from '@app/shared';
import { formatRuleSummarySentence } from '../../lib/insightRuleSummaryText';

export function RuleSummaryAside({ state }: { state: BuilderState }) {
    const { t, i18n } = useTranslation();
    const rtl = i18n.dir() === 'rtl';

    const sentence = formatRuleSummarySentence(t, state);

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
                <p className="text-slate-800 leading-relaxed">{sentence}</p>
            </div>
            {(state.output.messageEn.trim() || state.output.messageHe.trim()) && (
                <div className="border-t border-slate-200 pt-2 text-xs text-slate-600 space-y-1">
                    {state.output.messageEn.trim() && (
                        <p className="line-clamp-3" dir="ltr">
                            EN: {state.output.messageEn}
                        </p>
                    )}
                    {state.output.messageHe.trim() && (
                        <p className="line-clamp-3" dir="rtl">
                            HE: {state.output.messageHe}
                        </p>
                    )}
                </div>
            )}
            <p className="text-xs text-slate-500">{t('insight_rules.summary_test_hint')}</p>
        </aside>
    );
}
