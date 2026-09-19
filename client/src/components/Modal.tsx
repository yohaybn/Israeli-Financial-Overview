import { useEffect, useId, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

// Mounted modals so only the topmost dialog reacts to Escape/Tab when modals
// are layered (e.g. a confirm dialog above an edit dialog). Effects mount
// bottom-up, so order is resolved by DOM containment, not push order.
const modalStack: { symbol: symbol; el: HTMLElement }[] = [];

function topmostSymbol(): symbol | undefined {
    let top: symbol | undefined;
    for (const entry of modalStack) {
        const containsOther = modalStack.some((other) => other !== entry && entry.el.contains(other.el));
        if (!containsOther) top = entry.symbol;
    }
    return top;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
        if (el.closest('[hidden]')) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

export interface ModalProps {
    /** Called on Escape and (unless closeOnBackdrop=false) on backdrop click. Omit for a blocking dialog. */
    onClose?: () => void;
    /** id of the element labelling the dialog (usually its heading). */
    labelledBy?: string;
    /** Accessible name when there is no visible heading element. */
    label?: string;
    /** Stacking order; dialogs in the app use z-50..z-[120]. */
    zIndex?: number;
    /** Extra classes for the overlay (backdrop color, padding, animations). */
    overlayClassName?: string;
    /** Classes for the dialog panel itself (replaces the inner content wrapper). */
    panelClassName?: string;
    /** Close when the backdrop is clicked. Default true when onClose is provided. */
    closeOnBackdrop?: boolean;
    /** Focus this element first instead of the first focusable element. */
    initialFocusRef?: React.RefObject<HTMLElement | null>;
    children: ReactNode;
}

/**
 * Shared accessible modal: role="dialog" + aria-modal, Escape to close,
 * focus trap with initial focus and focus restore, and body scroll lock.
 * Only the topmost mounted Modal handles keyboard input.
 */
export function Modal({
    onClose,
    labelledBy,
    label,
    zIndex = 50,
    overlayClassName = '',
    panelClassName = '',
    closeOnBackdrop,
    initialFocusRef,
    children,
}: ModalProps) {
    const id = useId();
    const idRef = useRef(Symbol(id));
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const allowBackdropClose = closeOnBackdrop ?? Boolean(onClose);

    useEffect(() => {
        const symbol = idRef.current;
        const dialog = dialogRef.current;
        if (dialog) modalStack.push({ symbol, el: dialog });
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const initialTarget = initialFocusRef?.current;
        if (initialTarget) {
            initialTarget.focus();
        } else if (dialog) {
            const focusables = getFocusable(dialog);
            (focusables[0] ?? dialog).focus();
        }

        const isTopmost = () => topmostSymbol() === symbol;

        const onKeyDown = (event: KeyboardEvent) => {
            if (!isTopmost() || !dialogRef.current) return;
            if (event.key === 'Escape') {
                if (onCloseRef.current) {
                    event.preventDefault();
                    onCloseRef.current();
                }
                return;
            }
            if (event.key === 'Tab') {
                const focusables = getFocusable(dialogRef.current);
                if (focusables.length === 0) {
                    event.preventDefault();
                    dialogRef.current.focus();
                    return;
                }
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                const active = document.activeElement;
                if (event.shiftKey) {
                    if (active === first || !dialogRef.current.contains(active)) {
                        event.preventDefault();
                        last.focus();
                    }
                } else if (active === last || !dialogRef.current.contains(active)) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            const index = modalStack.findIndex((entry) => entry.symbol === symbol);
            if (index !== -1) modalStack.splice(index, 1);
            document.removeEventListener('keydown', onKeyDown, true);
            document.body.style.overflow = previousOverflow;
            previouslyFocused?.focus?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleOverlayClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (allowBackdropClose && onClose && event.target === event.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className={`fixed inset-0 flex items-center justify-center ${overlayClassName}`}
            style={{ zIndex }}
            onClick={handleOverlayClick}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                aria-label={label}
                tabIndex={-1}
                className={panelClassName}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
