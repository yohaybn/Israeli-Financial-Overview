import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../Modal';

/** "n / m" progress label shared by all startup wizards. */
export function wizardProgressLabel(stepIndex: number, stepCount: number): string {
    return `${Math.min(Math.max(1, stepIndex + 1), stepCount)} / ${stepCount}`;
}

interface WizardShellProps {
    /** id applied to the title heading and used as the dialog label. */
    titleId: string;
    /** Small uppercase badge in the header (e.g. t('onboarding.badge')). */
    badge: string;
    stepIndex: number;
    stepCount: number;
    /** X-button handler (continue later / skip-all). */
    onClose: () => void;
    closeLabel: string;
    icon: ReactNode;
    title: string;
    body: string;
    error?: string | null;
    /** Step-specific content between the intro and the footer. */
    children?: ReactNode;
    /** Footer navigation buttons. */
    footer: ReactNode;
    footerHint?: string;
}

/**
 * Shared shell for the modal startup wizards (OnboardingWizard,
 * PersonaOnboardingWizard): header with badge + progress + close, intro
 * row with icon/title/body, error banner, step content, footer nav and
 * hint. Built on the accessible Modal, so Escape/backdrop/focus handling
 * come for free.
 */
export function WizardShell({
    titleId,
    badge,
    stepIndex,
    stepCount,
    onClose,
    closeLabel,
    icon,
    title,
    body,
    error,
    children,
    footer,
    footerHint,
}: WizardShellProps) {
    return (
        <Modal
            labelledBy={titleId}
            zIndex={100}
            overlayClassName="p-4 bg-slate-900/60 backdrop-blur-sm"
            panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col"
            closeOnBackdrop={false}
        >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">{badge}</span>
                    <span className="text-xs font-bold text-slate-500 truncate">{wizardProgressLabel(stepIndex, stepCount)}</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    title={closeLabel}
                    aria-label={closeLabel}
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="p-6 space-y-5">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">{icon}</div>
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="text-xl font-black text-slate-900 leading-tight">
                            {title}
                        </h2>
                        <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">{body}</p>
                    </div>
                </div>

                {error && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
                )}

                {children}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center gap-2 justify-between bg-slate-50/80 rounded-b-2xl shrink-0">
                {footer}
            </div>

            {footerHint && <p className="px-6 pb-4 text-center text-[11px] text-slate-400">{footerHint}</p>}
        </Modal>
    );
}
