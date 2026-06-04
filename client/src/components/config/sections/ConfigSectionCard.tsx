import type { ReactNode } from 'react';

interface ConfigSectionCardProps {
    title: string;
    subtitle: string;
    children: ReactNode;
    className?: string;
}

export function ConfigSectionCard({ title, subtitle, children, className = '' }: ConfigSectionCardProps) {
    return (
        <section className={`p-6 bg-white rounded-xl border border-slate-100 shadow-sm space-y-4 ${className}`}>
            <header className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
                <p className="text-sm text-slate-500">{subtitle}</p>
            </header>
            {children}
        </section>
    );
}
