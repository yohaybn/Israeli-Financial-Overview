import express from 'express';
import { SchedulerService } from '../services/schedulerService.js';
import { serviceLogger as logger } from '../utils/logger.js';
import { appLockService } from '../services/appLockService.js';

export function createSchedulerRoutes(schedulerService: SchedulerService) {
    const router = express.Router();

    router.get('/config', (req, res) => {
        try {
            const config = schedulerService.getConfig();
            res.json({ success: true, data: config });
        } catch (error) {
            logger.error('Failed to get scheduler config', { error });
            res.status(500).json({ success: false, error: 'Failed to retrieve scheduler configuration' });
        }
    });

    router.post('/config', (req, res) => {
        try {
            const newConfig = req.body;
            schedulerService.updateConfig(newConfig);
            res.json({ success: true, data: schedulerService.getConfig() });
        } catch (error) {
            logger.error('Failed to update scheduler config', { error });
            res.status(500).json({ success: false, error: 'Failed to update scheduler configuration' });
        }
    });

    router.post('/run-now', async (req, res) => {
        try {
            if (!appLockService.isUnlocked()) {
                return res.status(423).json({
                    success: false,
                    error: 'Application is locked. Unlock in the web UI before running scheduled scrapes.',
                    code: 'APP_LOCKED'
                });
            }
            // Run in background, don't wait for completion
            schedulerService.runScheduledScrape().catch(err => {
                logger.error('Manual scheduled run failed', { error: err });
            });

            res.json({ success: true, message: 'Scheduled scrape job triggered in background' });
        } catch (error) {
            logger.error('Failed to trigger manual run', { error });
            res.status(500).json({ success: false, error: 'Failed to trigger manual run' });
        }
    });

    return router;
}
