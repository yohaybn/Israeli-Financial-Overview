import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import {
    builderStateToDefinition,
    defaultBuilderState,
    definitionToBuilderState,
    extractInsightRuleImportTuningSlots,
    isBuilderStateSavable,
    maskInsightRuleDefinitionForExport,
    parseInsightRuleDefinition,
    type BuilderState,
    type InsightRuleDefinitionV1,
} from '@app/shared';
import { api } from '../../lib/api';
import { InsightRuleEditor } from './InsightRuleEditor';
import type { InsightRuleFormCreateSeed, InsightRuleRow } from './insightRuleFormTypes';

function stringifyDef(def: InsightRuleDefinitionV1) {
    return JSON.stringify(def, null, 2);
}

function emptyCreateState() {
    const b = defaultBuilderState();
    return {
        name: '',
        enabled: true,
        priority: 0,
        pendingSource: 'user' as const,
        builderCompatible: true,
        builderState: b,
        definitionText: stringifyDef(builderStateToDefinition(b)),
        definitionTextDirty: false,
        jsonError: null as string | null,
        aiPrompt: '',
    };
}

export function InsightRuleForm({
    mode,
    editRule,
    createSeed,
    instanceKey,
    showAiDraftSection = true,
    onCancel,
    onSuccess,
    onInvalidate,
}: {
    mode: 'create' | 'edit';
    editRule: InsightRuleRow | null;
    createSeed: InsightRuleFormCreateSeed | null;
    instanceKey: string;
    showAiDraftSection?: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    onInvalidate: () => void;
}) {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [priority, setPriority] = useState(0);
    const [pendingSource, setPendingSource] = useState<'user' | 'ai'>('user');
    const [builderCompatible, setBuilderCompatible] = useState(true);
    const [builderState, setBuilderState] = useState<BuilderState>(() => defaultBuilderState());
    const [definitionText, setDefinitionText] = useState(() =>
        stringifyDef(builderStateToDefinition(defaultBuilderState()))
    );
    const [definitionTextDirty, setDefinitionTextDirty] = useState(false);
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [aiPrompt, setAiPrompt] = useState('');
    const [definitionJsonCopyHint, setDefinitionJsonCopyHint] = useState<'idle' | 'ok' | 'err'>('idle');
    const [copyMaskAmounts, setCopyMaskAmounts] = useState(true);

    const applyParsedDefinition = useCallback((def: InsightRuleDefinitionV1) => {
        const b = definitionToBuilderState(def);
        if (b) {
            setBuilderCompatible(true);
            setBuilderState(b.state);
        } else {
            setBuilderCompatible(false);
        }
        setDefinitionText(stringifyDef(def));
        setDefinitionTextDirty(false);
    }, []);

    useEffect(() => {
        if (mode === 'edit' && editRule) {
            setName(editRule.name);
            setEnabled(editRule.enabled);
            setPriority(editRule.priority);
            setPendingSource(editRule.source);
            const parsed = parseInsightRuleDefinition(editRule.definition);
            if (!parsed.ok) {
                setJsonError(parsed.error);
                setBuilderCompatible(false);
                setDefinitionText(JSON.stringify(editRule.definition, null, 2));
                setDefinitionTextDirty(false);
                setAiPrompt('');
                return;
            }
            setJsonError(null);
            applyParsedDefinition(parsed.value);
            setAiPrompt('');
            return;
        }
        if (mode === 'create') {
            if (createSeed) {
                setName(createSeed.name);
                setEnabled(createSeed.enabled);
                setPriority(createSeed.priority);
                setPendingSource(createSeed.source ?? 'user');
                const parsed = parseInsightRuleDefinition(createSeed.definition);
                if (!parsed.ok) {
                    setJsonError(parsed.error);
                    setBuilderCompatible(false);
                    setDefinitionText(JSON.stringify(createSeed.definition, null, 2));
                    setDefinitionTextDirty(false);
                } else {
                    setJsonError(null);
                    applyParsedDefinition(parsed.value);
                }
            } else {
                const e = emptyCreateState();
                setName(e.name);
                setEnabled(e.enabled);
                setPriority(e.priority);
                setPendingSource(e.pendingSource);
                setBuilderCompatible(e.builderCompatible);
                setBuilderState(e.builderState);
                setDefinitionText(e.definitionText);
                setDefinitionTextDirty(e.definitionTextDirty);
                setJsonError(e.jsonError);
            }
            setAiPrompt('');
        }
    // Intentionally only `instanceKey` + `mode`: avoid resetting when parent passes a new
    // `editRule` object reference for the same id (e.g. after list refetch).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate on instanceKey only
    }, [mode, instanceKey]);

    useEffect(() => {
        if (!builderCompatible) return;
        if (definitionTextDirty) return;
        setDefinitionText(stringifyDef(builderStateToDefinition(builderState)));
    }, [builderState, builderCompatible, definitionTextDirty]);

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

    const copyDefinitionJson = useCallback(async () => {
        try {
            const resolved = resolveDefinition();
            let text = definitionText;
            if (resolved.ok) {
                const useMask = copyMaskAmounts && extractInsightRuleImportTuningSlots(resolved.value).length > 0;
                text = useMask
                    ? JSON.stringify(maskInsightRuleDefinitionForExport(resolved.value), null, 2)
                    : stringifyDef(resolved.value);
            }
            await navigator.clipboard.writeText(text);
            setDefinitionJsonCopyHint('ok');
        } catch {
            setDefinitionJsonCopyHint('err');
        }
        window.setTimeout(() => setDefinitionJsonCopyHint('idle'), 2000);
    }, [copyMaskAmounts, definitionText, builderCompatible, definitionTextDirty, builderState, t]);

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
            onInvalidate();
            onSuccess();
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
            onInvalidate();
            onSuccess();
        },
        onError: (e: Error) => alert(e.message),
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
            setName(d.name);
            setEnabled(false);
            setPriority(0);
            setPendingSource('ai');
            applyParsedDefinition(parsed.value);
            setAiPrompt('');
        },
        onError: (e: Error) => alert(e.message),
    });

    const saveDisabled =
        !name.trim() ||
        (builderCompatible && !definitionTextDirty && !isBuilderStateSavable(builderState));

    const creating = mode === 'create';
    const editing = mode === 'edit' && editRule;

    return (
        <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            {creating && showAiDraftSection && (
                <div className="space-y-2 pb-3 border-b border-indigo-200/70">
                    <p className="text-xs font-medium text-violet-900">{t('insight_rules.create_with_ai')}</p>
                    <p className="text-xs text-gray-600">{t('insight_rules.ai_draft_hint')}</p>
                    <div className="flex gap-2 items-stretch">
                        <input
                            type="text"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder={t('insight_rules.ai_draft_prompt_placeholder')}
                            className="flex-1 min-w-0 h-10 box-border rounded-lg border border-violet-200 bg-white px-3 text-sm"
                        />
                        <button
                            type="button"
                            onClick={() => aiDraftMutation.mutate()}
                            disabled={aiDraftMutation.isPending || !aiPrompt.trim()}
                            className="h-10 min-w-[2.5rem] shrink-0 px-3 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                            aria-label={t('insight_rules.ai_draft_button')}
                            aria-busy={aiDraftMutation.isPending}
                        >
                            {aiDraftMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                            ) : (
                                t('insight_rules.ai_draft_button')
                            )}
                        </button>
                    </div>
                </div>
            )}
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

            {builderCompatible && <InsightRuleEditor state={builderState} onChange={handleBuilderChange} />}

            {builderCompatible ? (
                <details className="rounded-xl border border-gray-200 bg-white">
                    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700">
                        {t('insight_rules.advanced_json')}
                    </summary>
                    <div className="border-t border-gray-100 px-4 pb-4 pt-2 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-xs text-gray-500 flex-1 min-w-[8rem]">{t('insight_rules.advanced_json_hint')}</p>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                <label className="flex items-center gap-2 text-xs text-gray-600">
                                    <input
                                        type="checkbox"
                                        checked={copyMaskAmounts}
                                        onChange={(e) => setCopyMaskAmounts(e.target.checked)}
                                    />
                                    {t('insight_rules.copy_mask_amounts')}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => void copyDefinitionJson()}
                                    className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    {t('insight_rules.copy_json')}
                                </button>
                                {definitionJsonCopyHint === 'ok' && (
                                    <span className="text-xs text-emerald-700">{t('insight_rules.json_copied')}</span>
                                )}
                                {definitionJsonCopyHint === 'err' && (
                                    <span className="text-xs text-red-600">{t('insight_rules.json_copy_failed')}</span>
                                )}
                            </div>
                        </div>
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
                    <div className="flex flex-wrap items-end justify-between gap-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">{t('insight_rules.definition_json')}</label>
                        <div className="flex flex-col items-end gap-1">
                            <label className="flex items-center gap-2 text-xs text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={copyMaskAmounts}
                                    onChange={(e) => setCopyMaskAmounts(e.target.checked)}
                                />
                                {t('insight_rules.copy_mask_amounts')}
                            </label>
                            <button
                                type="button"
                                onClick={() => void copyDefinitionJson()}
                                className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                                {t('insight_rules.copy_json')}
                            </button>
                            {definitionJsonCopyHint === 'ok' && (
                                <span className="text-xs text-emerald-700">{t('insight_rules.json_copied')}</span>
                            )}
                            {definitionJsonCopyHint === 'err' && (
                                <span className="text-xs text-red-600">{t('insight_rules.json_copy_failed')}</span>
                            )}
                        </div>
                    </div>
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
                                updateMutation.mutate(editRule);
                            }}
                            disabled={saveDisabled || updateMutation.isPending}
                            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                        >
                            {t('common.save')}
                        </button>
                        <button
                            type="button"
                            onClick={() => evaluateMutation.mutate(editRule.id)}
                            disabled={evaluateMutation.isPending}
                            className="px-4 py-2 rounded-lg border border-indigo-200 text-indigo-800 text-sm font-medium"
                        >
                            {t('insight_rules.test')}
                        </button>
                    </>
                )}
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-50"
                >
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    );
}
