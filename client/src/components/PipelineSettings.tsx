import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePipeline, PipelineConfig, PipelineStage } from '../hooks/usePipeline';
import PostScrapeSettings from './PostScrapeSettings';

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

export function PipelineSettings() {
    const { t } = useTranslation();
    const {
        isLoading,
        getConfig,
        getStages,
        toggleStage,
    } = usePipeline();

    const [stages, setStages] = useState<PipelineStageUI[]>([]);
    const [config, setConfig] = useState<PipelineConfig | null>(null);
    const [persistResults] = useState(true);
    const [showPostScrape] = useState(true);

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

    const handleStageToggle = async (stageName: string) => {
        const stage = stages.find((s) => s.name === stageName);
        if (!stage) return;

        try {
            await toggleStage(stageName, !stage.enabled);
            setStages((prev) =>
                prev.map((s) => (s.name === stageName ? { ...s, enabled: !s.enabled } : s))
            );
        } catch (error) {
            console.error('Failed to toggle stage:', error);
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

    if (isLoading && !config) {
        return <div className="p-8 text-center text-gray-500">Loading pipeline settings...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Stages Configuration */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <span>📋</span> {t('pipeline.stages', 'Pipeline Stages')}
                    </h3>
                </div>
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
                                        className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${stage.enabled ? 'bg-blue-600' : 'bg-gray-300'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform ${stage.enabled ? 'translate-x-9' : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* General Settings */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <span>⚙️</span> {t('pipeline.settings', 'Pipeline Settings')}
                    </h3>
                </div>
                <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div />
                        <div />
                    </div>
                    {/* Detail Level */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-widest">
                            {t('pipeline.notification_detail', 'Notification Detail Level (Coming Soon)')}
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 opacity-50 pointer-events-none">
                            {(['minimal', 'normal', 'detailed', 'verbose'] as const).map((level) => (
                                <button
                                    key={level}
                                    className={`px-4 py-2 rounded-lg font-medium transition-all ${config?.notification?.detailLevel === level
                                        ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {level.charAt(0).toUpperCase() + level.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Persist Results */}
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer opacity-50 pointer-events-none">
                            <input
                                type="checkbox"
                                checked={persistResults}
                                readOnly
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
            </div>
            {showPostScrape && (
                <div className="mt-6">
                    <PostScrapeSettings isInline={true} />
                </div>
            )}
        </div>
    );
}
