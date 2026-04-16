/**
 * Official Israeli Financial Overview community catalog (public GitHub raw URLs).
 * Submits go through the API (`/api/community/insight-rules/submit`) — never call Apps Script from the browser (CORS).
 */
export const COMMUNITY_DEFAULT_CATALOG_INDEX_URL =
    'https://raw.githubusercontent.com/yohaybn/Israeli-Financial-Overview-Community/main/community/index.json';

export const COMMUNITY_DEFAULT_RAW_BASE_URL =
    'https://raw.githubusercontent.com/yohaybn/Israeli-Financial-Overview-Community/main';

export function effectiveCatalogIndexUrl(stored: string): string {
    const t = stored.trim();
    return t || COMMUNITY_DEFAULT_CATALOG_INDEX_URL;
}

export function effectiveRawBaseUrl(stored: string): string {
    const t = stored.trim();
    return t || COMMUNITY_DEFAULT_RAW_BASE_URL;
}
