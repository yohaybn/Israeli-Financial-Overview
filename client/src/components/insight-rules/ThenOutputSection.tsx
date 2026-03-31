import { useTranslation } from 'react-i18next';
import type { BuilderState } from '@app/shared';

export function ThenOutputSection({
    state,
    onChange,
    disabled,
}: {
    state: BuilderState;
    onChange: (next: BuilderState) => void;
    disabled?: boolean;
}) {
    const { t } = useTranslation();
    const out = state.output;

    return (
        <section className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4" aria-labelledby="then-heading">
            <h3 id="then-heading" className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                {t('insight_rules.then_heading')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-gray-600">{t('insight_rules.outcome_kind')}</label>
                    <select
                        value={out.kind}
                        disabled={disabled}
                        onChange={(e) =>
                            onChange({
                                ...state,
                                output: { ...out, kind: e.target.value as 'insight' | 'alert' },
                            })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                    >
                        <option value="insight">{t('insight_rules.kind_insight')}</option>
                        <option value="alert">{t('insight_rules.kind_alert')}</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-600">{t('insight_rules.score')}</label>
                    <input
                        type="number"
                        min={1}
                        max={100}
                        disabled={disabled}
                        value={out.score}
                        onChange={(e) =>
                            onChange({
                                ...state,
                                output: {
                                    ...out,
                                    score: Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)),
                                },
                            })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                    />
                </div>
            </div>
            <div>
                <label className="text-xs font-medium text-gray-600">{t('insight_rules.message_en')}</label>
                <textarea
                    rows={3}
                    disabled={disabled}
                    value={out.messageEn}
                    onChange={(e) => onChange({ ...state, output: { ...out, messageEn: e.target.value } })}
                    placeholder={t('insight_rules.message_placeholder_hint')}
                    className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm font-sans"
                    spellCheck
                />
            </div>
            <div>
                <label className="text-xs font-medium text-gray-600">{t('insight_rules.message_he')}</label>
                <textarea
                    rows={3}
                    disabled={disabled}
                    dir="rtl"
                    value={out.messageHe}
                    onChange={(e) => onChange({ ...state, output: { ...out, messageHe: e.target.value } })}
                    placeholder={t('insight_rules.message_placeholder_hint')}
                    className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm font-sans"
                    spellCheck
                />
            </div>
        </section>
    );
}
