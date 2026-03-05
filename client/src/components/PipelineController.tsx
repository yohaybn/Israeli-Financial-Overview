/**
 * Pipeline Controller Component
 * Manage and execute data processing pipeline
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePipeline, PipelineConfig, PipelineStage } from '../hooks/usePipeline';
import { useProfiles } from '../hooks/useProfiles';

interface PipelineStageUI extends PipelineStage {
  icon: string;
  color: string;
}

const STAGE_ICONS: Record<string, { icon: string; color: string }> = {
  scrape: { icon: '🔍', color: 'blue' },
  catalog: { icon: '📊', color: 'purple' },
  analyze: { icon: '🧠', color: 'pink' },
  upload: { icon: '☁️', color: 'green' },
  notification: { icon: '🔔', color: 'amber' },
};

export function PipelineController() {
  const { t } = useTranslation();
  const {
    isLoading,
    isExecuting,
    progressEvents,
    getConfig,
    getStages,
    toggleStage,
    executePipeline,
    executeMultipleProfiles,
    subscribeToProgress,
    clearProgress,
  } = usePipeline();

  const { data: profiles } = useProfiles();

  const [stages, setStages] = useState<PipelineStageUI[]>([]);
  const [config, setConfig] = useState<PipelineConfig | null>(null);
  const [executionMode, setExecutionMode] = useState<'single' | 'all'>('single');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [detailLevel, setDetailLevel] = useState<'minimal' | 'normal' | 'detailed' | 'verbose'>('normal');
  const [notificationChannels, setNotificationChannels] = useState<string[]>(['console']);
  const [persistResults, setPersistResults] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    stages: true,
    settings: false,
    progress: isExecuting,
  });

  // Load initial data
  useEffect(() => {
    Promise.all([getConfig(), getStages()]).then(([configData, stagesData]) => {
      setConfig(configData.data);
      const enrichedStages = stagesData.data?.stages?.map(
        (stage: PipelineStage) => ({
          ...stage,
          ...STAGE_ICONS[stage.name] || { icon: '⚙️', color: 'gray' },
        })
      ) || [];
      setStages(enrichedStages);
    });
  }, [getConfig, getStages]);

  // Subscribe to progress events
  useEffect(() => {
    const unsubscribe = subscribeToProgress();
    return unsubscribe;
  }, [subscribeToProgress]);

  // Update expanded state for progress section
  useEffect(() => {
    setExpanded((prev) => ({
      ...prev,
      progress: isExecuting || progressEvents.length > 0,
    }));
  }, [isExecuting, progressEvents]);

  const handleStageToggle = async (stageName: string) => {
    const stage = stages.find((s) => s.name === stageName);
    if (!stage) return;

    try {
      // Toggle on the backend
      await toggleStage(stageName, !stage.enabled);

      // Immediately update local state for UI responsiveness
      setStages((prev) =>
        prev.map((s) => (s.name === stageName ? { ...s, enabled: !s.enabled } : s))
      );

      // Refresh config from server to ensure consistency
      const updatedConfig = await getConfig();
      setConfig(updatedConfig.data);
    } catch (error) {
      // Revert local state on error
      setStages((prev) =>
        prev.map((s) => (s.name === stageName ? { ...s, enabled: stage.enabled } : s))
      );
      console.error('Failed to toggle stage:', error);
    }
  };

  const handleExecutePipeline = async () => {
    if (!config) return;

    try {
      if (executionMode === 'single') {
        // Single profile execution
        if (!selectedProfile) return;

        const profile = (profiles || []).find((p: any) => p.id === selectedProfile);
        if (!profile) return;

        const scrapeRequest = {
          companyId: profile.companyId,
          credentials: profile.credentials,
          options: profile.options || {},
        };

        await executePipeline(scrapeRequest, {
          notificationDetailLevel: detailLevel,
          globalPersistResults: persistResults,
          notification: {
            ...config.notification,
            channels: notificationChannels,
            detailLevel,
          },
        });
      } else {
        // All profiles execution
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
          notificationDetailLevel: detailLevel,
          globalPersistResults: persistResults,
          notification: {
            ...config.notification,
            channels: notificationChannels,
            detailLevel,
          },
        });
      }
    } catch (error) {
      console.error('Pipeline execution failed:', error);
    }
  };

  const stageColors = {
    blue: 'bg-blue-50 border-blue-200 hover:border-blue-300',
    purple: 'bg-purple-50 border-purple-200 hover:border-purple-300',
    pink: 'bg-pink-50 border-pink-200 hover:border-pink-300',
    green: 'bg-green-50 border-green-200 hover:border-green-300',
    amber: 'bg-amber-50 border-amber-200 hover:border-amber-300',
    gray: 'bg-gray-50 border-gray-200 hover:border-gray-300',
  };

  const stageBadgeColors = {
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    pink: 'bg-pink-100 text-pink-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    gray: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-xl">
                ⚙️
              </div>
              <div>
                <h1 className="text-3xl font-black text-gray-900">
                  {t('pipeline.title', 'Pipeline Controller')}
                </h1>
                <p className="text-sm text-gray-500">
                  {t('pipeline.subtitle', 'Orchestrate your data processing workflow')}
                </p>
              </div>
            </div>
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
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                  executionMode === 'single'
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
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                  executionMode === 'all'
                    ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                👥 All Profiles
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
                <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded">
                  <input
                    type="checkbox"
                    checked={selectedProfiles.length === (profiles?.length || 0) && selectedProfiles.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProfiles((profiles || []).map((p: any) => p.id));
                      } else {
                        setSelectedProfiles([]);
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-700 font-medium">
                    {t('pipeline.select_all', 'Select All')}
                  </span>
                </label>
                <div className="border-t border-gray-100 pt-2">
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
              {selectedProfiles.length > 0 && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                  🔄 {selectedProfiles.length} profile(s) selected - will scrape all and combine results
                </div>
              )}
            </div>
          )}

          {/* Stages Configuration */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, stages: !prev.stages }))}
              className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">📋</span>
                <span className="font-bold text-gray-900">
                  {t('pipeline.stages', 'Pipeline Stages')}
                </span>
              </div>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${expanded.stages ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>

            {expanded.stages && (
              <div className="p-6 space-y-4">
                {stages.map((stage) => {
                  const colorClass = stageColors[stage.color as keyof typeof stageColors] || stageColors.gray;
                  const badgeColorClass = stageBadgeColors[stage.color as keyof typeof stageBadgeColors] || stageBadgeColors.gray;

                  return (
                    <div
                      key={stage.name}
                      className={`border rounded-xl p-4 transition-all ${colorClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="text-2xl">{stage.icon}</div>
                          <div className="flex-1">
                            <h3 className="font-bold text-gray-900 capitalize">{stage.name}</h3>
                            <p className="text-sm text-gray-600">{stage.description}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeColorClass}`}>
                            {stage.enabled ? t('common.enabled') : t('common.disabled')}
                          </span>
                        </div>
                        <button
                          onClick={() => handleStageToggle(stage.name)}
                          disabled={isExecuting}
                          className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
                            stage.enabled ? 'bg-blue-600' : 'bg-gray-300'
                          } disabled:opacity-50`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform ${
                              stage.enabled ? 'translate-x-9' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, settings: !prev.settings }))}
              className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">⚙️</span>
                <span className="font-bold text-gray-900">
                  {t('pipeline.settings', 'Settings')}
                </span>
              </div>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${expanded.settings ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>

            {expanded.settings && (
              <div className="p-6 space-y-6">
                {/* Detail Level */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-widest">
                    {t('pipeline.notification_detail', 'Notification Detail Level')}
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(['minimal', 'normal', 'detailed', 'verbose'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => setDetailLevel(level)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          detailLevel === level
                            ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notification Channels */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-widest">
                    {t('pipeline.notification_channels', 'Notification Channels')}
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationChannels.includes('console')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNotificationChannels([...notificationChannels, 'console']);
                          } else {
                            setNotificationChannels(notificationChannels.filter((c) => c !== 'console'));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-700 font-medium">Console Output</span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Email and Telegram channels coming soon
                  </p>
                </div>

                {/* Persist Results */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={persistResults}
                      onChange={(e) => setPersistResults(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-gray-700 font-medium block">
                        {t('pipeline.persist_results', 'Persist Intermediate Results')}
                      </span>
                      <span className="text-xs text-gray-500">
                        {t('pipeline.persist_results_desc', 'Save stage results for debugging and analysis')}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Execute Button */}
          <button
            onClick={handleExecutePipeline}
            disabled={
              !config ||
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
        </div>
      </div>

      {/* Progress Sidebar */}
      {(isExecuting || progressEvents.length > 0) && (
        <div className="border-t border-gray-200 bg-white h-64 overflow-y-auto">
          <div className="sticky top-0 bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <span className="text-lg">📊</span>
              <span className="font-bold text-gray-900">
                {t('pipeline.progress', 'Execution Progress')}
              </span>
            </div>
            <button
              onClick={clearProgress}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              ✕
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {progressEvents.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <div className="animate-spin text-2xl mb-2">⏳</div>
                {t('pipeline.waiting_for_progress', 'Waiting for progress updates...')}
              </div>
            ) : (
              progressEvents.map((event, idx) => (
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
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
