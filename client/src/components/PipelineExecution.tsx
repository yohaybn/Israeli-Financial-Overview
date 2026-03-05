import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePipeline } from '../hooks/usePipeline';
import { useProfiles } from '../hooks/useProfiles';

export function PipelineExecution() {
    const { t } = useTranslation();
    const {
        isLoading,
        isExecuting,
        progressEvents,
        getConfig,
        executePipeline,
        executeMultipleProfiles,
        subscribeToProgress,
        clearProgress,
    } = usePipeline();

    const { data: profiles } = useProfiles();

    const [executionMode, setExecutionMode] = useState<'single' | 'all'>('single');
    const [selectedProfile, setSelectedProfile] = useState<string>('');
    const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
    const [persistResults] = useState(true);

    // Subscribe to progress events
    useEffect(() => {
        const unsubscribe = subscribeToProgress();
        return unsubscribe;
    }, [subscribeToProgress]);

    const handleExecutePipeline = async () => {
        const config = await getConfig();
        const configData = config.data;
        if (!configData) return;

        try {
            if (executionMode === 'single') {
                if (!selectedProfile) return;
                const profile = (profiles || []).find((p: any) => p.id === selectedProfile);
                if (!profile) return;

                const scrapeRequest = {
                    companyId: profile.companyId,
                    credentials: profile.credentials,
                    options: profile.options || {},
                };

                await executePipeline(scrapeRequest, {
                    globalPersistResults: persistResults,
                    notification: {
                        ...configData.notification
                    },
                });
            } else {
                if (selectedProfiles.length === 0) return;
                const scrapeRequests = selectedProfiles
                    .map((profileId) => (profiles || []).find((p: any) => p.id === profileId))
                    .filter(Boolean)
                    .map((profile: any) => ({
                        companyId: profile.companyId,
                        credentials: profile.credentials,
                        options: profile.options || {},
                    }));

                await executeMultipleProfiles(scrapeRequests, {
                    globalPersistResults: persistResults,
                    notification: {
                        ...configData.notification
                    },
                });
            }
        } catch (error) {
            console.error('Pipeline execution failed:', error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Manual Execution</h3>
                <span className="text-xs text-gray-500">Trigger pipeline for specific profiles</span>
            </div>

            {/* Execution Mode Selection */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <label className="block text-sm font-bold text-gray-700 mb-4 uppercase tracking-widest">
                    {t('pipeline.execution_mode', 'Execution Mode')}
                </label>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            setExecutionMode('single');
                            setSelectedProfiles([]);
                        }}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${executionMode === 'single'
                            ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        👤 Single Profile
                    </button>
                    <button
                        onClick={() => {
                            setExecutionMode('all');
                            setSelectedProfile('');
                        }}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${executionMode === 'all'
                            ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        👥 Multiple Profiles
                    </button>
                </div>
            </div>

            {/* Profile Selection */}
            {executionMode === 'single' ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-widest">
                        {t('pipeline.select_profile', 'Select Profile')}
                    </label>
                    <select
                        value={selectedProfile}
                        onChange={(e) => setSelectedProfile(e.target.value)}
                        disabled={isExecuting}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        <option value="">{t('pipeline.choose_profile', 'Choose a profile...')}</option>
                        {profiles?.map((profile: any) => (
                            <option key={profile.id} value={profile.id}>
                                {profile.name} ({profile.companyId})
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <label className="block text-sm font-bold text-gray-700 mb-4 uppercase tracking-widest">
                        {t('pipeline.select_profiles', 'Select Profiles to Run')}
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {profiles?.map((profile: any) => (
                            <label
                                key={profile.id}
                                className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedProfiles.includes(profile.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedProfiles([...selectedProfiles, profile.id]);
                                        } else {
                                            setSelectedProfiles(selectedProfiles.filter((id) => id !== profile.id));
                                        }
                                    }}
                                    disabled={isExecuting}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                />
                                <span className="text-gray-700">
                                    {profile.name} ({profile.companyId})
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Execute Button */}
            <button
                onClick={handleExecutePipeline}
                disabled={
                    isExecuting ||
                    isLoading ||
                    (executionMode === 'single' && !selectedProfile) ||
                    (executionMode === 'all' && selectedProfiles.length === 0)
                }
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-3 text-lg"
            >
                {isExecuting ? (
                    <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t('pipeline.executing', 'Executing Pipeline...')}
                    </>
                ) : (
                    <>
                        <span>▶️</span>
                        {executionMode === 'all'
                            ? `${t('pipeline.execute', 'Execute Pipeline')} (${selectedProfiles.length} profiles)`
                            : t('pipeline.execute', 'Execute Pipeline')}
                    </>
                )}
            </button>

            {/* Progress View */}
            {(isExecuting || progressEvents.length > 0) && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <span>📊</span> {t('pipeline.progress', 'Execution Progress')}
                        </h3>
                        <button
                            onClick={clearProgress}
                            className="text-gray-500 hover:text-gray-700 text-sm"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                        {progressEvents.map((event, idx) => (
                            <div key={idx} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                                <div className="flex gap-3">
                                    <div className="text-sm text-gray-400 flex-shrink-0 w-20">
                                        {new Date(event.timestamp).toLocaleTimeString()}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-700 font-medium">{event.message}</p>
                                        {event.summary && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                ✓ {event.summary.successful} | ✗ {event.summary.failed} | ⏱️ {event.summary.totalDuration}ms
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
