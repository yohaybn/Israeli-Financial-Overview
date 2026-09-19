import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export interface ConfirmDangerDialogProps {
    open: boolean;
    /** What is about to happen, e.g. t('maintenance.reload_title'). */
    title: string;
    /** The consequence, stated plainly: what is overwritten or deleted and whether it can be undone. */
    description: string;
    /** Label for the destructive button; should name the action, not a generic "OK". */
    confirmLabel: string;
    cancelLabel?: string;
    /** Disables both buttons and blocks Escape/backdrop close while the action runs. */
    isPending?: boolean;
    zIndex?: number;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Shared confirmation dialog for destructive settings actions. Replaces
 * window.confirm with an accessible dialog that states the consequence and
 * labels the confirm button with the actual action. Initial focus lands on
 * Cancel so Enter/Space never fires the destructive path by accident.
 */
export function ConfirmDangerDialog({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    isPending = false,
    zIndex = 70,
    onConfirm,
    onCancel,
}: ConfirmDangerDialogProps) {
    const { t } = useTranslation();
    const titleId = useId();
    const cancelRef = useRef<HTMLButtonElement>(null);

    if (!open) return null;

    return (
        <Modal
            onClose={isPending ? undefined : onCancel}
            labelledBy={titleId}
            zIndex={zIndex}
            overlayClassName="p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            panelClassName="bg-white rounded-2xl shadow-xl border border-red-100 max-w-md w-full animate-in zoom-in-95 duration-200"
            initialFocusRef={cancelRef}
        >
            <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-red-100 shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <h2 id={titleId} className="text-lg font-bold text-gray-900">
                            {title}
                        </h2>
                        <p className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-line">{description}</p>
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onCancel}
                        disabled={isPending}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                    >
                        {cancelLabel ?? t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isPending}
                        className="px-5 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                    >
                        {isPending && (
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden>
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                        )}
                        {isPending ? t('common.loading') : confirmLabel}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
