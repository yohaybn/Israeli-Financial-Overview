import { Router, Request, Response } from 'express';
import { postScrapeService } from '../services/postScrapeService.js';
import { serviceLogger as logger } from '../utils/logger.js';

export function createPostScrapeRoutes(): Router {
  const router = Router();

  router.get('/config', async (req: Request, res: Response) => {
    try {
      const cfg = await postScrapeService.getConfig();
      res.json({ success: true, data: cfg });
    } catch (error) {
      logger.error('Failed to get post-scrape config', { error });
      res.status(500).json({ success: false, error: 'Failed to get config' });
    }
  });

  router.put('/config', async (req: Request, res: Response) => {
    try {
      const update = req.body;
      const updated = await postScrapeService.updateConfig(update);
      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Failed to update post-scrape config', { error });
      res.status(500).json({ success: false, error: 'Failed to update config' });
    }
  });

  router.get('/review-alert', async (_req: Request, res: Response) => {
    try {
      const data = await postScrapeService.getReviewAlert();
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Failed to get review alert', { error });
      res.status(500).json({ success: false, error: 'Failed to get review alert' });
    }
  });

  router.delete('/review-alert', async (_req: Request, res: Response) => {
    try {
      await postScrapeService.clearReviewAlert();
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to clear review alert', { error });
      res.status(500).json({ success: false, error: 'Failed to clear review alert' });
    }
  });

  return router;
}
