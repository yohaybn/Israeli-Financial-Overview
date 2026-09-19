import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface DangerZoneProps {
    /** Optional heading row with a warning icon. Omit when the surrounding card already titles the section. */
    title?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
}

/**
 * Consistent container for destructive settings actions: red-tinted panel so
 * irreversible operations are visually separated from regular save controls.
 */
export function DangerZone({ title, description, children }: DangerZoneProps) {
    return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-4">
            {(title || description) && (
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden />
                    <div className="min-w-0">
                        {title ? <p className="text-sm font-bold text-red-900">{title}</p> : null}
                        {description ? (
                            <p className="text-sm text-red-800/90 mt-1 leading-relaxed whitespace-pre-line">{description}</p>
                        ) : null}
                    </div>
                </div>
            )}
            {children}
        </div>
    );
}

export interface DangerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** md: solid red primary action inside a DangerZone. sm: small outlined action inline in lists. */
    size?: 'sm' | 'md';
    fullWidth?: boolean;
    isPending?: boolean;
}

/** Consistent red button for destructive actions, with a built-in pending spinner. */
export function DangerButton({
    size = 'md',
    fullWidth = false,
    isPending = false,
    className = '',
    children,
    disabled,
    type = 'button',
    ...rest
}: DangerButtonProps) {
    const sizeClasses =
        size === 'sm'
            ? 'px-3 py-1.5 rounded-lg text-xs bg-white text-red-700 border border-red-300 hover:bg-red-50 disabled:opacity-40'
            : 'px-5 py-2.5 rounded-xl text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50';
    return (
        <button
            type={type}
            disabled={disabled || isPending}
            className={`${sizeClasses} ${fullWidth ? 'w-full' : ''} font-bold transition-colors inline-flex items-center justify-center gap-2 ${className}`}
            {...rest}
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
            {children}
        </button>
    );
}
