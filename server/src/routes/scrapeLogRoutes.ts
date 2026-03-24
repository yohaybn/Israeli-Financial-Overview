import { Router } from 'express';
import {
  getScrapeRunLogs,
  getScrapeRunLogById,
  clearOldScrapeRunLogs,
  clearAllScrapeRunLogs,
} from '../utils/scrapeRunLogger.js';

const router = Router();

/**
 * Get a single scrape run log by id (for deep links)
 */
router.get('/logs/entry/:id', async (req, res) => {
  try {
    const entry = await getScrapeRunLogById(req.params.id);
    if (!entry) {
      res.status(404).json({ success: false, error: 'Log entry not found' });
      return;
    }
    res.json({ success: true, data: entry });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve scrape log entry',
    });
  }
});

/**
 * List scrape run logs (transactions count, saved file, post-scrape action statuses)
 */
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getScrapeRunLogs({
      limit: Math.min(limit, 1000),
      offset,
    });

    res.json({
      success: true,
      data: {
        logs: result.logs,
        total: result.total,
        offset,
        limit,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve scrape logs',
    });
  }
});

router.post('/logs/clear-old', async (req, res) => {
  try {
    const daysToRetain = parseInt(req.query.daysToRetain as string) || 30;
    await clearOldScrapeRunLogs(daysToRetain);
    res.json({
      success: true,
      message: `Cleared scrape logs older than ${daysToRetain} days`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear old scrape logs',
    });
  }
});

router.post('/logs/clear', async (_req, res) => {
  try {
    await clearAllScrapeRunLogs();
    res.json({ success: true, message: 'Cleared all scrape run logs' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear scrape logs',
    });
  }
});

export const scrapeLogRoutes = router;
