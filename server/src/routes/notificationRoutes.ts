import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notifications/notificationService.js';
import { serverLogger as logger } from '../utils/logger.js';

export function createNotificationRoutes(): Router {
  const router = Router();

  router.get('/channels', (req: Request, res: Response) => {
    try {
      const channels = notificationService.getAvailableChannels();
      res.json({ success: true, data: channels });
    } catch (error) {
      logger.error('Failed to get notification channels', { error });
      res.status(500).json({ success: false, error: 'Failed to get channels' });
    }
  });

  router.get('/config', (req: Request, res: Response) => {
    try {
      const cfg = notificationService.getConfig();
      res.json({ success: true, data: cfg });
    } catch (error) {
      logger.error('Failed to get notification config', { error });
      res.status(500).json({ success: false, error: 'Failed to get config' });
    }
  });

  router.put('/config', (req: Request, res: Response) => {
    try {
      const update = req.body;
      notificationService.updateConfig(update);
      res.json({ success: true, data: notificationService.getConfig() });
    } catch (error) {
      logger.error('Failed to update notification config', { error });
      res.status(500).json({ success: false, error: 'Failed to update config' });
    }
  });

  return router;
}
