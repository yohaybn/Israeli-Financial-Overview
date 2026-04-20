import crypto from 'crypto';
import type { Scraper, ScraperCredentials } from 'israeli-bank-scrapers';

const TTL_MS = 15 * 60 * 1000;

const sessions = new Map<string, { scraper: Scraper<ScraperCredentials>; expiresAt: number }>();

function pruneExpired(): void {
    const now = Date.now();
    for (const [id, entry] of sessions) {
        if (now > entry.expiresAt) {
            sessions.delete(id);
        }
    }
}

export function registerOneZeroOtpSession(scraper: Scraper<ScraperCredentials>): string {
    pruneExpired();
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { scraper, expiresAt: Date.now() + TTL_MS });
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
}
