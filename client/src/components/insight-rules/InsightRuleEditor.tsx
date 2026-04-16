import { useTranslation } from 'react-i18next';
import type { BuilderState } from '@app/shared';
import { IfConditionsSection } from './IfConditionsSection';
import { InsightRulesEngineReference } from './InsightRulesEngineReference';
import { RuleSummaryAside } from './RuleSummaryAside';
import { ThenOutputSection } from './ThenOutputSection';

export function InsightRuleEditor({
    state,
    onChange,
    disabled,
}: {
    state: BuilderState;
    onChange: (next: BuilderState) => void;
    disabled?: boolean;
}) {
    const { t, i18n } = useTranslation();
    const rtl = i18n.dir() === 'rtl';

    return (
        <div className="space-y-4" dir={rtl ? 'rtl' : 'ltr'}>
            <InsightRulesEngineReference />

            <div>
                <label htmlFor="rule-strategy-desc" className="text-xs font-bold text-gray-500 uppercase">
                    {t('insight_rules.strategy_description')}
                </label>
                <textarea
                    id="rule-strategy-desc"
                    rows={2}
                    disabled={disabled}
                    value={state.description}
                    onChange={(e) => onChange({ ...state, description: e.target.value })}
                    placeholder={t('insight_rules.strategy_placeholder')}
                    className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                />
            </div>

            <div className={`flex flex-col gap-6 lg:gap-8 ${rtl ? 'lg:flex-row-reverse' : 'lg:flex-row'}`}>
                <div className="min-w-0 flex-1 space-y-6">
                    <IfConditionsSection state={state} onChange={onChange} disabled={disabled} />
                    <ThenOutputSection state={state} onChange={onChange} disabled={disabled} />
                </div>
                <div className="shrink-0 lg:w-80">
                    <RuleSummaryAside state={state} />
                </div>
            </div>
        </div>
    );
}
