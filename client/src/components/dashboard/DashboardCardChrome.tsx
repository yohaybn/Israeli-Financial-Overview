import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

/** Outer shell for dashboard section cards (Income, Spending, Subscriptions, Transactions). */
export const dashboardCardShellClass =
    'bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden relative group min-w-0';

export interface DashboardCardHeaderProps {
    collapsed: boolean;
    onToggle: () => void;
    icon: ReactNode;
    /** Tailwind classes for the gradient icon tile (include shadow-* matching brand). */
    iconTileClassName: string;
    title: ReactNode;
    subtitle?: ReactNode;
    /** Extra controls before the collapse chevron (e.g. View all, info) — use stopPropagation on clicks. */
    endActions?: ReactNode;
}

/**
 * Shared collapsible card header.
 * English: [ icon | title + subtitle ] … [ endActions | chevron ]
 * Hebrew: [ chevron | endActions ] … [ title + subtitle | icon ] (controls at start, content at end)
 */
export function DashboardCardHeader({
    collapsed,
    onToggle,
    icon,
    iconTileClassName,
    title,
    subtitle,
    endActions,
}: DashboardCardHeaderProps) {
    const { i18n } = useTranslation();
    const isHebrew = i18n.language === 'he' || i18n.language.startsWith('he-');

    const iconTile = (
        <div
            className={clsx(
                'w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform duration-300',
                iconTileClassName
            )}
        >
            {icon}
        </div>
    );

    const textBlock = (
        <div className={clsx('min-w-0 flex-1', isHebrew && 'text-end')}>
            <div className="text-base sm:text-lg font-black text-gray-800 tracking-tight truncate">{title}</div>
            {subtitle != null && <div className="text-xs text-gray-500 mt-0.5 min-w-0">{subtitle}</div>}
        </div>
    );

    const chevron = (
        <ChevronDown
            className={clsx(
                'w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0',
                collapsed ? '-rotate-90' : 'rotate-0'
            )}
            aria-hidden
        />
    );

    const controls = (
        <div className="flex items-center gap-2 shrink-0">
            {isHebrew ? (
                <>
                    {chevron}
                    {endActions}
                </>
            ) : (
                <>
                    {endActions}
                    {chevron}
                </>
            )}
        </div>
    );

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onToggle}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle();
                }
            }}
            aria-expanded={!collapsed}
            className="w-full text-start p-6 sm:p-8 hover:bg-white/40 transition-colors cursor-pointer"
        >
            <div className="flex items-center justify-between gap-3 sm:gap-4 w-full min-w-0">
                {isHebrew ? (
                    <>
                        {controls}
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 justify-end">
                            {textBlock}
                            {iconTile}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                            {iconTile}
                            {textBlock}
                        </div>
                        {controls}
                    </>
                )}
            </div>
        </div>
    );
}
