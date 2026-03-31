import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    builderStateToDefinition,
    defaultBuilderState,
    definitionToBuilderState,
    isBuilderStateSavable,
    parseInsightRuleDefinition,
    type BuilderState,
    type InsightRuleDefinitionV1,
} from '@app/shared';
import { api } from '../lib/api';
import { CollapsibleCard } from './CollapsibleCard';
import { InsightRuleEditor } from './insight-rules/InsightRuleEditor';

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
        description?: string;
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

function stringifyDef(def: InsightRuleDefinitionV1) {
    return JSON.stringify(def, null, 2);
}

export function InsightRulesSettings({
    isInline = false,
    standaloneTab = false,
}: {
    isInline?: boolean;
    standaloneTab?: boolean;
}) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<InsightRuleRow | null>(null);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [priority, setPriority] = useState(0);
    const [builderCompatible, setBuilderCompatible] = useState(true);
    const [builderState, setBuilderState] = useState<BuilderState>(() => defaultBuilderState());
    const [definitionText, setDefinitionText] = useState(() =>
        stringifyDef(builderStateToDefinition(defaultBuilderState()))
    );
    const [definitionTextDirty, setDefinitionTextDirty] = useState(false);
    const [importText, setImportText] = useState('');
    const [mergeImport, setMergeImport] = useState(true);
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [aiPrompt, setAiPrompt] = useState('');
    const [pendingSource, setPendingSource] = useState<'user' | 'ai'>('user');
    /** After auto-opening create on empty list, do not reopen if the user cancelled (until they have rules again). */
    const skipAutoOpenEmptyRef = useRef(false);

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

    useEffect(() => {
        if (!builderCompatible) return;
        if (definitionTextDirty) return;
        setDefinitionText(stringifyDef(builderStateToDefinition(builderState)));
    }, [builderState, builderCompatible, definitionTextDirty]);

    const openCreate = useCallback(() => {
        setCreating(true);
        setEditing(null);
        setName('');
        setEnabled(true);
        setPriority(0);
        setPendingSource('user');
        setBuilderCompatible(true);
        setBuilderState(defaultBuilderState());
        setDefinitionText(stringifyDef(builderStateToDefinition(defaultBuilderState())));
        setDefinitionTextDirty(false);
        setJsonError(null);
    }, []);

    /** Show the If/Then builder immediately when there are no rules (first visit or after deleting all). */
    useEffect(() => {
        if (isLoading || rules === undefined) return;
        if (rules.length > 0) {
            skipAutoOpenEmptyRef.current = false;
            return;
        }
        if (editing || creating) return;
        if (skipAutoOpenEmptyRef.current) return;
        skipAutoOpenEmptyRef.current = true;
        openCreate();
    }, [isLoading, rules, editing, creating, openCreate]);

    const resolveDefinition = (): { ok: true; value: InsightRuleDefinitionV1 } | { ok: false; error: string } => {
        if (!builderCompatible) {
            try {
                const raw = JSON.parse(definitionText) as unknown;
                return parseInsightRuleDefinition(raw);
            } catch {
                return { ok: false, error: t('insight_rules.invalid_json') };
            }
        }
        if (definitionTextDirty) {
            try {
                const raw = JSON.parse(definitionText) as unknown;
                return parseInsightRuleDefinition(raw);
            } catch {
                return { ok: false, error: t('insight_rules.invalid_json') };
            }
        }
        if (!isBuilderStateSavable(builderState)) {
            return { ok: false, error: t('insight_rules.save_needs_conditions') };
        }
        return { ok: true, value: builderStateToDefinition(builderState) };
    };

    const handleBuilderChange = (next: BuilderState) => {
        setDefinitionTextDirty(false);
        setBuilderState(next);
    };

    const resetFormAfterSave = () => {
        setDefinitionTextDirty(false);
        setJsonError(null);
    };

    const createMutation = useMutation({
        mutationFn: async () => {
            const resolved = resolveDefinition();
            if (!resolved.ok) throw new Error(resolved.error);
            await api.post('/insight-rules', {
                name: name.trim(),
                enabled,
                priority,
                source: pendingSource,
                definition: resolved.value,
            });
        },
        onSuccess: () => {
            invalidate();
            setCreating(false);
            setName('');
            setBuilderCompatible(true);
            setBuilderState(defaultBuilderState());
            setDefinitionText(stringifyDef(builderStateToDefinition(defaultBuilderState())));
            resetFormAfterSave();
            setPendingSource('user');
        },
        onError: (e: Error) => alert(e.message),
    });

    const updateMutation = useMutation({
        mutationFn: async (row: InsightRuleRow) => {
            const resolved = resolveDefinition();
            if (!resolved.ok) throw new Error(resolved.error);
            await api.put(`/insight-rules/${encodeURIComponent(row.id)}`, {
                name: name.trim(),
                enabled,
                priority,
                definition: resolved.value,
            });
        },
        onSuccess: () => {
            invalidate();
            setEditing(null);
            resetFormAfterSave();
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
            const { data } = await api.post<{
                success: boolean;
                data: { matched: boolean; messageEn?: string; messageHe?: string };
            }>(`/insight-rules/${encodeURIComponent(id)}/evaluate`);
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

    const applyParsedDefinition = (def: InsightRuleDefinitionV1) => {
        const b = definitionToBuilderState(def);
        if (b) {
            setBuilderCompatible(true);
            setBuilderState(b.state);
        } else {
            setBuilderCompatible(false);
        }
        setDefinitionText(stringifyDef(def));
        setDefinitionTextDirty(false);
    };

    const aiDraftMutation = useMutation({
        mutationFn: async () => {
            const { data } = await api.post<{
                success: boolean;
                data: { name: string; definition: unknown; source: string };
            }>('/insight-rules/ai-draft', { description: aiPrompt.trim() });
            return data.data;
        },
        onSuccess: (d) => {
            const parsed = parseInsightRuleDefinition(d.definition);
            if (!parsed.ok) {
                alert(parsed.error);
                return;
            }
            setCreating(true);
            setEditing(null);
            setName(d.name);
            setEnabled(false);
            setPriority(0);
            setPendingSource('ai');
            applyParsedDefinition(parsed.value);
            setAiPrompt('');
        },
        onError: (e: Error) => alert(e.message),
    });

    const openEdit = (row: InsightRuleRow) => {
        setEditing(row);
        setCreating(false);
        setName(row.name);
        setEnabled(row.enabled);
        setPriority(row.priority);
        setPendingSource(row.source);
        const parsed = parseInsightRuleDefinition(row.definition);
        if (!parsed.ok) {
            setJsonError(parsed.error);
            setBuilderCompatible(false);
            setDefinitionText(JSON.stringify(row.definition, null, 2));
            setDefinitionTextDirty(false);
            return;
        }
        setJsonError(null);
        applyParsedDefinition(parsed.value);
    };

    const saveDisabled =
        !name.trim() ||
        (builderCompatible && !definitionTextDirty && !isBuilderStateSavable(builderState));

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

            {!builderCompatible && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    {t('insight_rules.builder_incompatible')}
                </p>
            )}

            {builderCompatible && (
                <InsightRuleEditor state={builderState} onChange={handleBuilderChange} showJsonPreview />
            )}

            {builderCompatible ? (
                <details className="rounded-xl border border-gray-200 bg-white">
                    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700">
                        {t('insight_rules.advanced_json')}
                    </summary>
                    <div className="border-t border-gray-100 px-4 pb-4 pt-2 space-y-2">
                        <p className="text-xs text-gray-500">{t('insight_rules.advanced_json_hint')}</p>
                        <textarea
                            value={definitionText}
                            onChange={(e) => {
                                setDefinitionText(e.target.value);
                                setDefinitionTextDirty(true);
                                setJsonError(null);
                            }}
                            rows={12}
                            className="w-full font-mono text-xs rounded-lg border border-gray-200 p-2"
                            spellCheck={false}
                        />
                        {jsonError && <p className="text-red-600 text-xs">{jsonError}</p>}
                    </div>
                </details>
            ) : (
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">{t('insight_rules.definition_json')}</label>
                    <textarea
                        value={definitionText}
                        onChange={(e) => {
                            setDefinitionText(e.target.value);
                            setDefinitionTextDirty(true);
                            setJsonError(null);
                        }}
                        rows={16}
                        className="mt-1 w-full font-mono text-xs rounded-lg border border-gray-200 p-2"
                        spellCheck={false}
                    />
                    {jsonError && <p className="text-red-600 text-xs mt-1">{jsonError}</p>}
                </div>
            )}

            <div className="flex flex-wrap gap-2 items-center">
                {creating && (
                    <button
                        type="button"
                        onClick={() => {
                            const r = resolveDefinition();
                            if (!r.ok) {
                                setJsonError(r.error);
                                return;
                            }
                            setJsonError(null);
                            createMutation.mutate();
                        }}
                        disabled={saveDisabled || createMutation.isPending}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                    >
                        {t('common.save')}
                    </button>
                )}
                {editing && (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                const r = resolveDefinition();
                                if (!r.ok) {
                                    setJsonError(r.error);
                                    return;
                                }
                                setJsonError(null);
                                updateMutation.mutate(editing);
                            }}
                            disabled={saveDisabled || updateMutation.isPending}
                            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                        >
                            {t('common.save')}
                        </button>
                        <button
                            type="button"
                            onClick={() => evaluateMutation.mutate(editing.id)}
                            disabled={evaluateMutation.isPending}
                            className="px-4 py-2 rounded-lg border border-indigo-200 text-indigo-800 text-sm font-medium"
                        >
                            {t('insight_rules.test')}
                        </button>
                    </>
                )}
                <button
                    type="button"
                    onClick={() => {
                        setCreating(false);
                        setEditing(null);
                        setJsonError(null);
                    }}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm"
                >
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    );

    const inner = (
        <>
            <p className="text-sm text-gray-600">{t('insight_rules.help')}</p>
            {rules && rules.length > 0 && !creating && !editing && (
                <p className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                    {t('insight_rules.open_builder_hint')}
                </p>
            )}

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
                <button type="button" onClick={() => openCreate()} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm">
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
        </>
    );

    if (standaloneTab) {
        return <div className="space-y-4">{inner}</div>;
    }

    return (
        <CollapsibleCard
            title={
                <span className="inline-flex items-center gap-2 flex-wrap">
                    {t('insight_rules.heading')}
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border bg-amber-100 border-amber-200 text-amber-800">
                        {t('insight_rules.beta')}
                    </span>
                </span>
            }
            subtitle={t('insight_rules.subtitle')}
            defaultOpen={isInline}
            bodyClassName="px-6 pb-6 pt-0 space-y-4"
        >
            {inner}
        </CollapsibleCard>
    );
}
