import type { Profile } from './types.js';
import { PROVIDERS } from './providers.js';

/**
 * Credential field names that must never be exposed to API clients (passwords, tokens, etc.).
 */
export function getSensitiveCredentialFieldNames(companyId: string): Set<string> {
    const set = new Set<string>();
    const p = PROVIDERS.find((x) => x.id === companyId);
    if (p) {
        for (const f of p.credentialFields) {
            if (f.type === 'password') {
                set.add(f.name);
            }
            if (/token|secret/i.test(f.name)) {
                set.add(f.name);
            }
        }
    }
    return set;
}

function isHeuristicSensitiveKey(key: string): boolean {
    const lower = key.toLowerCase();
    if (lower === 'password' || lower === 'passwd') return true;
    if (/(^|_)(token|secret|otp)($|_)/i.test(key)) return true;
    if (/token|secret/i.test(key)) return true;
    return false;
}

export function isSensitiveCredentialKey(key: string, companyId: string): boolean {
    return getSensitiveCredentialFieldNames(companyId).has(key) || isHeuristicSensitiveKey(key);
}

/** Strip sensitive credential values before sending a profile to the client. */
export function sanitizeProfileForClient(profile: Profile): Profile {
    const creds = { ...profile.credentials };
    for (const key of Object.keys(creds)) {
        if (isSensitiveCredentialKey(key, profile.companyId)) {
            delete creds[key];
        }
    }
    return { ...profile, credentials: creds };
}

/**
 * Merge PATCH-style credential updates with stored credentials.
 * Sensitive fields are updated only when the incoming value is non-empty (blank means "keep existing").
 */
export function mergeProfileCredentialsOnUpdate(
    existing: Record<string, string>,
    incoming: Record<string, string> | undefined,
    companyId: string
): Record<string, string> {
    if (incoming === undefined) {
        return existing;
    }
    const out = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
        if (isSensitiveCredentialKey(key, companyId)) {
            if (typeof value === 'string' && value.trim() !== '') {
                out[key] = value.trim();
            }
        } else {
            out[key] = value ?? '';
        }
    }
    return out;
}
