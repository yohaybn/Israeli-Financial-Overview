import crypto from 'crypto';
import fs from 'fs-extra';
import { SECURITY_DIR, appLockService } from './appLockService.js';
import path from 'path';
import { serverLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveToken {
    token: string;
    issuedAt: number;
    expiresAt: number;
}

export interface BlockerConfig {
    fullBlockerEnabled: boolean;
    /** Token time-to-live in milliseconds. Default 24 h. */
    tokenTtlMs: number;
}

export interface LockoutInfo {
    locked: boolean;
    retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_TOKEN_TTL_MS = 60 * 60 * 1000;           // 1 hour
const MAX_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 8;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const LOCK_FILE = path.join(SECURITY_DIR, 'app-lock.json');

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AppBlockerService {
    // -----------------------------------------------------------------------
    // Token state — in-memory only (lost on restart = secure by design)
    // -----------------------------------------------------------------------
    private activeTokens: Map<string, ActiveToken> = new Map();

    // -----------------------------------------------------------------------
    // Brute-force state — in-memory
    // -----------------------------------------------------------------------
    private failedAttempts = 0;
    private lockoutUntil: number | null = null;

    // =======================================================================
    // Feature Flag
    // =======================================================================

    getBlockerConfig(): BlockerConfig {
        const fullBlockerEnabled = process.env.FULL_APP_BLOCKER_ENABLED === 'true';
        try {
            if (!fs.existsSync(LOCK_FILE)) {
                return { fullBlockerEnabled, tokenTtlMs: DEFAULT_TOKEN_TTL_MS };
            }
            const raw = fs.readJsonSync(LOCK_FILE) as Record<string, unknown>;
            return {
                fullBlockerEnabled,
                tokenTtlMs: this.clampTtl(
                    typeof raw.tokenTtlMs === 'number' ? raw.tokenTtlMs : DEFAULT_TOKEN_TTL_MS
                ),
            };
        } catch {
            return { fullBlockerEnabled, tokenTtlMs: DEFAULT_TOKEN_TTL_MS };
        }
    }

    /** Returns true when the full app blocker is enabled AND a password is configured. */
    isBlockerEnabled(): boolean {
        if (!appLockService.isLockConfigured()) {
            return false;
        }
        return this.getBlockerConfig().fullBlockerEnabled;
    }

    // setBlockerEnabled removed per user request: configured only via env var

    // =======================================================================
    // Token TTL Configuration
    // =======================================================================

    getTokenTtlMs(): number {
        return this.getBlockerConfig().tokenTtlMs;
    }

    /**
     * Set token TTL. Clamped to [1 hour, 30 days].
     * Takes effect on next token issuance; existing tokens keep their expiry.
     */
    setTokenTtlMs(ttlMs: number): void {
        const clamped = this.clampTtl(ttlMs);
        this.updateLockFile({ tokenTtlMs: clamped });
        serverLogger.info(`[AppBlocker] Token TTL set to ${clamped}ms (${(clamped / 3600000).toFixed(1)}h)`);
    }

    // =======================================================================
    // Token Management
    // =======================================================================

    /** Issue a new session token. Prunes expired tokens first. */
    issueToken(): ActiveToken {
        this.pruneExpiredTokens();
        const ttl = this.getTokenTtlMs();
        const now = Date.now();
        const entry: ActiveToken = {
            token: crypto.randomBytes(64).toString('hex'),
            issuedAt: now,
            expiresAt: now + ttl,
        };
        this.activeTokens.set(entry.token, entry);
        serverLogger.info(`[AppBlocker] Token issued, expires at ${new Date(entry.expiresAt).toISOString()}`);
        return entry;
    }

    /**
     * Validate a token string.
     *
     * Returns `{ valid: true }` when:
     *   - Blocker is OFF (classic mode — all requests pass), OR
     *   - No password configured (nothing to gate), OR
     *   - Token exists and has not expired.
     */
    validateToken(tokenStr: string | null | undefined): { valid: boolean; reason?: string } {
        // Blocker OFF → classic mode, everything passes
        if (!this.isBlockerEnabled()) {
            return { valid: true };
        }

        if (!tokenStr) {
            return { valid: false, reason: 'missing_token' };
        }

        const entry = this.activeTokens.get(tokenStr);
        if (!entry) {
            return { valid: false, reason: 'invalid_token' };
        }

        if (Date.now() > entry.expiresAt) {
            this.activeTokens.delete(tokenStr);
            return { valid: false, reason: 'session_expired' };
        }

        return { valid: true };
    }

    /** Revoke all active tokens (used on lock / disable). */
    revokeAllTokens(): void {
        const count = this.activeTokens.size;
        this.activeTokens.clear();
        if (count > 0) {
            serverLogger.info(`[AppBlocker] Revoked ${count} active token(s)`);
        }
    }

    /** Revoke a specific token. */
    revokeToken(tokenStr: string): boolean {
        return this.activeTokens.delete(tokenStr);
    }

    /** Get information about a token (for the /token/validate endpoint). */
    getTokenInfo(tokenStr: string): { valid: boolean; expiresAt?: number; reason?: string } {
        const result = this.validateToken(tokenStr);
        if (!result.valid) {
            return result;
        }
        const entry = this.activeTokens.get(tokenStr);
        return { valid: true, expiresAt: entry?.expiresAt };
    }

    // =======================================================================
    // Brute-Force Protection
    // =======================================================================

    /** Check if the service is in a lockout state. */
    isLockedOut(): LockoutInfo {
        if (this.lockoutUntil == null) {
            return { locked: false };
        }
        const remaining = this.lockoutUntil - Date.now();
        if (remaining <= 0) {
            this.lockoutUntil = null;
            this.failedAttempts = 0;
            return { locked: false };
        }
        return { locked: true, retryAfterMs: remaining };
    }

    /** Progressive delay based on failed attempts (0ms → 2s → 5s). */
    getDelayMs(): number {
        if (this.failedAttempts < 4) return 0;
        if (this.failedAttempts < 6) return 2000;
        if (this.failedAttempts <= MAX_ATTEMPTS_BEFORE_LOCKOUT) return 5000;
        return LOCKOUT_DURATION_MS;
    }

    /** Record a failed unlock attempt. May trigger lockout. */
    recordFailedAttempt(): void {
        this.failedAttempts++;
        serverLogger.warn(`[AppBlocker] Failed unlock attempt #${this.failedAttempts}`);
        if (this.failedAttempts > MAX_ATTEMPTS_BEFORE_LOCKOUT) {
            this.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
            serverLogger.warn(
                `[AppBlocker] Lockout triggered — ${LOCKOUT_DURATION_MS / 60000} min cooldown`
            );
        }
    }

    /** Reset brute-force counters after successful unlock. */
    recordSuccessfulAttempt(): void {
        this.failedAttempts = 0;
        this.lockoutUntil = null;
    }

    // =======================================================================
    // Internals
    // =======================================================================

    /** Remove expired tokens from the in-memory map. */
    private pruneExpiredTokens(): void {
        const now = Date.now();
        for (const [key, entry] of this.activeTokens) {
            if (now > entry.expiresAt) {
                this.activeTokens.delete(key);
            }
        }
    }

    /** Clamp TTL to the allowed range. */
    private clampTtl(ttlMs: number): number {
        if (!Number.isFinite(ttlMs) || ttlMs < MIN_TOKEN_TTL_MS) return MIN_TOKEN_TTL_MS;
        if (ttlMs > MAX_TOKEN_TTL_MS) return MAX_TOKEN_TTL_MS;
        return ttlMs;
    }

    /** Merge fields into the existing app-lock.json file. */
    private updateLockFile(patch: Record<string, unknown>): void {
        try {
            let existing: Record<string, unknown> = {};
            if (fs.existsSync(LOCK_FILE)) {
                existing = fs.readJsonSync(LOCK_FILE) as Record<string, unknown>;
            }
            const merged = { ...existing, ...patch };
            fs.ensureDirSync(path.dirname(LOCK_FILE));
            fs.writeJsonSync(LOCK_FILE, merged, { spaces: 2 });
        } catch (e) {
            serverLogger.error('[AppBlocker] Failed to update lock file', {
                message: e instanceof Error ? e.message : String(e),
            });
        }
    }
}

export const appBlockerService = new AppBlockerService();
