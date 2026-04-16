import { useTranslation } from 'react-i18next';
import { InsightRuleForm } from './InsightRuleForm';
import type { InsightRuleFormCreateSeed } from './insightRuleFormTypes';

export function InsightRuleCreateRuleModal({
    open,
    instanceKey,
    createSeed,
    showAiDraftSection = false,
    onClose,
    onSaved,
    onInvalidate,
}: {
    open: boolean;
    instanceKey: string;
    createSeed: InsightRuleFormCreateSeed;
    showAiDraftSection?: boolean;
    onClose: () => void;
    onSaved: () => void;
    onInvalidate: () => void;
}) {
    const { t } = useTranslation();
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="insight-rule-create-modal-title"
        >
            <div className="max-h-[92vh] w-full max-w-3xl flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                <div className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
                    <div>
                        <h2 id="insight-rule-create-modal-title" className="text-lg font-semibold text-gray-900">
                            {t('insight_rules.community_import_modal_title')}
                        </h2>
                        <p className="text-xs text-gray-600 mt-1">{t('insight_rules.community_import_modal_hint')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
                        aria-label={t('common.close')}
                    >
                        ×
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <InsightRuleForm
                        mode="create"
                        editRule={null}
                        createSeed={createSeed}
                        instanceKey={instanceKey}
                        showAiDraftSection={showAiDraftSection}
                        onCancel={onClose}
                        onSuccess={onSaved}
                        onInvalidate={onInvalidate}
                    />
                </div>
            </div>
        </div>
    );
}
