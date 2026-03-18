import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSchedulerConfig, useUpdateSchedulerConfig } from '../hooks/useScraper';
import { useProfiles } from '../hooks/useProfiles';

export function SchedulerSettings({ isInline = false }: { isInline?: boolean }) {
    const { t } = useTranslation();
    const { data: config, isLoading } = useSchedulerConfig();
    const { mutate: updateConfig, isPending: isUpdating } = useUpdateSchedulerConfig();
    const { data: profiles } = useProfiles();

    const [enabled, setEnabled] = useState(false);
    const [runTime, setRunTime] = useState('00:00');
    const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
    const [backupEnabled, setBackupEnabled] = useState(false);
    const [backupDestination, setBackupDestination] = useState<'local' | 'google-drive'>('local');
    const [successMessage, setSuccessMessage] = useState(false);

    useEffect(() => {
        if (config) {
            setEnabled(config.enabled ?? false);
            const parts = config.cronExpression?.split(' ') || [];
            if (parts.length >= 2) {
                setRunTime(`${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`);
            }
            setSelectedProfiles(config.selectedProfiles || []);
            setBackupEnabled(config.backupSchedule?.enabled ?? false);
            setBackupDestination(config.backupSchedule?.destination === 'google-drive' ? 'google-drive' : 'local');
        }
    }, [config]);

    const handleSave = () => {
        const [hour, minute] = runTime.split(':');
        const newCron = `${parseInt(minute)} ${parseInt(hour)} * * *`;

        updateConfig(
            {
                enabled,
                cronExpression: newCron,
                selectedProfiles,
                backupSchedule: {
                    enabled: backupEnabled,
                    destination: backupDestination
                }
            },
            {
                onSuccess: () => {
                    setSuccessMessage(true);
                    setTimeout(() => setSuccessMessage(false), 3000);
                },
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
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">{t('scheduler.run_time')}</label>
                        <input
                            type="time"
                            value={runTime}
                            onChange={(e) => setRunTime(e.target.value)}
                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                        />
                        <p className="mt-2 text-xs text-gray-500">{t('scheduler.run_time_desc')}</p>
                    </div>

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

                    <div className="border-t border-gray-100 pt-5">
                        <div className="flex items-center justify-between mb-3">
                            <label className="block text-sm font-bold text-gray-700">{t('scheduler.backup_title')}</label>
                            <button
                                type="button"
                                onClick={() => setBackupEnabled(!backupEnabled)}
                                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${backupEnabled ? 'bg-emerald-600' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${backupEnabled ? 'translate-x-8' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">{t('scheduler.backup_desc')}</p>

                        <div className={`transition-opacity duration-200 ${backupEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
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
