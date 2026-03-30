import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CollapsibleCard } from './CollapsibleCard';

export const INSIGHT_RULES_QUERY_KEY = ['insight-rules'] as const;

type InsightRuleRow = {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    source: 'user' | 'ai';
    definition: {
        version: number;
        scope: string;
        lastNDays?: number;
        condition: unknown;
        output: {
            kind: string;
            score: number;
            message: { en: string; he: string };
        };
    };
    createdAt: string;
    updatedAt: string;
};

const DEFAULT_DEFINITION_TEXT = `{
  "version": 1,
  "scope": "current_month",
  "condition": {
    "op": "sumExpensesGte",
    "amount": 1000,
    "category": "מזון"
  },
  "output": {
    "kind": "insight",
    "score": 70,
    "message": {
      "en": "Food spending this month: {{sum}} ₪ (threshold exceeded).",
      "he": "הוצאות מזון החודש: {{sum}} ₪ (מעל הסף)."
    }
  }
}`;

export function InsightRulesSettings({ isInline = false }: { isInline?: boolean }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<InsightRuleRow | null>(null);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [priority, setPriority] = useState(0);
    const [definitionText, setDefinitionText] = useState(DEFAULT_DEFINITION_TEXT);
    const [importText, setImportText] = useState('');
    const [mergeImport, setMergeImport] = useState(true);
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [aiPrompt, setAiPrompt] = useState('');
    const [pendingSource, setPendingSource] = useState<'user' | 'ai'>('user');

    const { data: rules, isLoading } = useQuery({
        queryKey: INSIGHT_RULES_QUERY_KEY,
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: InsightRuleRow[] }>('/insight-rules');
            return data.data;
        },
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: INSIGHT_RULES_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: ['ai-memory-top-insights'] });
    };

    const createMutation = useMutation({
        mutationFn: async () => {
            let def: unknown;
            try {
                def = JSON.parse(definitionText);
            } catch {
                throw new Error(t('insight_rules.invalid_json'));
            }
            await api.post('/insight-rules', {
                name: name.trim(),
                enabled,
                priority,
                source: pendingSource,
                definition: def,
            });
        },
        onSuccess: () => {
            invalidate();
            setCreating(false);
            setName('');
            setDefinitionText(DEFAULT_DEFINITION_TEXT);
            setJsonError(null);
            setPendingSource('user');
        },
        onError: (e: Error) => alert(e.message),
    });

    const updateMutation = useMutation({
        mutationFn: async (row: InsightRuleRow) => {
            let def: unknown;
            try {
                def = JSON.parse(definitionText);
            } catch {
                throw new Error(t('insight_rules.invalid_json'));
            }
            await api.put(`/insight-rules/${encodeURIComponent(row.id)}`, {
                name: name.trim(),
                enabled,
                priority,
                definition: def,
            });
        },
        onSuccess: () => {
            invalidate();
            setEditing(null);
            setJsonError(null);
        },
        onError: (e: Error) => alert(e.message),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/insight-rules/${encodeURIComponent(id)}`);
        },
        onSuccess: () => invalidate(),
    });

    const evaluateMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.post<{ success: boolean; data: { matched: boolean; messageEn?: string; messageHe?: string } }>(
                `/insight-rules/${encodeURIComponent(id)}/evaluate`
            );
            return data.data;
        },
        onSuccess: (data) => {
            const msg =
                data.matched && (data.messageEn || data.messageHe)
                    ? `${data.messageEn || ''}\n${data.messageHe || ''}`
                    : t('insight_rules.test_no_match');
            alert(msg);
        },
    });

    const exportMutation = useMutation({
        mutationFn: async () => {
            const res = await api.get('/insight-rules/export', { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'insight-rules.json';
            a.click();
            URL.revokeObjectURL(url);
        },
    });

    const importMutation = useMutation({
        mutationFn: async () => {
            let body: unknown;
            try {
                body = JSON.parse(importText);
            } catch {
                throw new Error(t('insight_rules.invalid_json'));
            }
            await api.post('/insight-rules/import', {
                ...(typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}),
                merge: mergeImport,
            });
        },
        onSuccess: () => {
            invalidate();
            setImportText('');
        },
        onError: (e: Error) => alert(e.message),
    });

    const refreshMutation = useMutation({
        mutationFn: async () => {
            await api.post('/insight-rules/refresh');
        },
        onSuccess: () => invalidate(),
    });

    const aiDraftMutation = useMutation({
        mutationFn: async () => {
            const { data } = await api.post<{
                success: boolean;
                data: { name: string; definition: unknown; source: string };
            }>('/insight-rules/ai-draft', { description: aiPrompt.trim() });
            return data.data;
        },
        onSuccess: (d) => {
            setCreating(true);
            setEditing(null);
            setName(d.name);
            setEnabled(false);
            setPriority(0);
            setPendingSource('ai');
            setDefinitionText(JSON.stringify(d.definition, null, 2));
            setAiPrompt('');
        },
        onError: (e: Error) => alert(e.message),
    });

    const openEdit = (row: InsightRuleRow) => {
        setEditing(row);
        setName(row.name);
        setEnabled(row.enabled);
        setPriority(row.priority);
        setPendingSource(row.source);
        setDefinitionText(JSON.stringify(row.definition, null, 2));
        setJsonError(null);
    };

    const form = (creating || editing) && (
        <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">{t('insight_rules.name')}</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                    />
                </div>
                <div className="flex gap-4 items-end">
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                        {t('common.enabled')}
                    </label>
                    <div className="flex-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">{t('insight_rules.priority')}</label>
                        <input
                            type="number"
                            value={priority}
                            onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                        />
                    </div>
                </div>
            </div>
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase">{t('insight_rules.definition_json')}</label>
                <textarea
                    value={definitionText}
                    onChange={(e) => setDefinitionText(e.target.value)}
                    rows={16}
                    className="mt-1 w-full font-mono text-xs rounded-lg border border-gray-200 p-2"
                    spellCheck={false}
                />
                {jsonError && <p className="text-red-600 text-xs mt-1">{jsonError}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
                {creating && (
                    <button
                        type="button"
                        onClick={() => {
                            try {
                                JSON.parse(definitionText);
                                setJsonError(null);
                            } catch {
                                setJsonError(t('insight_rules.invalid_json'));
                                return;
                            }
                            createMutation.mutate();
                        }}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
                    >
                        {t('common.save')}
                    </button>
                )}
                {editing && (
                    <button
                        type="button"
                        onClick={() => {
                            try {
                                JSON.parse(definitionText);
                                setJsonError(null);
                            } catch {
                                setJsonError(t('insight_rules.invalid_json'));
                                return;
                            }
                            updateMutation.mutate(editing);
                        }}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
                    >
                        {t('common.save')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => {
                        setCreating(false);
                        setEditing(null);
                    }}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm"
                >
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    );

    return (
        <CollapsibleCard
            title={t('insight_rules.heading')}
            subtitle={t('insight_rules.subtitle')}
            defaultOpen={isInline}
            bodyClassName="px-6 pb-6 pt-0 space-y-4"
        >
            <p className="text-sm text-gray-600">{t('insight_rules.help')}</p>

            <p className="text-xs text-gray-500">{t('insight_rules.ai_draft_hint')}</p>
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={2}
                    placeholder={t('insight_rules.ai_draft_prompt_placeholder')}
                    className="flex-1 rounded-lg border border-gray-200 p-2 text-sm"
                />
                <button
                    type="button"
                    onClick={() => aiDraftMutation.mutate()}
                    disabled={aiDraftMutation.isPending || !aiPrompt.trim()}
                    className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm shrink-0"
                >
                    {t('insight_rules.ai_draft_button')}
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => {
                        setCreating(true);
                        setEditing(null);
                        setName('');
                        setEnabled(true);
                        setPriority(0);
                        setPendingSource('user');
                        setDefinitionText(DEFAULT_DEFINITION_TEXT);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm"
                >
                    {t('insight_rules.add_rule')}
                </button>
                <button
                    type="button"
                    onClick={() => exportMutation.mutate()}
                    disabled={exportMutation.isPending}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
                >
                    {t('insight_rules.export')}
                </button>
                <button
                    type="button"
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
                >
                    {t('insight_rules.refresh_fires')}
                </button>
            </div>

            <div className="rounded-xl border border-dashed border-gray-200 p-3 space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">{t('insight_rules.import_label')}</label>
                <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={4}
                    placeholder={t('insight_rules.import_placeholder')}
                    className="w-full font-mono text-xs rounded-lg border border-gray-200 p-2"
                />
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={mergeImport} onChange={(e) => setMergeImport(e.target.checked)} />
                    {t('insight_rules.merge_import')}
                </label>
                <button
                    type="button"
                    onClick={() => importMutation.mutate()}
                    disabled={importMutation.isPending || !importText.trim()}
                    className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-sm"
                >
                    {t('insight_rules.import')}
                </button>
            </div>

            {form}

            {isLoading ? (
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
            ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                    {(rules ?? []).map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2 py-3 px-3 text-sm">
                            <span className="font-medium flex-1 min-w-[120px]">{r.name}</span>
                            <span className="text-xs text-gray-500">p{r.priority}</span>
                            {!r.enabled && <span className="text-xs text-amber-700">{t('common.disabled')}</span>}
                            {r.source === 'ai' && <span className="text-xs bg-violet-100 text-violet-800 px-1.5 rounded">AI</span>}
                            <button
                                type="button"
                                onClick={() => evaluateMutation.mutate(r.id)}
                                className="text-indigo-600 text-xs"
                            >
                                {t('insight_rules.test')}
                            </button>
                            <button type="button" onClick={() => openEdit(r)} className="text-indigo-600 text-xs">
                                {t('common.edit')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (confirm(t('insight_rules.confirm_delete'))) deleteMutation.mutate(r.id);
                                }}
                                className="text-red-600 text-xs"
                            >
                                {t('common.delete')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {rules && rules.length === 0 && !isLoading && (
                <p className="text-sm text-gray-500">{t('insight_rules.empty')}</p>
            )}
        </CollapsibleCard>
    );
}
