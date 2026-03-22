import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSchedulerConfig, useUpdateSchedulerConfig } from '../hooks/useScraper';
import { useProfiles } from '../hooks/useProfiles';
import { ScheduleEditor, type ScheduleEditorValue } from './ScheduleEditor';

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
    const { t } = useTranslation();
    const { data: config, isLoading } = useSchedulerConfig();
    const { mutate: updateConfig, isPending: isUpdating } = useUpdateSchedulerConfig();
    const { data: profiles } = useProfiles();

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

    const patchScrape = (patch: Partial<ScheduleEditorValue>) => {
        setScrapeSchedule((prev) => ({ ...prev, ...patch }));
    };

    const patchBackup = (patch: Partial<ScheduleEditorValue>) => {
        setBackupSchedule((prev) => ({ ...prev, ...patch }));
    };

    useEffect(() => {
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
    }, [config]);

    const handleSave = () => {
        const sw = scrapeSchedule.weekdays.length ? scrapeSchedule.weekdays : [1];
        const sm = scrapeSchedule.monthDays.length ? scrapeSchedule.monthDays : [1];
        const bw = backupSchedule.weekdays.length ? backupSchedule.weekdays : [1];
        const bm = backupSchedule.monthDays.length ? backupSchedule.monthDays : [1];

        updateConfig(
            {
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
            },
            {
                onSuccess: () => {
                    setSuccessMessage(true);
                    setTimeout(() => setSuccessMessage(false), 3000);
                }
            }
        );
    };

    const toggleProfile = (id: string) => {
        setSelectedProfiles((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    };

    if (isLoading) return <div className="p-4 text-sm text-gray-500">{t('scheduler.loading')}</div>;

    return (
        <div className={`space-y-8 ${isInline ? '' : 'max-w-4xl mx-auto'}`}>
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {t('scheduler.title')}
                    </h3>
                    <button
                        type="button"
                        onClick={() => setEnabled(!enabled)}
                        className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-9' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div className={`space-y-6 transition-opacity duration-200 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                    <ScheduleEditor value={scrapeSchedule} onChange={patchScrape} />

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-3">{t('scheduler.profiles')}</label>
                        <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto pr-1">
                            {profiles?.map((profile) => (
                                <button
                                    key={profile.id}
                                    type="button"
                                    onClick={() => toggleProfile(profile.id)}
                                    className={`flex items-center gap-4 p-3 rounded-xl border transition-all text-left ${
                                        selectedProfiles.includes(profile.id)
                                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                                            : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200'
                                    }`}
                                >
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedProfiles.includes(profile.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                                        {selectedProfiles.includes(profile.id) && (
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold truncate">{profile.name}</div>
                                        <div className="text-xs text-gray-500 truncate">{profile.companyId}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {t('scheduler.backup_title')}
                    </h3>
                    <button
                        type="button"
                        onClick={() => setBackupEnabled(!backupEnabled)}
                        className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${backupEnabled ? 'bg-emerald-600' : 'bg-gray-300'}`}
                    >
                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${backupEnabled ? 'translate-x-9' : 'translate-x-1'}`} />
                    </button>
                </div>

                <p className="text-xs text-gray-500 mb-6">{t('scheduler.backup_standalone_desc')}</p>

                <div className={`space-y-6 transition-opacity duration-200 ${backupEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                    <ScheduleEditor value={backupSchedule} onChange={patchBackup} />

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">{t('scheduler.backup_destination')}</label>
                        <select
                            value={backupDestination}
                            onChange={(e) => setBackupDestination(e.target.value as 'local' | 'google-drive')}
                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                        >
                            <option value="local">{t('scheduler.backup_local')}</option>
                            <option value="google-drive">{t('scheduler.backup_drive')}</option>
                        </select>
                    </div>
                </div>
            </section>

            <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <p className="text-amber-900 font-bold mb-1">{t('scheduler.aboutTitle')}</p>
                    <p className="text-amber-800 text-sm">{t('scheduler.aboutDescription')}</p>
                </div>
            </section>

            <div className={`flex items-center gap-3 ${isInline ? 'sticky bottom-0 bg-gray-50/80 backdrop-blur-sm py-4 border-t border-gray-200 -mx-6 px-6 z-10' : ''}`}>
                <div className="mr-auto">
                    {successMessage && (
                        <span className="text-xs text-green-600 font-bold flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            {t('common.saved')}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isUpdating}
                    className={`px-8 py-2.5 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 ${
                        isUpdating ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                    {isUpdating ? t('common.saving') : t('common.save_settings')}
                </button>
            </div>
        </div>
    );
}
