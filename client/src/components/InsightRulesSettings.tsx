import { useCallback, useState, type SyntheticEvent } from 'react';
import { Pencil, Share2, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
    applyInsightRuleImportTuningSlots,
    COMMUNITY_INSIGHT_RULE_SUBMISSION_VERSION,
    extractInsightRuleImportTuningSlots,
    parseCommunityInsightRuleSubmission,
    parseInsightRuleDefinition,
    parseInsightRulesExportDocument,
    type InsightRulesExportDocument,
} from '@app/shared';
import { api } from '../lib/api';
import { loadCommunityInsightRulesSettings, saveCommunityInsightRulesSettings } from '../lib/communityInsightRulesSettings';
import { buildDefaultCommunityShareNote } from '../lib/insightRuleShareNote';
import { CollapsibleCard } from './CollapsibleCard';
import { InsightRuleForm } from './insight-rules/InsightRuleForm';
import { InsightRuleImportReviewModal } from './insight-rules/InsightRuleImportReviewModal';
import type { InsightRuleRow } from './insight-rules/insightRuleFormTypes';
import { CommunityInsightRulesPanel } from './community-insight-rules/CommunityInsightRulesPanel';

export const INSIGHT_RULES_QUERY_KEY = ['insight-rules'] as const;

export function InsightRulesSettings({
    isInline = false,
    standaloneTab = false,
}: {
    isInline?: boolean;
    standaloneTab?: boolean;
}) {
    const { t, i18n } = useTranslation();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<InsightRuleRow | null>(null);
    const [creating, setCreating] = useState(false);
    const [createSessionId, setCreateSessionId] = useState(0);
    const [importText, setImportText] = useState('');
    const [mergeImport, setMergeImport] = useState(true);
    const [importReview, setImportReview] = useState<null | { doc: InsightRulesExportDocument; merge: boolean }>(null);
    const [importTuningValues, setImportTuningValues] = useState<Record<string, Record<string, string>>>({});
    const [createPanelOpen, setCreatePanelOpen] = useState(false);

    const [shareOpenForId, setShareOpenForId] = useState<string | null>(null);
    const [shareAuthor, setShareAuthor] = useState('');
    /** Editable catalog blurb (top-level `description`); pre-filled from the rule, user may override. */
    const [shareDescription, setShareDescription] = useState('');
    /** When true (default), community proxy and definition JSON use "X" for numeric thresholds. */
    const [shareMaskAmounts, setShareMaskAmounts] = useState(true);
    const [shareBusy, setShareBusy] = useState(false);
    const [shareFeedback, setShareFeedback] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null);

    const { data: communityConfig } = useQuery({
        queryKey: ['community-insight-rules-config'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: { submitViaProxy: boolean } }>(
                '/community/insight-rules/config'
            );
            return data.data;
        },
    });
    const submitViaProxy = communityConfig?.submitViaProxy === true;

    const submitRuleToCommunity = useCallback(
        async (row: InsightRuleRow) => {
            const author = shareAuthor.trim();
            if (!author) {
                setShareFeedback({ tone: 'err', text: t('insight_rules.community_author_required') });
                return;
            }
            if (!submitViaProxy) {
                setShareFeedback({ tone: 'warn', text: t('insight_rules.community_proxy_required_hint') });
                return;
            }
            const parsedForShareNote = parseInsightRuleDefinition(row.definition);
            const generatedNote =
                parsedForShareNote.ok
                    ? buildDefaultCommunityShareNote(parsedForShareNote.value, t, i18n.language, {
                          maskAmounts: shareMaskAmounts,
                      }).trim()
                    : '';
            const submissionNote = (shareDescription.trim() || generatedNote) || undefined;
            const submission = {
                version: COMMUNITY_INSIGHT_RULE_SUBMISSION_VERSION,
                author,
                description: submissionNote,
                rule: {
                    id: row.id,
                    name: row.name,
                    enabled: row.enabled,
                    priority: row.priority,
                    source: row.source,
                    definition: row.definition,
                },
            };
            const parsed = parseCommunityInsightRuleSubmission(submission);
            if (!parsed.ok) {
                setShareFeedback({ tone: 'err', text: parsed.error });
                return;
            }
            const idempotencyKey =
                typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
            setShareBusy(true);
            setShareFeedback(null);
            try {
                const { data } = await api.post<{
                    success: boolean;
                    error?: string;
                    data?: { ok?: boolean; error?: string };
                }>('/community/insight-rules/submit', {
                    ...submission,
                    idempotencyKey,
                    maskAmounts: shareMaskAmounts,
                });
                if (!data.success) {
                    setShareFeedback({ tone: 'err', text: data.error || t('insight_rules.community_share_failed') });
                    return;
                }
                const gasBody = data.data;
                if (gasBody && typeof gasBody === 'object' && gasBody.ok === false) {
                    setShareFeedback({
                        tone: 'err',
                        text:
                            typeof gasBody.error === 'string'
                                ? gasBody.error
                                : t('insight_rules.community_share_failed'),
                    });
                    return;
                }
                saveCommunityInsightRulesSettings({ lastAuthor: author });
                setShareFeedback({ tone: 'ok', text: t('insight_rules.community_share_ok') });
            } catch (e: unknown) {
                if (axios.isAxiosError(e) && e.response?.data !== undefined) {
                    const d = e.response.data;
                    setShareFeedback({
                        tone: 'err',
                        text: typeof d === 'string' ? d : JSON.stringify(d),
                    });
                    return;
                }
                setShareFeedback({ tone: 'err', text: e instanceof Error ? e.message : String(e) });
            } finally {
                setShareBusy(false);
            }
        },
        [shareAuthor, shareDescription, shareMaskAmounts, submitViaProxy, t, i18n.language]
    );

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

    const handleCreatePanelToggle = useCallback((e: SyntheticEvent<HTMLDetailsElement>) => {
        const nextOpen = e.currentTarget.open;
        setCreatePanelOpen(nextOpen);
        if (nextOpen) {
            setCreating(true);
            setEditing(null);
            setCreateSessionId((n) => n + 1);
        } else {
            setCreating(false);
        }
    }, []);

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

    const importMutation = useMutation({
        mutationFn: async (payload: { doc: InsightRulesExportDocument; merge: boolean }) => {
            await api.post('/insight-rules/import', {
                format: payload.doc.format,
                version: payload.doc.version,
                exportedAt: payload.doc.exportedAt,
                rules: payload.doc.rules,
                merge: payload.merge,
            });
        },
        onSuccess: () => {
            invalidate();
            setImportText('');
            setImportReview(null);
            setImportTuningValues({});
        },
        onError: (e: Error) => alert(e.message),
    });

    const openImportReview = useCallback(() => {
        let body: unknown;
        try {
            body = JSON.parse(importText);
        } catch {
            alert(t('insight_rules.invalid_json'));
            return;
        }
        const parsed = parseInsightRulesExportDocument(body);
        if (!parsed.ok) {
            alert(parsed.error);
            return;
        }
        const init: Record<string, Record<string, string>> = {};
        for (const r of parsed.value.rules) {
            const slots = extractInsightRuleImportTuningSlots(r.definition);
            init[r.id] = {};
            for (const s of slots) {
                const masked = r.maskedAmountSlotIds?.includes(s.id);
                init[r.id][s.id] = masked ? 'X' : s.initialValue;
            }
        }
        setImportTuningValues(init);
        setImportReview({ doc: parsed.value, merge: mergeImport });
    }, [importText, mergeImport, t]);

    const handleImportSlotChange = useCallback((ruleId: string, slotId: string, value: string) => {
        setImportTuningValues((prev) => ({
            ...prev,
            [ruleId]: { ...(prev[ruleId] ?? {}), [slotId]: value },
        }));
    }, []);

    const confirmImportReview = useCallback(() => {
        if (!importReview) return;
        const { doc, merge } = importReview;
        const nextRules: InsightRulesExportDocument['rules'] = [];
        for (const r of doc.rules) {
            const slots = extractInsightRuleImportTuningSlots(r.definition);
            const applied = applyInsightRuleImportTuningSlots(r.definition, slots, importTuningValues[r.id] ?? {});
            if (!applied.ok) {
                alert(`${r.name}: ${applied.error}`);
                return;
            }
            const reparse = parseInsightRuleDefinition(applied.value);
            if (!reparse.ok) {
                alert(`${r.name}: ${reparse.error}`);
                return;
            }
            nextRules.push({
                id: r.id,
                name: r.name,
                enabled: r.enabled,
                priority: r.priority,
                source: r.source,
                definition: reparse.value,
            });
        }
        importMutation.mutate({ doc: { ...doc, rules: nextRules }, merge });
    }, [importReview, importTuningValues, importMutation]);

    const openEdit = (row: InsightRuleRow) => {
        setEditing(row);
        setCreating(false);
        setCreatePanelOpen(false);
    };

    const inner = (
        <>
            <p className="text-sm text-gray-600">{t('insight_rules.help')}</p>
            {rules && rules.length > 0 && !creating && !editing && (
                <p className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                    {t('insight_rules.open_builder_hint')}
                </p>
            )}

            {isLoading ? (
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
            ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                    {(rules ?? []).map((r) => (
                        <li key={r.id} className="py-3 px-3 text-sm space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                                    {r.source === 'ai' && (
                                        <span className="text-xs bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded shrink-0">
                                            AI
                                        </span>
                                    )}
                                    <span className="font-medium min-w-0 truncate">{r.name}</span>
                                    <span
                                        className="text-xs text-gray-500 shrink-0 cursor-help"
                                        title={t('insight_rules.priority_badge_title', { n: r.priority })}
                                    >
                                        p{r.priority}
                                    </span>
                                    {!r.enabled && (
                                        <span className="text-xs text-amber-700 shrink-0">{t('common.disabled')}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0 ms-auto">
                                    <button
                                        type="button"
                                        onClick={() => evaluateMutation.mutate(r.id)}
                                        className="text-indigo-600 text-xs px-1.5 py-1 rounded-lg hover:bg-indigo-50"
                                    >
                                        {t('insight_rules.test')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openEdit(r)}
                                        className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50"
                                        aria-label={t('common.edit')}
                                        title={t('common.edit')}
                                    >
                                        <Pencil className="w-4 h-4" strokeWidth={2} aria-hidden />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (shareOpenForId === r.id) {
                                                setShareOpenForId(null);
                                                setShareFeedback(null);
                                            } else {
                                                setShareOpenForId(r.id);
                                                setShareFeedback(null);
                                                const s = loadCommunityInsightRulesSettings();
                                                setShareAuthor(s.lastAuthor || '');
                                                const pd = parseInsightRuleDefinition(r.definition);
                                                setShareDescription(
                                                    pd.ok
                                                        ? buildDefaultCommunityShareNote(pd.value, t, i18n.language, {
                                                              maskAmounts: shareMaskAmounts,
                                                          })
                                                        : ''
                                                );
                                            }
                                        }}
                                        className="p-1.5 rounded-lg text-violet-700 hover:bg-violet-50"
                                        aria-label={
                                            shareOpenForId === r.id
                                                ? t('insight_rules.community_share_close')
                                                : t('insight_rules.community_share_rule')
                                        }
                                        title={
                                            shareOpenForId === r.id
                                                ? t('insight_rules.community_share_close')
                                                : t('insight_rules.community_share_rule')
                                        }
                                    >
                                        {shareOpenForId === r.id ? (
                                            <X className="w-4 h-4" strokeWidth={2} aria-hidden />
                                        ) : (
                                            <Share2 className="w-4 h-4" strokeWidth={2} aria-hidden />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (confirm(t('insight_rules.confirm_delete'))) deleteMutation.mutate(r.id);
                                        }}
                                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                                        aria-label={t('common.delete')}
                                        title={t('common.delete')}
                                    >
                                        <Trash2 className="w-4 h-4" strokeWidth={2} aria-hidden />
                                    </button>
                                </div>
                            </div>
                            {shareOpenForId === r.id && (
                                <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 space-y-2 text-xs">
                                    <p className="font-semibold text-violet-900">
                                        {t('insight_rules.community_share_form_title', { name: r.name })}
                                    </p>
                                    {!submitViaProxy && (
                                        <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 whitespace-pre-line">
                                            {t('insight_rules.community_proxy_required_hint')}
                                        </p>
                                    )}
                                    <label className="block">
                                        <span className="text-gray-600">{t('insight_rules.community_author')}</span>
                                        <input
                                            className="mt-0.5 w-full max-w-md rounded border border-gray-200 p-1.5 text-sm"
                                            value={shareAuthor}
                                            onChange={(e) => setShareAuthor(e.target.value)}
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-gray-600">{t('insight_rules.community_catalog_description')}</span>
                                        <p className="text-gray-500 font-normal mt-0.5 mb-0.5">
                                            {t('insight_rules.community_catalog_description_hint')}
                                        </p>
                                        <textarea
                                            className="mt-0.5 w-full max-w-md rounded border border-gray-200 p-1.5 text-sm min-h-[5rem]"
                                            value={shareDescription}
                                            onChange={(e) => setShareDescription(e.target.value)}
                                            rows={5}
                                            spellCheck
                                        />
                                    </label>
                                    <label className="flex items-center gap-2 text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={shareMaskAmounts}
                                            onChange={(e) => {
                                                const next = e.target.checked;
                                                setShareMaskAmounts(next);
                                                const pd = parseInsightRuleDefinition(r.definition);
                                                if (pd.ok) {
                                                    setShareDescription(
                                                        buildDefaultCommunityShareNote(pd.value, t, i18n.language, {
                                                            maskAmounts: next,
                                                        })
                                                    );
                                                }
                                            }}
                                        />
                                        {t('insight_rules.share_mask_amounts')}
                                    </label>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        <button
                                            type="button"
                                            disabled={shareBusy || !submitViaProxy}
                                            onClick={() => void submitRuleToCommunity(r)}
                                            className="px-3 py-1.5 rounded-lg bg-violet-700 text-white text-sm disabled:opacity-50"
                                        >
                                            {shareBusy ? t('common.loading') : t('insight_rules.community_share_button')}
                                        </button>
                                    </div>
                                    {shareFeedback && (
                                        <p
                                            role="status"
                                            className={
                                                shareFeedback.tone === 'ok'
                                                    ? 'text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-2 py-1'
                                                    : shareFeedback.tone === 'warn'
                                                      ? 'text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 whitespace-pre-line'
                                                      : 'text-red-800 bg-red-50 border border-red-100 rounded px-2 py-1 whitespace-pre-wrap break-words'
                                            }
                                        >
                                            {shareFeedback.text}
                                        </p>
                                    )}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {rules && rules.length === 0 && !isLoading && (
                <p className="text-sm text-gray-500">{t('insight_rules.empty')}</p>
            )}

            {!editing && (
                <details
                    className="rounded-xl border border-indigo-100 bg-indigo-50/30 text-sm"
                    open={createPanelOpen}
                    onToggle={handleCreatePanelToggle}
                >
                    <summary className="cursor-pointer select-none px-3 py-2 font-medium text-indigo-900">
                        {t('insight_rules.add_rule')}
                    </summary>
                    <div className="border-t border-indigo-100 px-3 pb-3 pt-2">
                        {createPanelOpen && creating && (
                            <InsightRuleForm
                                mode="create"
                                editRule={null}
                                createSeed={null}
                                instanceKey={`create-${createSessionId}`}
                                onCancel={() => {
                                    setCreating(false);
                                    setCreatePanelOpen(false);
                                }}
                                onSuccess={() => {
                                    setCreating(false);
                                    setCreatePanelOpen(false);
                                }}
                                onInvalidate={invalidate}
                            />
                        )}
                    </div>
                </details>
            )}
            {editing && (
                <InsightRuleForm
                    mode="edit"
                    editRule={editing}
                    createSeed={null}
                    instanceKey={editing.id}
                    showAiDraftSection={false}
                    onCancel={() => setEditing(null)}
                    onSuccess={() => setEditing(null)}
                    onInvalidate={invalidate}
                />
            )}

            <details className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-sm">
                <summary className="cursor-pointer select-none px-3 py-2 font-medium text-gray-700">
                    {t('insight_rules.import_collapsed_summary')}
                </summary>
                <div className="border-t border-gray-200 p-3 space-y-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase">{t('insight_rules.import_label')}</label>
                    <textarea
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        rows={4}
                        placeholder={t('insight_rules.import_placeholder')}
                        className="w-full font-mono text-xs rounded-lg border border-gray-200 p-2 bg-white"
                    />
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={mergeImport} onChange={(e) => setMergeImport(e.target.checked)} />
                        {t('insight_rules.merge_import')}
                    </label>
                    <button
                        type="button"
                        onClick={() => openImportReview()}
                        disabled={importMutation.isPending || !importText.trim()}
                        className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-sm"
                    >
                        {t('insight_rules.import_start_review')}
                    </button>
                </div>
            </details>

            <details className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-sm">
                <summary className="cursor-pointer select-none px-3 py-2 font-medium text-gray-700">
                    {t('insight_rules.community_heading')}
                </summary>
                <div className="border-t border-gray-200 p-3 space-y-2">
                    <CommunityInsightRulesPanel onImported={() => invalidate()} />
                </div>
            </details>

            {importReview && (
                <InsightRuleImportReviewModal
                    doc={importReview.doc}
                    values={importTuningValues}
                    onChangeSlot={handleImportSlotChange}
                    onClose={() => {
                        if (!importMutation.isPending) setImportReview(null);
                    }}
                    onConfirm={confirmImportReview}
                    busy={importMutation.isPending}
                />
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
