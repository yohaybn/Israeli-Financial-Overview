import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const AI_TOP_INSIGHTS_QUERY_KEY = ['ai-memory-top-insights'] as const;

type TopInsight = { id: string; text: string; score: number; createdAt: string };

function splitInsightText(text: string): { title: string; description: string } {
    const trimmed = text.trim();
    const nl = trimmed.indexOf('\n');
    if (nl > 0) {
        return {
            title: trimmed.slice(0, nl).trim(),
            description: trimmed.slice(nl + 1).trim(),
        };
    }
    const m = trimmed.match(/^(.+?[.!?])(\s+|$)/);
    if (m && m[1].length < trimmed.length && m[1].length >= 8) {
        return {
            title: m[1].trim(),
            description: trimmed.slice(m[0].length).trim(),
        };
    }
    return { title: '', description: trimmed };
}

const CARD_ICONS = [
    {
        wrap: 'bg-emerald-100',
        icon: (
            <svg className="w-5 h-5 text-emerald-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
        ),
    },
    {
        wrap: 'bg-sky-100',
        icon: (
            <svg className="w-5 h-5 text-sky-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
            </svg>
        ),
    },
    {
        wrap: 'bg-amber-100',
        icon: (
            <svg className="w-5 h-5 text-amber-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
            </svg>
        ),
    },
] as const;

export function TopInsightsCard() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(true);

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
            <div className="rounded-2xl border border-emerald-100/80 border-l-4 border-l-emerald-600 bg-emerald-50/80 p-5 shadow-sm">
                <div className="h-5 w-48 bg-emerald-100/90 rounded animate-pulse mb-4" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="h-28 bg-white/70 rounded-xl animate-pulse border border-emerald-100/60" />
                    <div className="h-28 bg-white/70 rounded-xl animate-pulse border border-emerald-100/60" />
                    <div className="h-28 bg-white/70 rounded-xl animate-pulse border border-emerald-100/60" />
                </div>
            </div>
        );
    }

    if (!insights || insights.length === 0) {
        return null;
    }

    const count = insights.length;

    return (
        <div className="rounded-2xl border border-emerald-100/90 border-l-4 border-l-emerald-600 bg-emerald-50/90 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 pb-3">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                            <h3 className="text-base font-bold text-emerald-900">{t('dashboard.top_insights_title')}</h3>
                            <span className="inline-flex items-center rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                {t('dashboard.top_insights_new_badge', { count })}
                            </span>
                        </div>
                        <p className="text-xs text-emerald-800/70 mt-0.5">{t('dashboard.top_insights_subtitle')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setExpanded((e) => !e)}
                        className="shrink-0 p-2 rounded-lg text-emerald-800 hover:bg-emerald-100/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        aria-expanded={expanded}
                        aria-label={expanded ? t('dashboard.collapse_top_insights_aria') : t('dashboard.expand_top_insights_aria')}
                    >
                        <svg
                            className={`w-5 h-5 transition-transform ${expanded ? '' : '-rotate-180'}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="px-4 sm:px-5 pb-5 pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {insights.map((item, idx) => {
                            const { title, description } = splitInsightText(item.text);
                            const palette = CARD_ICONS[idx % CARD_ICONS.length];
                            const showTitle = title.length > 0;

                            return (
                                <div
                                    key={item.id}
                                    className="relative rounded-xl border border-white/80 bg-white p-4 shadow-sm ring-1 ring-emerald-900/5"
                                >
                                    <button
                                        type="button"
                                        onClick={() => dismissInsight.mutate(item.id)}
                                        disabled={dismissInsight.isPending}
                                        className="absolute top-2 end-2 p-1.5 rounded-lg text-gray-400 hover:text-emerald-800 hover:bg-emerald-50/80 transition-colors disabled:opacity-50"
                                        title={t('dashboard.dismiss_insight')}
                                        aria-label={t('dashboard.dismiss_insight')}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                    <div className="flex gap-3 pe-6">
                                        <div
                                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${palette.wrap}`}
                                        >
                                            {palette.icon}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            {showTitle && (
                                                <p className="text-sm font-bold text-gray-900 leading-snug">{title}</p>
                                            )}
                                            {description ? (
                                                <p
                                                    className={`text-sm text-gray-600 leading-snug ${showTitle ? 'mt-1' : ''}`}
                                                >
                                                    {description}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
