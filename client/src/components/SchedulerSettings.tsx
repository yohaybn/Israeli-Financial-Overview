import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSchedulerConfig, useUpdateSchedulerConfig } from '../hooks/useScraper';
import { useProfiles } from '../hooks/useProfiles';
import { useProviders, getProviderDisplayName } from '../hooks/useProviders';
import { ScheduleEditor, type ScheduleEditorValue } from './ScheduleEditor';
import { ProviderIcon } from './ProfileManager';
import { CollapsibleCard } from './CollapsibleCard';

const SCHED_LABEL = 'block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2';
const SCHED_ACCENT = '#006d3c';

function todayLocalISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const emptySchedule = (): ScheduleEditorValue => ({
    scheduleType: 'daily',
    runTime: '08:00',
    weekdays: [1],
    monthDays: [1],
    intervalDays: 3,
    intervalAnchorDate: todayLocalISO(),
    customCron: '0 8 * * *'
});

export function SchedulerSettings({ isInline = false }: { isInline?: boolean }) {
    const { t, i18n } = useTranslation();
    const { data: config, isLoading } = useSchedulerConfig();
    const { mutate: updateConfig, isPending: isUpdating } = useUpdateSchedulerConfig();
    const { data: profiles } = useProfiles();
    const { data: providers } = useProviders();

    const getProviderName = (companyId: string) => getProviderDisplayName(companyId, providers, i18n.language);

    const [enabled, setEnabled] = useState(false);
    const [scrapeSchedule, setScrapeSchedule] = useState<ScheduleEditorValue>(emptySchedule);

    const [backupEnabled, setBackupEnabled] = useState(false);
    const [backupDestination, setBackupDestination] = useState<'local' | 'google-drive'>('local');
    const [backupSchedule, setBackupSchedule] = useState<ScheduleEditorValue>(() => ({
        ...emptySchedule(),
        runTime: '09:00',
        customCron: '0 9 * * *'
    }));

    const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
    const [successMessage, setSuccessMessage] = useState(false);
    const lastSerializedRef = useRef<string | null>(null);

    const patchScrape = (patch: Partial<ScheduleEditorValue>) => {
        setScrapeSchedule((prev) => ({ ...prev, ...patch }));
    };

    const patchBackup = (patch: Partial<ScheduleEditorValue>) => {
        setBackupSchedule((prev) => ({ ...prev, ...patch }));
    };

    useLayoutEffect(() => {
        if (!config) return;

        setEnabled(config.enabled ?? false);
        const parts = config.cronExpression?.split(' ') || [];
        const scrapeRunTime =
            config.runTime ??
            (parts.length >= 2 ? `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}` : '08:00');
        setScrapeSchedule({
            scheduleType: config.scheduleType ?? 'daily',
            runTime: scrapeRunTime,
            weekdays: config.weekdays?.length ? [...config.weekdays].sort((a, b) => a - b) : [1],
            monthDays: config.monthDays?.length ? [...config.monthDays].sort((a, b) => a - b) : [1],
            intervalDays: config.intervalDays ?? 3,
            intervalAnchorDate: config.intervalAnchorDate ?? todayLocalISO(),
            customCron: config.cronExpression ?? '0 8 * * *'
        });

        const b = config.backupSchedule;
        setBackupEnabled(b?.enabled ?? false);
        setBackupDestination(b?.destination === 'google-drive' ? 'google-drive' : 'local');
        const bp = b?.cronExpression?.split(' ') || [];
        const backupRunTime =
            b?.runTime ?? (bp.length >= 2 ? `${bp[1].padStart(2, '0')}:${bp[0].padStart(2, '0')}` : '09:00');
        setBackupSchedule({
            scheduleType: b?.scheduleType ?? 'daily',
            runTime: backupRunTime,
            weekdays: b?.weekdays?.length ? [...b.weekdays].sort((a, b) => a - b) : [1],
            monthDays: b?.monthDays?.length ? [...b.monthDays].sort((a, b) => a - b) : [1],
            intervalDays: b?.intervalDays ?? 3,
            intervalAnchorDate: b?.intervalAnchorDate ?? todayLocalISO(),
            customCron: b?.cronExpression ?? '0 9 * * *'
        });

        setSelectedProfiles(config.selectedProfiles || []);
        lastSerializedRef.current = null;
    }, [config]);

    const buildPayload = () => {
        const sw = scrapeSchedule.weekdays.length ? scrapeSchedule.weekdays : [1];
        const sm = scrapeSchedule.monthDays.length ? scrapeSchedule.monthDays : [1];
        const bw = backupSchedule.weekdays.length ? backupSchedule.weekdays : [1];
        const bm = backupSchedule.monthDays.length ? backupSchedule.monthDays : [1];
        return {
            enabled,
            scheduleType: scrapeSchedule.scheduleType,
            runTime: scrapeSchedule.runTime,
            selectedProfiles,
            ...(scrapeSchedule.scheduleType === 'weekly' ? { weekdays: sw } : {}),
            ...(scrapeSchedule.scheduleType === 'monthly' ? { monthDays: sm } : {}),
            ...(scrapeSchedule.scheduleType === 'interval_days'
                ? {
                      intervalDays: Math.max(1, scrapeSchedule.intervalDays),
                      intervalAnchorDate: scrapeSchedule.intervalAnchorDate
                  }
                : {}),
            ...(scrapeSchedule.scheduleType === 'custom' ? { cronExpression: scrapeSchedule.customCron.trim() } : {}),
            backupSchedule: {
                enabled: backupEnabled,
                destination: backupDestination,
                scheduleType: backupSchedule.scheduleType,
                runTime: backupSchedule.runTime,
                ...(backupSchedule.scheduleType === 'weekly' ? { weekdays: bw } : {}),
                ...(backupSchedule.scheduleType === 'monthly' ? { monthDays: bm } : {}),
                ...(backupSchedule.scheduleType === 'interval_days'
                    ? {
                          intervalDays: Math.max(1, backupSchedule.intervalDays),
                          intervalAnchorDate: backupSchedule.intervalAnchorDate
                      }
                    : {}),
                ...(backupSchedule.scheduleType === 'custom' ? { cronExpression: backupSchedule.customCron.trim() } : {})
            }
        };
    };

    useEffect(() => {
        if (!config) return;
        const json = JSON.stringify(buildPayload());
        if (lastSerializedRef.current === null) {
            lastSerializedRef.current = json;
            return;
        }
        if (lastSerializedRef.current === json) return;
        const t = setTimeout(() => {
            const payload = buildPayload();
            const nextJson = JSON.stringify(payload);
            if (lastSerializedRef.current === nextJson) return;
            updateConfig(payload, {
                onSuccess: () => {
                    lastSerializedRef.current = nextJson;
                    setSuccessMessage(true);
                    setTimeout(() => setSuccessMessage(false), 3000);
                }
            });
        }, 400);
        return () => clearTimeout(t);
    }, [
        config,
        enabled,
        scrapeSchedule,
        backupEnabled,
        backupDestination,
        backupSchedule,
        selectedProfiles,
        updateConfig
    ]);

    const toggleProfile = (id: string) => {
        setSelectedProfiles((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    };

    if (isLoading) return <div className="p-4 text-sm text-gray-500">{t('scheduler.loading')}</div>;

    const schedTitle = (
        <span className="flex items-center gap-2.5 text-[#1a2b3c]">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden>
                <path
                    stroke={SCHED_ACCENT}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            </svg>
            {t('scheduler.title')}
        </span>
    );

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

    return (
        <div className={`space-y-8 ${isInline ? '' : 'max-w-4xl mx-auto'}`}>
            <CollapsibleCard title={schedTitle} defaultOpen bodyClassName="px-6 pb-6 pt-0 space-y-6 sm:space-y-8">
                <div className="flex items-center justify-end gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            dir="ltr"
                            onClick={() => setEnabled(!enabled)}
                            className={`relative inline-flex h-8 w-[3.75rem] shrink-0 items-center justify-start rounded-full transition-colors ${
                                enabled ? '' : 'bg-gray-300'
                            }`}
                            style={enabled ? { backgroundColor: SCHED_ACCENT } : undefined}
                        >
                            <span
                                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                                    enabled ? 'translate-x-9' : 'translate-x-1'
                                }`}
                            />
                        </button>
                        <span className="text-sm font-semibold text-[#1a2b3c] hidden sm:inline">
                            {enabled ? t('common.enabled') : t('common.disabled')}
                        </span>
                    </div>
                </div>

                <div className={`space-y-8 transition-opacity duration-200 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                    <ScheduleEditor value={scrapeSchedule} onChange={patchScrape} />

                    <div>
                        <label className={`${SCHED_LABEL} mb-3`}>{t('scheduler.profiles')}</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[min(22rem,55vh)] overflow-y-auto pr-1">
                            {profiles?.map((profile) => {
                                const selected = selectedProfiles.includes(profile.id);
                                return (
                                    <button
                                        key={profile.id}
                                        type="button"
                                        onClick={() => toggleProfile(profile.id)}
                                        className={`p-3 rounded-lg border text-left transition-all flex items-center gap-3 group relative w-full ${
                                            selected
                                                ? 'border-[#006d3c] bg-emerald-50/40 ring-1 ring-[#006d3c]'
                                                : 'border-gray-200 bg-[#fafbfc] hover:border-[#006d3c]/35 hover:shadow-sm'
                                        }`}
                                    >
                                        <div
                                            className={`p-2 rounded-md shrink-0 ${
                                                selected ? 'bg-emerald-100' : 'bg-gray-100 group-hover:bg-emerald-50/60'
                                            }`}
                                        >
                                            <ProviderIcon companyId={profile.companyId} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-sm text-[#1a2b3c] truncate">{profile.name}</div>
                                            <div className="text-xs text-gray-500 truncate">{getProviderName(profile.companyId)}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
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
                            className={`relative inline-flex h-8 w-[3.75rem] shrink-0 items-center justify-start rounded-full transition-colors ${
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
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
