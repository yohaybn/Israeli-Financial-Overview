import { Router, Request, Response } from 'express';
import { postScrapeService } from '../services/postScrapeService.js';
import { serviceLogger as logger } from '../utils/logger.js';

export function createPostScrapeRoutes(): Router {
  const router = Router();

  router.get('/config', (req: Request, res: Response) => {
    try {
      const cfg = postScrapeService.getConfig();
      res.json({ success: true, data: cfg });
    } catch (error) {
      logger.error('Failed to get post-scrape config', { error });
      res.status(500).json({ success: false, error: 'Failed to get config' });
    }
  });

  router.put('/config', (req: Request, res: Response) => {
    try {
      const update = req.body;
      const updated = postScrapeService.updateConfig(update);
      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Failed to update post-scrape config', { error });
      res.status(500).json({ success: false, error: 'Failed to update config' });
    }
  });

  return router;
}
