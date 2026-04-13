import { PROVIDERS } from '@app/shared';

const KNOWN_PROVIDER_IDS = new Set(PROVIDERS.map((p) => p.id));

const ACCOUNT_OVERRIDE_MAX_LEN = 200;

/** Allowlist: only registered scraper/provider ids (same options as Import UI). */
export function parseImportProviderIdParam(v: unknown): string | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string') return undefined;
    const id = v.trim();
    if (!id || !KNOWN_PROVIDER_IDS.has(id)) return undefined;
    return id;
}

/**
 * Free-text account label/number from the client; allow letters, digits, common punctuation, Hebrew.
 * Rejects control chars and characters that are risky in paths or logs.
 */
export function parseImportAccountNumberOverrideParam(v: unknown): string | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    if (!s || s.length > ACCOUNT_OVERRIDE_MAX_LEN) return undefined;
    if (!/^[\p{L}\p{N}\s.\-_/()]+$/u.test(s)) return undefined;
    return s;
}
