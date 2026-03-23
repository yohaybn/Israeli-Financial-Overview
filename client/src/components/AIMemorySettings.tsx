import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

import { AI_TOP_INSIGHTS_QUERY_KEY } from './dashboard/TopInsightsCard';

type AiFact = { id: string; text: string; createdAt: string; updatedAt: string };
type AiInsight = { id: string; text: string; score: number; createdAt: string };
type AiAlert = { id: string; text: string; score: number; createdAt: string };

export function AIMemorySettings({ isInline = false }: { isInline?: boolean }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [newFact, setNewFact] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    const { data: facts, isLoading: loadingFacts } = useQuery({
        queryKey: ['ai-memory-facts'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: AiFact[] }>('/ai/memory/facts');
            return data.data;
        },
    });

    const { data: insights, isLoading: loadingInsights } = useQuery({
        queryKey: ['ai-memory-insights'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: AiInsight[] }>('/ai/memory/insights');
            return data.data;
        },
    });

    const { data: alerts, isLoading: loadingAlerts } = useQuery({
        queryKey: ['ai-memory-alerts'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: AiAlert[] }>('/ai/memory/alerts');
            return data.data;
        },
    });

    const addFact = useMutation({
        mutationFn: async (text: string) => {
            await api.post('/ai/memory/facts', { text });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-memory-facts'] });
            setNewFact('');
        },
    });

    const saveEdit = useMutation({
        mutationFn: async ({ id, text }: { id: string; text: string }) => {
            await api.patch(`/ai/memory/facts/${encodeURIComponent(id)}`, { text });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-memory-facts'] });
            setEditingId(null);
        },
    });

    const removeFact = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/ai/memory/facts/${encodeURIComponent(id)}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-memory-facts'] });
        },
    });

    const removeInsight = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/ai/memory/insights/${encodeURIComponent(id)}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-memory-insights'] });
            queryClient.invalidateQueries({ queryKey: AI_TOP_INSIGHTS_QUERY_KEY });
        },
    });

    const removeAlert = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/ai/memory/alerts/${encodeURIComponent(id)}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-memory-alerts'] });
        },
    });

    const wrap = isInline ? 'space-y-6' : 'max-w-3xl mx-auto space-y-6 p-6';

    return (
        <div className={wrap}>
            <div>
                <h2 className={`font-black text-gray-900 ${isInline ? 'text-xl' : 'text-2xl'}`}>
                    {t('ai_memory.title')}
                </h2>
                <p className="text-gray-500 text-sm mt-1">{t('ai_memory.description')}</p>
            </div>

            <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2">{t('ai_memory.facts_heading')}</h3>
                <p className="text-xs text-gray-500 mb-4">{t('ai_memory.facts_help')}</p>

                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={newFact}
                        onChange={(e) => setNewFact(e.target.value)}
                        placeholder={t('ai_memory.fact_placeholder')}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                        type="button"
                        disabled={!newFact.trim() || addFact.isPending}
                        onClick={() => addFact.mutate(newFact.trim())}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                    >
                        {t('ai_memory.add')}
                    </button>
                </div>

                {loadingFacts ? (
                    <p className="text-sm text-gray-400">{t('common.loading')}</p>
                ) : (
                    <ul className="space-y-2">
                        {(facts || []).map((f) => (
                            <li key={f.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/80">
                                {editingId === f.id ? (
                                    <div className="flex flex-col gap-2">
                                        <textarea
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[72px]"
                                            rows={3}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
                                                onClick={() => saveEdit.mutate({ id: f.id, text: editText.trim() })}
                                                disabled={!editText.trim() || saveEdit.isPending}
                                            >
                                                {t('ai_memory.save')}
                                            </button>
                                            <button
                                                type="button"
                                                className="px-3 py-1.5 text-gray-600 text-xs"
                                                onClick={() => setEditingId(null)}
                                            >
                                                {t('common.cancel')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between gap-3 items-start">
                                        <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1">{f.text}</p>
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                type="button"
                                                className="text-xs text-indigo-600 font-semibold"
                                                onClick={() => {
                                                    setEditingId(f.id);
                                                    setEditText(f.text);
                                                }}
                                            >
                                                {t('ai_memory.edit')}
                                            </button>
                                            <button
                                                type="button"
                                                className="text-xs text-red-600 font-semibold"
                                                onClick={() => removeFact.mutate(f.id)}
                                                disabled={removeFact.isPending}
                                            >
                                                {t('ai_memory.delete')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {!loadingFacts && (!facts || facts.length === 0) && (
                    <p className="text-sm text-gray-400 italic">{t('ai_memory.no_facts')}</p>
                )}
            </section>

            <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2">{t('ai_memory.insights_heading')}</h3>
                <p className="text-xs text-gray-500 mb-4">{t('ai_memory.insights_help')}</p>

                {loadingInsights ? (
                    <p className="text-sm text-gray-400">{t('common.loading')}</p>
                ) : (
                    <ul className="space-y-2 max-h-80 overflow-y-auto">
                        {(insights || []).map((i) => (
                            <li
                                key={i.id}
                                className="flex justify-between gap-3 items-start border border-gray-100 rounded-lg p-3 bg-amber-50/50"
                            >
                                <div className="flex-1 min-w-0">
                                    <span className="inline-block mb-1 px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900 text-[10px] font-bold tabular-nums">
                                        {i.score ?? 50}/100
                                    </span>
                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{i.text}</p>
                                </div>
                                <button
                                    type="button"
                                    className="text-xs text-red-600 font-semibold shrink-0"
                                    onClick={() => removeInsight.mutate(i.id)}
                                    disabled={removeInsight.isPending}
                                >
                                    {t('ai_memory.delete')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {!loadingInsights && (!insights || insights.length === 0) && (
                    <p className="text-sm text-gray-400 italic">{t('ai_memory.no_insights')}</p>
                )}
            </section>

            <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2">{t('ai_memory.alerts_heading')}</h3>
                <p className="text-xs text-gray-500 mb-4">{t('ai_memory.alerts_help')}</p>

                {loadingAlerts ? (
                    <p className="text-sm text-gray-400">{t('common.loading')}</p>
                ) : (
                    <ul className="space-y-2 max-h-80 overflow-y-auto">
                        {(alerts || []).map((a) => (
                            <li
                                key={a.id}
                                className="flex justify-between gap-3 items-start border border-rose-100 rounded-lg p-3 bg-rose-50/50"
                            >
                                <div className="flex-1 min-w-0">
                                    <span className="inline-block mb-1 px-2 py-0.5 rounded-md bg-rose-200/80 text-rose-900 text-[10px] font-bold tabular-nums">
                                        {a.score ?? 50}/100
                                    </span>
                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.text}</p>
                                </div>
                                <button
                                    type="button"
                                    className="text-xs text-red-600 font-semibold shrink-0"
                                    onClick={() => removeAlert.mutate(a.id)}
                                    disabled={removeAlert.isPending}
                                >
                                    {t('ai_memory.delete')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {!loadingAlerts && (!alerts || alerts.length === 0) && (
                    <p className="text-sm text-gray-400 italic">{t('ai_memory.no_alerts_memory')}</p>
                )}
            </section>
        </div>
    );
}
