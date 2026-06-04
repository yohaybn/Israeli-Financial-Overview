import type { ReactNode } from 'react';

interface ToggleSwitchProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    label: ReactNode;
    description?: ReactNode;
    className?: string;
}

export function ToggleSwitch({ checked, onChange, disabled, label, description, className = '' }: ToggleSwitchProps) {
    return (
        <label className={`flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 ${className}`}>
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">{label}</span>
                {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
            </span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    checked ? 'bg-blue-600' : 'bg-slate-300'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
                <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        checked ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                />
            </button>
        </label>
    );
}
