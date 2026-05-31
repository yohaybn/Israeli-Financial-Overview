import { useTranslation } from 'react-i18next';
import { ScheduleEditor } from '../ScheduleEditor';
import { ProviderIcon } from '../ProfileManager';
import { CollapsibleCard } from '../CollapsibleCard';
import { useSchedulerSettings } from './schedulerSettingsModel';

const SCHED_LABEL = 'block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2';
const SCHED_ACCENT = '#006d3c';

function SchedulerSaveStatus() {
    const { t } = useTranslation();
    const { isUpdating, successMessage } = useSchedulerSettings();

    if (!isUpdating && !successMessage) return null;

    return (
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: SCHED_ACCENT }}>
            {isUpdating && (
                <>
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" aria-hidden>
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    {t('common.saving')}
                </>
            )}
            {successMessage && (
                <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    {t('common.saved')}
                </>
            )}
        </div>
    );
}

/** Scrape schedule — embedded inside the scrape card on the Scrape page. */
export function ScrapeSchedulerSection({ embedded = false }: { embedded?: boolean }) {
    const { t } = useTranslation();
    const {
        isLoading,
        enabled,
        setEnabled,
        scrapeOnceOnUnlockOrStartup,
        setScrapeOnceOnUnlockOrStartup,
        scrapeSchedule,
        patchScrape,
        selectedProfiles,
        toggleProfile,
        getProviderName,
        profiles,
    } = useSchedulerSettings();

    if (isLoading) {
        return <div className="text-sm text-gray-500 py-3">{t('scheduler.loading')}</div>;
    }

    return (
        <div className={`${embedded ? 'border-t border-gray-100 pt-4 mt-4' : ''} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-gray-900">{t('scheduler.title')}</h4>
                <div className="flex items-center gap-3 shrink-0">
                    <SchedulerSaveStatus />
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        dir="ltr"
                        onClick={() => setEnabled(!enabled)}
                        className={`relative inline-flex h-7 w-[3.25rem] shrink-0 items-center justify-start overflow-hidden rounded-full transition-colors ${
                            enabled ? '' : 'bg-gray-300'
                        }`}
                        style={enabled ? { backgroundColor: SCHED_ACCENT } : undefined}
                    >
                        <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                enabled ? 'translate-x-7' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
            </div>

            <div className={`space-y-4 transition-opacity duration-200 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <ScheduleEditor value={scrapeSchedule} onChange={patchScrape} />

                <div className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 items-start">
                    <input
                        id="scheduler-scrape-on-unlock"
                        type="checkbox"
                        checked={scrapeOnceOnUnlockOrStartup}
                        onChange={(e) => setScrapeOnceOnUnlockOrStartup(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600"
                    />
                    <label htmlFor="scheduler-scrape-on-unlock" className="text-xs text-gray-800 cursor-pointer select-none">
                        <span className="font-semibold">{t('scheduler.scrape_on_unlock_title')}</span>
                        <span className="block mt-1 text-gray-600 leading-snug">{t('scheduler.scrape_on_unlock_description')}</span>
                    </label>
                </div>

                <div>
                    <label className={`${SCHED_LABEL} mb-2`}>{t('scheduler.profiles')}</label>
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                        {profiles?.map((profile) => {
                            const selected = selectedProfiles.includes(profile.id);
                            return (
                                <button
                                    key={profile.id}
                                    type="button"
                                    onClick={() => toggleProfile(profile.id)}
                                    className={`p-2.5 rounded-lg border text-left transition-all flex items-center gap-2.5 w-full ${
                                        selected
                                            ? 'border-emerald-700 bg-emerald-50/40 ring-1 ring-emerald-700'
                                            : 'border-gray-200 bg-gray-50 hover:border-emerald-700/35'
                                    }`}
                                >
                                    <div className={`p-1.5 rounded-md shrink-0 ${selected ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                                        <ProviderIcon companyId={profile.companyId} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-xs text-gray-900 truncate">{profile.name}</div>
                                        <div className="text-[10px] text-gray-500 truncate">{getProviderName(profile.companyId)}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Backup + insight-rules timers — Configuration → Scheduler tab. */
export function AuxiliarySchedulerSections({ isInline = false }: { isInline?: boolean }) {
    const { t, i18n } = useTranslation();
    const {
        isLoading,
        isUpdating,
        successMessage,
        config,
        backupEnabled,
        setBackupEnabled,
        backupDestination,
        setBackupDestination,
        backupSchedule,
        patchBackup,
        insightRulesTimerEnabled,
        setInsightRulesTimerEnabled,
        insightRulesTimerSchedule,
        patchInsightRulesTimer,
    } = useSchedulerSettings();

    if (isLoading) {
        return <div className="p-4 text-sm text-gray-500">{t('scheduler.loading')}</div>;
    }

    const backupTitle = (
        <span className="flex items-center gap-2.5 text-[#1a2b3c]">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden>
                <path
                    stroke={SCHED_ACCENT}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
            </svg>
            {t('scheduler.backup_title')}
        </span>
    );

    const insightRulesTimerTitle = (
        <span className="flex items-center gap-2.5 text-[#1a2b3c]">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden>
                <path
                    stroke={SCHED_ACCENT}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
            </svg>
            {t('scheduler.insight_rules_timer_title')}
        </span>
    );

    const insightTimerLastRunText =
        config?.insightRulesSchedule?.lastRun &&
        t('scheduler.insight_rules_timer_last_run', {
            time: new Date(config.insightRulesSchedule.lastRun).toLocaleString(i18n.language, {
                dateStyle: 'medium',
                timeStyle: 'short',
            }),
        });

    return (
        <div className={`space-y-8 ${isInline ? '' : 'max-w-4xl mx-auto'}`}>
            <CollapsibleCard title={insightRulesTimerTitle} defaultOpen bodyClassName="px-6 pb-6 pt-0 space-y-6">
                <div className="flex items-center justify-end gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={insightRulesTimerEnabled}
                            dir="ltr"
                            onClick={() => setInsightRulesTimerEnabled(!insightRulesTimerEnabled)}
                            className={`relative inline-flex h-8 w-[3.75rem] shrink-0 items-center justify-start overflow-hidden rounded-full transition-colors ${
                                insightRulesTimerEnabled ? '' : 'bg-gray-300'
                            }`}
                            style={insightRulesTimerEnabled ? { backgroundColor: SCHED_ACCENT } : undefined}
                        >
                            <span
                                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                                    insightRulesTimerEnabled ? 'translate-x-9' : 'translate-x-1'
                                }`}
                            />
                        </button>
                        <span className="text-sm font-semibold text-[#1a2b3c] hidden sm:inline">
                            {insightRulesTimerEnabled ? t('common.enabled') : t('common.disabled')}
                        </span>
                    </div>
                </div>

                <p className="text-xs text-gray-500 leading-relaxed">{t('scheduler.insight_rules_timer_desc')}</p>

                <div
                    className={`space-y-6 transition-opacity duration-200 ${
                        insightRulesTimerEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
                    }`}
                >
                    <ScheduleEditor value={insightRulesTimerSchedule} onChange={patchInsightRulesTimer} />
                </div>

                {insightTimerLastRunText ? (
                    <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">{insightTimerLastRunText}</p>
                ) : null}

                <a
                    href="?view=configuration&tab=insight-rules"
                    className="inline-block text-xs font-semibold text-[#006d3c] hover:underline"
                >
                    {t('scheduler.insight_rules_configure_link')}
                </a>
            </CollapsibleCard>

            <CollapsibleCard title={backupTitle} defaultOpen bodyClassName="px-6 pb-6 pt-0 space-y-6">
                <div className="flex items-center justify-end gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={backupEnabled}
                            dir="ltr"
                            onClick={() => setBackupEnabled(!backupEnabled)}
                            className={`relative inline-flex h-8 w-[3.75rem] shrink-0 items-center justify-start overflow-hidden rounded-full transition-colors ${
                                backupEnabled ? '' : 'bg-gray-300'
                            }`}
                            style={backupEnabled ? { backgroundColor: SCHED_ACCENT } : undefined}
                        >
                            <span
                                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                                    backupEnabled ? 'translate-x-9' : 'translate-x-1'
                                }`}
                            />
                        </button>
                        <span className="text-sm font-semibold text-[#1a2b3c] hidden sm:inline">
                            {backupEnabled ? t('common.enabled') : t('common.disabled')}
                        </span>
                    </div>
                </div>

                <p className="text-xs text-gray-500 mb-6">{t('scheduler.backup_standalone_desc')}</p>

                <div className={`space-y-6 transition-opacity duration-200 ${backupEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                    <ScheduleEditor value={backupSchedule} onChange={patchBackup} />

                    <div>
                        <label className={SCHED_LABEL}>{t('scheduler.backup_destination')}</label>
                        <div className="relative">
                            <select
                                value={backupDestination}
                                onChange={(e) => setBackupDestination(e.target.value as 'local' | 'google-drive')}
                                className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1a2b3c] border-0 bg-[#f0f2f5] appearance-none pr-10 shadow-none outline-none transition-shadow focus:ring-2 focus:ring-[#006d3c]/25"
                            >
                                <option value="local">{t('scheduler.backup_local')}</option>
                                <option value="google-drive">{t('scheduler.backup_drive')}</option>
                            </select>
                            <svg
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>
            </CollapsibleCard>

            <CollapsibleCard title={t('scheduler.aboutTitle')} defaultOpen bodyClassName="px-6 pb-6 pt-0">
                <div className="bg-[#f0f2f5]/80 rounded-xl p-4 border border-gray-100">
                    <p className="text-gray-600 text-sm leading-relaxed">{t('scheduler.aboutDescription')}</p>
                </div>
            </CollapsibleCard>

            <div className={`flex items-center gap-3 ${isInline ? 'sticky bottom-0 bg-gray-50/80 backdrop-blur-sm py-4 border-t border-gray-200 -mx-6 px-6 z-10' : ''}`}>
                <div className="mr-auto flex items-center gap-3">
                    {isUpdating && (
                        <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: SCHED_ACCENT }}>
                            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" aria-hidden>
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                            {t('common.saving')}
                        </span>
                    )}
                    {successMessage && (
                        <span className="text-xs font-bold flex items-center gap-2" style={{ color: SCHED_ACCENT }}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            {t('common.saved')}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
