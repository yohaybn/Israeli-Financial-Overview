import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    extractInsightRuleImportTuningSlots,
    type InsightRuleImportTuningSlot,
    type InsightRulesExportDocument,
} from '@app/shared';

export function InsightRuleImportReviewModal({
    doc,
    values,
    onChangeSlot,
    onClose,
    onConfirm,
    busy,
}: {
    doc: InsightRulesExportDocument;
    values: Record<string, Record<string, string>>;
    onChangeSlot: (ruleId: string, slotId: string, value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
    busy: boolean;
}) {
    const { t } = useTranslation();

    const slotsByRule = useMemo(() => {
        const m = new Map<string, InsightRuleImportTuningSlot[]>();
        for (const r of doc.rules) {
            m.set(r.id, extractInsightRuleImportTuningSlots(r.definition));
        }
        return m;
    }, [doc.rules]);

    const totalSlots = useMemo(() => {
        let n = 0;
        for (const r of doc.rules) {
            n += slotsByRule.get(r.id)?.length ?? 0;
        }
        return n;
    }, [doc.rules, slotsByRule]);

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-review-title"
        >
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
                    <div>
                        <h2 id="import-review-title" className="text-lg font-semibold text-gray-900">
                            {t('insight_rules.import_review_title')}
                        </h2>
                        <p className="text-xs text-gray-600 mt-1">{t('insight_rules.import_review_hint')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                        aria-label={t('common.close')}
                    >
                        ×
                    </button>
                </div>
                <div className="p-4 space-y-6">
                    {totalSlots === 0 && (
                        <p className="text-sm text-gray-600">{t('insight_rules.import_review_no_slots')}</p>
                    )}
                    {doc.rules.map((r) => {
                        const slots = slotsByRule.get(r.id) ?? [];
                        if (slots.length === 0) return null;
                        const rowVals = values[r.id] ?? {};
                        return (
                            <div key={r.id} className="rounded-lg border border-gray-100 p-3 space-y-2">
                                <p className="text-sm font-medium text-gray-900">{r.name}</p>
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="text-left text-gray-500 border-b border-gray-100">
                                            <th className="py-1 pr-2 font-medium">{t('insight_rules.import_review_field')}</th>
                                            <th className="py-1 font-medium">{t('insight_rules.import_review_value')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {slots.map((s) => (
                                            <tr key={s.id} className="border-b border-gray-50 align-top">
                                                <td className="py-2 pr-2 text-gray-700 whitespace-pre-wrap">{s.label}</td>
                                                <td className="py-2">
                                                    <input
                                                        type="text"
                                                        value={rowVals[s.id] ?? s.initialValue}
                                                        onChange={(e) => onChangeSlot(r.id, s.id, e.target.value)}
                                                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm font-mono"
                                                        spellCheck={false}
                                                    />
                                                    <span className="text-[10px] text-gray-400 block mt-0.5">
                                                        {t(`insight_rules.import_slot_kind_${s.kind}`)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-4 py-3">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onConfirm}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-50"
                    >
                        {busy ? t('common.loading') : t('insight_rules.import_review_confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
}
