import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { useServerHealth } from '../hooks/useServerHealth';

/**
 * Bold warning in the main header when the API health check fails (server down, restart needed, etc.).
 */
export function TopBarServerStatus() {
    const { t } = useTranslation();
    const { isError } = useServerHealth();

    if (!isError) {
        return null;
    }

    return (
        <div
            className="flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-md border border-red-300 bg-red-50 text-red-900 shadow-sm"
            role="alert"
            aria-live="assertive"
            title={t('common.server_unreachable_hint')}
        >
            <WifiOff className="w-4 h-4 shrink-0 text-red-700" strokeWidth={2.25} aria-hidden />
            <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wide whitespace-nowrap truncate">
                {t('common.server_unreachable')}
            </span>
        </div>
    );
}
