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
    const [successMessage, setSuccessMessage] = useState(false);

    useEffect(() => {
        if (config) {
            setEnabled(config.enabled ?? false);
            // Extract time from cron if simple format
            const parts = config.cronExpression?.split(' ') || [];
            if (parts.length >= 2) {
                setRunTime(`${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`);
            }
            setSelectedProfiles(config.selectedProfiles || []);
        }
    }, [config]);

    const handleSave = () => {
        const [hour, minute] = runTime.split(':');
        const newCron = `${parseInt(minute)} ${parseInt(hour)} * * *`;

        updateConfig({
            enabled,
            cronExpression: newCron,
            selectedProfiles
        }, {
            onSuccess: () => {
                setSuccessMessage(true);
                setTimeout(() => setSuccessMessage(false), 3000);
            }
        });
    };

    const toggleProfile = (id: string) => {
        setSelectedProfiles(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    if (isLoading) return <div className="p-8 text-center text-gray-500">{t('scheduler.loading')}</div>;

    return (
        <div className={`p-8 space-y-12 max-w-6xl mx-auto ${isInline ? 'p-0 space-y-8' : ''}`}>
            {!isInline && (
                <header className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900">{t('common.automation')}</h1>
                        <p className="text-gray-500">{t('common.automation_desc')}</p>
                    </div>
                </header>
            )}

            <div className="grid grid-cols-1 gap-12">
                {/* Left Column: Scheduled Automation */}
                <div className="space-y-8">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-8 flex-1">
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                                    <span className="text-2xl">⏳</span> {t('scheduler.title')}
                                </h2>
                                <button
                                    onClick={() => setEnabled(!enabled)}
                                    className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                                >
                                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform ${enabled ? 'translate-x-9' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className={`space-y-8 transition-opacity duration-300 ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-widest">{t('scheduler.run_time')}</label>
                                    <input
                                        type="time"
                                        value={runTime}
                                        onChange={(e) => setRunTime(e.target.value)}
                                        className="w-full bg-gray-50 border-0 rounded-2xl p-4 text-xl font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                    <p className="mt-2 text-xs text-gray-500">{t('scheduler.run_time_desc')}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-4 uppercase tracking-widest">{t('scheduler.profiles')}</label>
                                    <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                        {profiles?.map(profile => (
                                            <button
                                                key={profile.id}
                                                onClick={() => toggleProfile(profile.id)}
                                                className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${selectedProfiles.includes(profile.id)
                                                        ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm'
                                                        : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:shadow-sm'
                                                    }`}
                                            >
                                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedProfiles.includes(profile.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                                                    }`}>
                                                    {selectedProfiles.includes(profile.id) && (
                                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-bold truncate">{profile.name}</div>
                                                    <div className="text-xs opacity-60 font-medium">{profile.companyId}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {successMessage && (
                                    <span className="text-green-600 font-bold flex items-center gap-2 animate-bounce">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                        {t('common.saved')}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={isUpdating}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-2xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2"
                            >
                                {isUpdating ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <span>💾 {t('common.save_settings')}</span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="bg-amber-50 rounded-3xl p-6 border border-amber-100 flex gap-4">
                        <div className="text-2xl">💡</div>
                        <div>
                            <p className="text-amber-900 font-bold mb-1">About Scheduling</p>
                            <p className="text-amber-800 text-sm opacity-80">
                                The scheduler runs on the server. Make sure the container is running during the scheduled time.
                                Notifications will be sent according to your global pipeline settings.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
