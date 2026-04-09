import { Router } from 'express';
import { profileService } from '../services/profileService.js';
import { Profile, sanitizeProfileForClient } from '@app/shared';
import { appLockService } from '../services/appLockService.js';

const router = Router();

// List all profiles
router.get('/', async (req, res) => {
    try {
        const profiles = await profileService.getProfiles();
        res.json({ success: true, data: profiles.map(sanitizeProfileForClient) });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get a specific profile
router.get('/:id', async (req, res) => {
    try {
        const profile = await profileService.getProfile(req.params.id);
        if (!profile) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }
        res.json({ success: true, data: sanitizeProfileForClient(profile) });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create a new profile
router.post('/', async (req, res) => {
    try {
        if (!appLockService.isUnlocked()) {
            return res.status(423).json({
                success: false,
                error: 'Application is locked. Unlock in the web UI to add profiles.',
                code: 'APP_LOCKED'
            });
        }

        const data = req.body as Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;

        if (!data.name || !data.companyId) {
            return res.status(400).json({
                success: false,
                error: 'name and companyId are required'
            });
        }

        const profile = await profileService.createProfile(data);
        res.status(201).json({ success: true, data: sanitizeProfileForClient(profile) });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update a profile
router.put('/:id', async (req, res) => {
    try {
        if (!appLockService.isUnlocked()) {
            return res.status(423).json({
                success: false,
                error: 'Application is locked. Unlock in the web UI to edit profiles.',
                code: 'APP_LOCKED'
            });
        }

        const data = req.body as Partial<Profile>;
        const profile = await profileService.updateProfile(req.params.id, data);

        if (!profile) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }

        res.json({ success: true, data: sanitizeProfileForClient(profile) });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a profile
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await profileService.deleteProfile(req.params.id);

        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }

        res.json({ success: true, message: 'Profile deleted' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export const profileRoutes = router;
