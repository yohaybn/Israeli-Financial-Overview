import { Router } from 'express';
import {
  getAILogs,
  getAILogsStats,
  clearOldAILogs,
  logAICall,
  logAIError
} from '../utils/aiLogger.js';

const router = Router();

/**
 * Get AI interaction logs
 * Query params:
 *   - limit: number of logs to return (default 100)
 *   - offset: pagination offset (default 0)
 *   - model: filter by model name
 *   - provider: filter by provider (gemini, openai, ollama)
 *   - includeErrors: include error logs (default true)
 */
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const model = req.query.model as string | undefined;
    const provider = req.query.provider as string | undefined;
    const includeErrors = req.query.includeErrors !== 'false';

    const result = await getAILogs({
      limit: Math.min(limit, 1000), // Cap at 1000
      offset,
      model,
      provider,
      includeErrors
    });

    res.json({
      success: true,
      data: {
        logs: result.logs,
        total: result.total,
        offset,
        limit
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve AI logs'
    });
  }
});

/**
 * Get AI logs statistics
 */
router.get('/logs/stats', async (req, res) => {
  try {
    const stats = await getAILogsStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve AI logs statistics'
    });
  }
});

/**
 * Clear old AI logs
 * Query params:
 *   - daysToRetain: number of days to retain (default 30)
 */
router.post('/logs/clear-old', async (req, res) => {
  try {
    const daysToRetain = parseInt(req.query.daysToRetain as string) || 30;
    await clearOldAILogs(daysToRetain);

    res.json({
      success: true,
      message: `Cleared AI logs older than ${daysToRetain} days`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear old AI logs'
    });
  }
});

export const aiLogRoutes = router;
