import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface CollapsibleCardProps {
    title: ReactNode;
    subtitle?: ReactNode;
    /** Optional controls in the header row (e.g. toggle). Must not be nested inside the title button — use this slot. */
    headerExtra?: ReactNode;
    /** When false, body is hidden until expanded */
    defaultOpen?: boolean;
    children: ReactNode;
    className?: string;
    /** Card body padding — default matches configuration panels */
    bodyClassName?: string;
}

export function CollapsibleCard({
    title,
    subtitle,
    headerExtra,
    defaultOpen = true,
    children,
    className = '',
    bodyClassName = 'p-6 pt-0',
}: CollapsibleCardProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(defaultOpen);
    const id = useId();
    const panelId = `${id}-panel`;
    const toggle = () => setOpen((o) => !o);

    return (
        <section
            className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`}
        >
            <div className="flex items-start justify-between gap-2 sm:gap-3 p-6 pb-3 rounded-t-2xl hover:bg-gray-50/80 transition-colors">
                <button
                    type="button"
                    className="min-w-0 flex-1 text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-lg -m-1 p-1"
                    aria-expanded={open}
                    aria-controls={panelId}
                    aria-label={open ? t('common.collapse_section') : t('common.expand_section')}
                    onClick={toggle}
                >
                    <div className="font-bold text-gray-800 text-base">{title}</div>
                    {subtitle && <div className="text-xs text-gray-500 mt-1 text-start">{subtitle}</div>}
                </button>
                {headerExtra != null && (
                    <div className="shrink-0 flex items-center gap-2 self-center pt-0.5">{headerExtra}</div>
                )}
                <button
                    type="button"
                    className="shrink-0 mt-0.5 p-1 rounded-lg text-gray-500 hover:bg-gray-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    aria-expanded={open}
                    aria-controls={panelId}
                    aria-label={open ? t('common.collapse_section') : t('common.expand_section')}
                    onClick={toggle}
                >
                    <svg
                        className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>
            {open && (
                <div id={panelId} className={bodyClassName}>
                    {children}
                </div>
            )}
        </section>
    );
}
