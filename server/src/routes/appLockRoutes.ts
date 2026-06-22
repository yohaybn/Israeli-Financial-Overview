import { Router } from 'express';
import { appLockService } from '../services/appLockService.js';
import { appBlockerService } from '../services/appBlockerService.js';
import { profileService } from '../services/profileService.js';
import { notifySchedulerScrapeAfterUnlockOrStartup } from '../services/schedulerUnlockCoordinator.js';

export const appLockRoutes = Router();

appLockRoutes.get('/status', (_req, res) => {
    const lockConfigured = appLockService.isLockConfigured();
    const unlocked = appLockService.isUnlocked();
    res.json({
        success: true,
        data: {
            lockConfigured,
            unlocked,
            /** When true, UI should show warning and block scrape / new profile until unlocked */
            restricted: lockConfigured && !unlocked,
            fullBlockerEnabled: appBlockerService.isBlockerEnabled()
        }
    });
});

appLockRoutes.post('/unlock', async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
        return res.status(400).json({ success: false, error: 'password is required' });
    }

    // Brute-force check
    const lockout = appBlockerService.isLockedOut();
    if (lockout.locked) {
        return res.status(429).json({
            success: false,
            error: 'locked_out',
            retryAfterMs: lockout.retryAfterMs,
            message: `Too many attempts. Try again in ${Math.ceil((lockout.retryAfterMs || 0) / 60000)} minutes.`,
        });
    }

    // Progressive delay
    const delay = appBlockerService.getDelayMs();
    if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (!appLockService.tryUnlock(password)) {
        appBlockerService.recordFailedAttempt();
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    // Success — issue token
    appBlockerService.recordSuccessfulAttempt();
    const session = appBlockerService.issueToken();

    try {
        const migration = await profileService.migrateFromEnvIfNeeded();
        notifySchedulerScrapeAfterUnlockOrStartup();
        return res.json({
            success: true,
            token: session.token,
            expiresAt: session.expiresAt,
            migratedProfiles: migration.migrated,
            migrationSkipped: migration.skipped
        });
    } catch (e: any) {
        return res.status(500).json({ success: false, error: e?.message || 'Migration failed' });
    }
});

appLockRoutes.post('/lock', (_req, res) => {
    appLockService.lock();
    appBlockerService.revokeAllTokens();
    res.json({ success: true });
});

/** One-time: create lock file and set password (only when not yet configured). */
appLockRoutes.post('/setup', async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
        return res.status(400).json({ success: false, error: 'password is required' });
    }
    const result = appLockService.setupPassword(password);
    if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error || 'Setup failed' });
    }
    
    // Automatically issue a token on successful setup
    appBlockerService.recordSuccessfulAttempt();
    const session = appBlockerService.issueToken();

    try {
        const migration = await profileService.migrateFromEnvIfNeeded();
        notifySchedulerScrapeAfterUnlockOrStartup();
        return res.json({
            success: true,
            token: session.token,
            expiresAt: session.expiresAt,
            migratedProfiles: migration.migrated,
            migrationSkipped: migration.skipped
        });
    } catch (e: any) {
        return res.status(500).json({ success: false, error: e?.message || 'Migration failed' });
    }
});

// =======================================================================
// App Blocker Feature Flag & Token Management
// =======================================================================

appLockRoutes.get('/blocker-config', (_req, res) => {
    const config = appBlockerService.getBlockerConfig();
    res.json({
        success: true,
        data: {
            fullBlockerEnabled: config.fullBlockerEnabled,
            tokenTtlHours: Math.round(config.tokenTtlMs / 3600000)
        }
    });
});

appLockRoutes.post('/blocker-config', (req, res) => {
    const { tokenTtlHours } = req.body;
    
    if (typeof tokenTtlHours === 'number' && tokenTtlHours > 0) {
        appBlockerService.setTokenTtlMs(tokenTtlHours * 3600000);
    }

    const config = appBlockerService.getBlockerConfig();
    res.json({
        success: true,
        data: {
            fullBlockerEnabled: config.fullBlockerEnabled,
            tokenTtlHours: Math.round(config.tokenTtlMs / 3600000)
        }
    });
});

appLockRoutes.post('/token/validate', (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const info = appBlockerService.getTokenInfo(token);
    res.json({
        success: true,
        data: info
    });
});

appLockRoutes.post('/token/revoke', (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (token) {
        appBlockerService.revokeToken(token);
    }
    res.json({ success: true });
});
