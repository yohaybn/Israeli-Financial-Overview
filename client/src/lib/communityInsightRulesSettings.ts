import type { CommunityInsightRulesIndexEntry } from '@app/shared';

const STORAGE_KEY = 'communityInsightRules.v1';
const CATALOG_CACHE_KEY = 'communityInsightRules.catalogCache.v1';

export type CommunityCatalogCachePayload = {
    indexUrl: string;
    fetchedAt: string;
    entries: CommunityInsightRulesIndexEntry[];
};

export function loadCommunityCatalogCache(): CommunityCatalogCachePayload | null {
    try {
        const raw = localStorage.getItem(CATALOG_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<CommunityCatalogCachePayload>;
        if (typeof parsed.indexUrl !== 'string' || typeof parsed.fetchedAt !== 'string' || !Array.isArray(parsed.entries)) {
            return null;
        }
        return {
            indexUrl: parsed.indexUrl,
            fetchedAt: parsed.fetchedAt,
            entries: parsed.entries as CommunityInsightRulesIndexEntry[],
        };
    } catch {
        return null;
    }
}

export function saveCommunityCatalogCache(indexUrl: string, entries: CommunityInsightRulesIndexEntry[]): void {
    try {
        const payload: CommunityCatalogCachePayload = {
            indexUrl,
            fetchedAt: new Date().toISOString(),
            entries,
        };
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(payload));
    } catch {
        /* ignore quota errors */
    }
}

export function clearCommunityCatalogCache(): void {
    try {
        localStorage.removeItem(CATALOG_CACHE_KEY);
    } catch {
        /* ignore */
    }
}

export type CommunityInsightRulesClientSettings = {
    /** Google Apps Script web app URL for POST (when not using server proxy). */
    gasWebAppUrl: string;
    /** Shared secret; only used when submitViaProxy is false. */
    authSecret: string;
    /** Public raw URL to community/index.json */
    catalogIndexUrl: string;
    /**
     * Prefix for rule files: e.g. https://raw.githubusercontent.com/owner/repo/main
     * Rule file URL = rawBaseUrl + '/' + entry.path (path uses forward slashes).
     */
    rawBaseUrl: string;
    lastAuthor: string;
};

function defaults(): CommunityInsightRulesClientSettings {
    return {
        gasWebAppUrl: '',
        authSecret: '',
        catalogIndexUrl: '',
        rawBaseUrl: '',
        lastAuthor: '',
    };
}

/** Re-export for “reset to official defaults” in UI. */
export { COMMUNITY_DEFAULT_CATALOG_INDEX_URL, COMMUNITY_DEFAULT_RAW_BASE_URL } from './communityInsightRulesDefaults.js';

export function loadCommunityInsightRulesSettings(): CommunityInsightRulesClientSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults();
        const parsed = JSON.parse(raw) as Partial<CommunityInsightRulesClientSettings>;
        return { ...defaults(), ...parsed };
    } catch {
        return defaults();
    }
}

export function saveCommunityInsightRulesSettings(patch: Partial<CommunityInsightRulesClientSettings>): void {
    const next = { ...loadCommunityInsightRulesSettings(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function buildRuleFileUrl(rawBaseUrl: string, repoRelativePath: string): string {
    const base = rawBaseUrl.replace(/\/+$/, '');
    const path = repoRelativePath.replace(/^\/+/, '');
    return `${base}/${path}`;
}
