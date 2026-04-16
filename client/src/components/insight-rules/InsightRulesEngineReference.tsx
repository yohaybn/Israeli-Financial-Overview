import { useTranslation } from 'react-i18next';
import { INSIGHT_RULE_MESSAGE_PLACEHOLDER_KEYS } from '@app/shared';

/** Kept in code (not i18n) so braces are not eaten by interpolation. */
const ENGINE_JSON_EXAMPLE = `{
  "version": 1,
  "scope": "current_month",
  "condition": {
    "op": "shareOfCategoryGte",
    "category": "מזון",
    "share": 0.35
  },
  "output": {
    "kind": "insight",
    "score": 70,
    "message": {
      "en": "Food is {{pct_of_total}}% of spending in {{period_label}} ({{sum}} {{currency}}).",
      "he": "מזון מהווה {{pct_of_total}}% מההוצאות ב-{{period_label}} ({{sum}} {{currency}})."
    }
  }
}`;

export function InsightRulesEngineReference() {
    const { t, i18n } = useTranslation();
    const rtl = i18n.dir() === 'rtl';

    return (
        <details
            className="rounded-xl border border-slate-200 bg-white text-sm"
            dir={rtl ? 'rtl' : 'ltr'}
        >
            <summary className="cursor-pointer select-none px-4 py-3 font-medium text-slate-800">
                {t('insight_rules.engine_reference_title')}
            </summary>
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4 text-slate-700">
                <p className="text-xs text-slate-600">{t('insight_rules.engine_reference_intro')}</p>
                <div>
                    <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-2">
                        {t('insight_rules.engine_reference_placeholders')}
                    </p>
                    <ul className="space-y-1.5 text-xs">
                        {INSIGHT_RULE_MESSAGE_PLACEHOLDER_KEYS.map((key) => (
                            <li key={key} className="flex flex-wrap gap-x-2 gap-y-0.5">
                                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-900">{`{{${key}}}`}</code>
                                <span className="text-slate-600">{t(`insight_rules.ph_desc_${key}`)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-2">
                        {t('insight_rules.engine_reference_conditions')}
                    </p>
                    <p className="text-xs text-slate-600 mb-2">{t('insight_rules.engine_reference_conditions_hint')}</p>
                    <pre className="max-h-56 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap break-all">
                        {ENGINE_JSON_EXAMPLE}
                    </pre>
                </div>
            </div>
        </details>
    );
}
