import crypto from 'crypto';
import type { Scraper, ScraperCredentials } from 'israeli-bank-scrapers';

const TTL_MS = 15 * 60 * 1000;

const sessions = new Map<string, { scraper: Scraper<ScraperCredentials>; expiresAt: number }>();
/** Lets Telegram / API complete OTP using profile id after SMS was triggered with that profile */
const profileIdToSessionId = new Map<string, string>();

function pruneExpired(): void {
    const now = Date.now();
    for (const [id, entry] of sessions) {
        if (now > entry.expiresAt) {
            sessions.delete(id);
        }
    }
    for (const [pid, sid] of [...profileIdToSessionId.entries()]) {
        if (!sessions.has(sid)) {
            profileIdToSessionId.delete(pid);
        }
    }
}

export function registerOneZeroOtpSession(
    scraper: Scraper<ScraperCredentials>,
    profileId?: string
): string {
    pruneExpired();
    const pid = typeof profileId === 'string' ? profileId.trim() : '';
    if (pid) {
        const existingSid = profileIdToSessionId.get(pid);
        if (existingSid) {
            sessions.delete(existingSid);
            profileIdToSessionId.delete(pid);
        }
    }

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { scraper, expiresAt: Date.now() + TTL_MS });
    if (pid) {
        profileIdToSessionId.set(pid, sessionId);
    }
    return sessionId;
}

/** Returns the scraper if the session exists and is not expired; does not remove it. */
export function getOneZeroOtpSession(sessionId: string): Scraper<ScraperCredentials> | null {
    pruneExpired();
    const entry = sessions.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        sessions.delete(sessionId);
        return null;
    }
    return entry.scraper;
}

export function removeOneZeroOtpSession(sessionId: string): void {
    sessions.delete(sessionId);
    for (const [pid, sid] of [...profileIdToSessionId.entries()]) {
        if (sid === sessionId) {
            profileIdToSessionId.delete(pid);
        }
    }
}

/** Active OTP session id for this profile after trigger (same process). */
export function getBoundSessionIdForProfile(profileId: string): string | undefined {
    pruneExpired();
    const pid = typeof profileId === 'string' ? profileId.trim() : '';
    if (!pid) return undefined;
    const sid = profileIdToSessionId.get(pid);
    if (!sid || !sessions.has(sid)) {
        if (sid) profileIdToSessionId.delete(pid);
        return undefined;
    }
    return sid;
}

/**
 * Resolve session id: explicit id wins if still active; otherwise profile binding (web trigger → Telegram OTP).
 */
export function resolveOneZeroOtpSessionId(opts: {
    sessionId?: string;
    profileId?: string;
}): string | null {
    pruneExpired();
    const rawSid = typeof opts.sessionId === 'string' ? opts.sessionId.trim() : '';
    if (rawSid && sessions.has(rawSid)) {
        return rawSid;
    }
    const pid = typeof opts.profileId === 'string' ? opts.profileId.trim() : '';
    if (pid) {
        const sid = profileIdToSessionId.get(pid);
        if (sid && sessions.has(sid)) return sid;
    }
    return null;
}
