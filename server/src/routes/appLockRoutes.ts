import { Router } from 'express';
import { appLockService } from '../services/appLockService.js';
import { profileService } from '../services/profileService.js';

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
            restricted: lockConfigured && !unlocked
        }
    });
});

appLockRoutes.post('/unlock', async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
        return res.status(400).json({ success: false, error: 'password is required' });
    }
    if (!appLockService.tryUnlock(password)) {
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    try {
        const migration = await profileService.migrateFromEnvIfNeeded();
        return res.json({
            success: true,
            migratedProfiles: migration.migrated,
            migrationSkipped: migration.skipped
        });
    } catch (e: any) {
        return res.status(500).json({ success: false, error: e?.message || 'Migration failed' });
    }
});

appLockRoutes.post('/lock', (_req, res) => {
    appLockService.lock();
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
    try {
        const migration = await profileService.migrateFromEnvIfNeeded();
        return res.json({
            success: true,
            migratedProfiles: migration.migrated,
            migrationSkipped: migration.skipped
        });
    } catch (e: any) {
        return res.status(500).json({ success: false, error: e?.message || 'Migration failed' });
    }
});
