import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    parseCommunityInsightRuleRepoFile,
    parseCommunityInsightRulesIndex,
    sortCommunityIndexEntriesForDisplay,
    type CommunityInsightRulesIndexEntry,
} from '@app/shared';
import { InsightRuleCreateRuleModal } from '../insight-rules/InsightRuleCreateRuleModal';
import type { InsightRuleFormCreateSeed } from '../insight-rules/insightRuleFormTypes';
import {
    COMMUNITY_DEFAULT_CATALOG_INDEX_URL,
    COMMUNITY_DEFAULT_RAW_BASE_URL,
    effectiveCatalogIndexUrl,
    effectiveRawBaseUrl,
} from '../../lib/communityInsightRulesDefaults';
import {
    buildRuleFileUrl,
    clearCommunityCatalogCache,
    loadCommunityCatalogCache,
    loadCommunityInsightRulesSettings,
    saveCommunityCatalogCache,
    saveCommunityInsightRulesSettings,
} from '../../lib/communityInsightRulesSettings';

export function CommunityInsightRulesPanel({
    onImported,
}: {
    onImported: () => void;
}) {
    const { t } = useTranslation();
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [catalogIndexUrl, setCatalogIndexUrl] = useState('');
    const [rawBaseUrl, setRawBaseUrl] = useState('');
    const [indexEntries, setIndexEntries] = useState<CommunityInsightRulesIndexEntry[] | null>(null);
    const [indexError, setIndexError] = useState<string | null>(null);
    const [indexLoading, setIndexLoading] = useState(false);
    const [importBusyId, setImportBusyId] = useState<string | null>(null);
    const [catalogDraft, setCatalogDraft] = useState<null | { instanceKey: string; seed: InsightRuleFormCreateSeed }>(
        null
    );
    const [catalogActionMessage, setCatalogActionMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
    const catalogIndexUrlRef = useRef(catalogIndexUrl);
    catalogIndexUrlRef.current = catalogIndexUrl;

    useEffect(() => {
        const s = loadCommunityInsightRulesSettings();
        setCatalogIndexUrl(s.catalogIndexUrl);
        setRawBaseUrl(s.rawBaseUrl);
    }, []);

    const persistSettings = useCallback(() => {
        saveCommunityInsightRulesSettings({
            catalogIndexUrl: catalogIndexUrl.trim(),
            rawBaseUrl: rawBaseUrl.trim(),
        });
    }, [catalogIndexUrl, rawBaseUrl]);

    const loadCatalog = useCallback(
        async (opts?: { background?: boolean }) => {
            setCatalogActionMessage(null);
            const url = effectiveCatalogIndexUrl(catalogIndexUrl);
            if (!url) {
                setIndexError(t('insight_rules.community_index_url_required'));
                setIndexEntries(null);
                return;
            }
            const background = opts?.background === true;
            if (!background) {
                setIndexLoading(true);
            }
            setIndexError(null);
            try {
                const res = await fetch(url, { method: 'GET', cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json: unknown = await res.json();
                const parsed = parseCommunityInsightRulesIndex(json);
                if (!parsed.ok) throw new Error(parsed.error);
                const sorted = sortCommunityIndexEntriesForDisplay(parsed.value.rules);
                const currentUrl = effectiveCatalogIndexUrl(catalogIndexUrlRef.current);
                if (url === currentUrl) {
                    setIndexEntries(sorted);
                    saveCommunityCatalogCache(url, sorted);
                    setIndexError(null);
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                const currentUrl = effectiveCatalogIndexUrl(catalogIndexUrlRef.current);
                if (url === currentUrl) {
                    setIndexError(msg);
                    setIndexEntries(null);
                }
            } finally {
                if (!background) {
                    setIndexLoading(false);
                }
            }
        },
        [catalogIndexUrl, t]
    );

    useEffect(() => {
        const url = effectiveCatalogIndexUrl(catalogIndexUrl);
        const cached = loadCommunityCatalogCache();
        const cacheMatches = cached?.indexUrl === url;
        if (cacheMatches && cached) {
            setIndexEntries(sortCommunityIndexEntriesForDisplay(cached.entries));
            setIndexError(null);
        } else {
            setIndexEntries(null);
        }
        void loadCatalog({ background: cacheMatches });
    }, [catalogIndexUrl, loadCatalog]);

    const importEntry = async (entry: CommunityInsightRulesIndexEntry) => {
        setCatalogActionMessage(null);
        const base = effectiveRawBaseUrl(rawBaseUrl);
        if (!base) {
            setCatalogActionMessage({ tone: 'err', text: t('insight_rules.community_raw_base_required') });
            return;
        }
        const fileUrl = buildRuleFileUrl(base, entry.path);
        setImportBusyId(entry.id);
        try {
            const res = await fetch(fileUrl, { method: 'GET', cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json: unknown = await res.json();
            const parsed = parseCommunityInsightRuleRepoFile(json);
            if (!parsed.ok) throw new Error(parsed.error);
            const r = parsed.value.rule;
            const seed: InsightRuleFormCreateSeed = {
                name: r.name,
                enabled: true,
                priority: r.priority,
                source: r.source,
                definition: r.definition,
            };
            setCatalogDraft({
                instanceKey: `${entry.id}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`,
                seed,
            });
        } catch (e: unknown) {
            setCatalogActionMessage({ tone: 'err', text: e instanceof Error ? e.message : String(e) });
        } finally {
            setImportBusyId(null);
        }
    };

    const catalogModalOpen = catalogDraft !== null;

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                    <button
                        type="button"
                        onClick={() => void loadCatalog()}
                        disabled={indexLoading}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-800 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                        {indexLoading ? t('common.loading') : t('insight_rules.community_refresh_catalog')}
                    </button>
                    {indexError && <span className="text-xs text-red-600">{indexError}</span>}
                </div>
                {catalogActionMessage && (
                    <p
                        className={
                            catalogActionMessage.tone === 'ok'
                                ? 'text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1'
                                : 'text-xs text-red-800 bg-red-50 border border-red-100 rounded-lg px-2 py-1'
                        }
                    >
                        {catalogActionMessage.text}
                    </p>
                )}
                {indexEntries && indexEntries.length > 0 && (
                    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white max-h-56 overflow-y-auto">
                        {indexEntries.map((e) => (
                            <li key={e.id} className="py-3 px-3 text-sm space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                                        {e.featured && (
                                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded shrink-0">
                                                {t('insight_rules.community_featured')}
                                            </span>
                                        )}
                                        <span className="font-medium min-w-0 truncate">{e.name}</span>
                                        <span className="text-xs text-gray-500 shrink-0">{e.author}</span>
                                        <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                                            {e.submittedAt.slice(0, 10)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0 ms-auto">
                                        <button
                                            type="button"
                                            disabled={importBusyId === e.id || catalogModalOpen}
                                            onClick={() => void importEntry(e)}
                                            className="p-1.5 rounded-lg text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                                            aria-label={t('insight_rules.community_import')}
                                            title={t('insight_rules.community_import')}
                                            aria-busy={importBusyId === e.id}
                                        >
                                            {importBusyId === e.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} aria-hidden />
                                            ) : (
                                                <Download className="w-4 h-4" strokeWidth={2} aria-hidden />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                {e.description ? (
                                    <p
                                        className="text-xs text-gray-600 whitespace-pre-wrap break-words line-clamp-4"
                                        title={e.description}
                                    >
                                        {e.description}
                                    </p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
                {indexEntries && indexEntries.length === 0 && !indexError && (
                    <p className="text-xs text-gray-500">{t('insight_rules.community_catalog_empty')}</p>
                )}
            </div>

            <div className="border-t border-gray-200 pt-3 space-y-2">
                <button
                    type="button"
                    className="text-xs text-indigo-700 underline"
                    onClick={() => setAdvancedOpen((o) => !o)}
                >
                    {advancedOpen ? t('insight_rules.community_hide_advanced') : t('insight_rules.community_show_advanced')}
                </button>
                {advancedOpen && (
                    <div className="space-y-2 text-sm border border-gray-200 rounded-lg p-3 bg-gray-50/80">
                        <p className="text-xs text-gray-600">{t('insight_rules.community_help')}</p>
                        <p className="text-xs text-gray-600">{t('insight_rules.community_defaults_active_hint')}</p>
                        <p className="text-xs text-gray-600">{t('insight_rules.community_advanced_help')}</p>
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500 uppercase">
                                {t('insight_rules.community_catalog_index_url')}
                            </span>
                            <input
                                className="mt-1 w-full rounded border border-gray-200 p-1.5 text-xs font-mono bg-white"
                                value={catalogIndexUrl}
                                onChange={(e) => setCatalogIndexUrl(e.target.value)}
                                onBlur={persistSettings}
                                placeholder={COMMUNITY_DEFAULT_CATALOG_INDEX_URL}
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold text-gray-500 uppercase">
                                {t('insight_rules.community_raw_base_url')}
                            </span>
                            <input
                                className="mt-1 w-full rounded border border-gray-200 p-1.5 text-xs font-mono bg-white"
                                value={rawBaseUrl}
                                onChange={(e) => setRawBaseUrl(e.target.value)}
                                onBlur={persistSettings}
                                placeholder={COMMUNITY_DEFAULT_RAW_BASE_URL}
                            />
                        </label>
                        <button
                            type="button"
                            className="text-xs text-indigo-700 underline"
                            onClick={() => {
                                setCatalogIndexUrl('');
                                setRawBaseUrl('');
                                saveCommunityInsightRulesSettings({
                                    catalogIndexUrl: '',
                                    rawBaseUrl: '',
                                });
                                clearCommunityCatalogCache();
                            }}
                        >
                            {t('insight_rules.community_reset_official_urls')}
                        </button>
                    </div>
                )}
            </div>

            {catalogDraft && (
                <InsightRuleCreateRuleModal
                    open
                    instanceKey={catalogDraft.instanceKey}
                    createSeed={catalogDraft.seed}
                    onClose={() => setCatalogDraft(null)}
                    onInvalidate={onImported}
                    onSaved={() => {
                        setCatalogDraft(null);
                        setCatalogActionMessage({ tone: 'ok', text: t('insight_rules.community_import_ok') });
                    }}
                />
            )}
        </div>
    );
}
