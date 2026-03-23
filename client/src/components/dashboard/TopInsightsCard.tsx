import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const AI_TOP_INSIGHTS_QUERY_KEY = ['ai-memory-top-insights'] as const;

type TopInsight = { id: string; text: string; score: number; createdAt: string };

export function TopInsightsCard() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const { data: insights, isLoading } = useQuery({
        queryKey: [...AI_TOP_INSIGHTS_QUERY_KEY, 3],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: TopInsight[] }>('/ai/memory/insights/top?limit=3');
            return data.data;
        },
    });

    const dismissInsight = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/ai/memory/insights/${encodeURIComponent(id)}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: AI_TOP_INSIGHTS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: ['ai-memory-insights'] });
        },
    });

    if (isLoading) {
        return (
            <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/90 to-white p-5 shadow-sm">
                <div className="h-5 w-40 bg-violet-100/80 rounded animate-pulse mb-4" />
                <div className="space-y-2">
                    <div className="h-12 bg-violet-50 rounded-lg animate-pulse" />
                    <div className="h-12 bg-violet-50 rounded-lg animate-pulse" />
                </div>
            </div>
        );
    }

    if (!insights || insights.length === 0) {
        return null;
    }

    return (
        <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-indigo-50/40 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-200">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-sm font-bold text-gray-900">{t('dashboard.top_insights_title')}</h3>
                    <p className="text-[11px] text-violet-600/90">{t('dashboard.top_insights_subtitle')}</p>
                </div>
            </div>
            <ol className="space-y-3">
                {insights.map((item, idx) => (
                    <li
                        key={item.id}
                        className="flex gap-2 items-start rounded-xl bg-white/80 border border-violet-100/80 p-3 shadow-sm"
                    >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-800 text-xs font-black tabular-nums">
                            {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600 tabular-nums">
                                    {t('dashboard.insight_score_label', { score: item.score })}
                                </span>
                            </div>
                            <p className="text-sm text-gray-800 leading-snug">{item.text}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => dismissInsight.mutate(item.id)}
                            disabled={dismissInsight.isPending}
                            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-violet-700 hover:bg-violet-50/80 transition-colors disabled:opacity-50"
                            title={t('dashboard.dismiss_insight')}
                            aria-label={t('dashboard.dismiss_insight')}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </li>
                ))}
            </ol>
        </div>
    );
}
