import { useTranslation } from 'react-i18next';
import { useServerActivity } from '../contexts/ServerActivityContext';

/**
 * Compact AI / scrape activity chips for the main header. Renders nothing when idle.
 */
export function TopBarActivityIndicators() {
  const { t } = useTranslation();
  const { activity } = useServerActivity();

  if (!activity.aiActive && !activity.scrapeActive) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-1.5 flex-shrink-0"
      role="status"
      aria-live="polite"
      aria-label={t('ai_logs.topbar_activity_aria')}
    >
      {activity.aiActive && (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-medium border bg-violet-50 text-violet-800 border-violet-200"
          title={t('ai_logs.ai_running')}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-600" />
          </span>
          <span className="whitespace-nowrap">{t('ai_logs.topbar_ai')}</span>
        </span>
      )}
      {activity.scrapeActive && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('show-scrape-progress'))}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-medium border bg-amber-50 text-amber-900 border-amber-200 cursor-pointer hover:bg-amber-100/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          title={t('ai_logs.topbar_scrape_show_progress')}
          aria-label={t('ai_logs.topbar_scrape_show_progress')}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-600" />
          </span>
          <span className="whitespace-nowrap">{t('ai_logs.topbar_scrape')}</span>
        </button>
      )}
    </div>
  );
}
