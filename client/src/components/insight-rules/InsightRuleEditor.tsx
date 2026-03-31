import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { builderStateToDefinition } from '@app/shared';
import type { BuilderState } from '@app/shared';
import { IfConditionsSection } from './IfConditionsSection';
import { RuleSummaryAside } from './RuleSummaryAside';
import { ThenOutputSection } from './ThenOutputSection';

export function InsightRuleEditor({
    state,
    onChange,
    disabled,
    showJsonPreview,
}: {
    state: BuilderState;
    onChange: (next: BuilderState) => void;
    disabled?: boolean;
    /** Show collapsible “maps to JSON” block (v1). */
    showJsonPreview?: boolean;
}) {
    const { t, i18n } = useTranslation();
    const rtl = i18n.dir() === 'rtl';
    const preview = useMemo(() => JSON.stringify(builderStateToDefinition(state), null, 2), [state]);

    return (
        <div className="space-y-4" dir={rtl ? 'rtl' : 'ltr'}>
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

            {showJsonPreview && (
                <details className="rounded-lg border border-gray-200 bg-white text-xs">
                    <summary className="cursor-pointer select-none px-3 py-2 font-medium text-gray-600">
                        {t('insight_rules.maps_to_json')}
                    </summary>
                    <pre className="max-h-48 overflow-auto border-t border-gray-100 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                        {preview}
                    </pre>
                </details>
            )}
        </div>
    );
}
