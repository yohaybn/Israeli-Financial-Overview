/**
 * Pipeline Controller Routes
 * Exposes API endpoints for pipeline execution and configuration
 */

import { Router, Request, Response } from 'express';
import { PipelineController, PipelineConfig } from '../services/pipelineController.js';
import { serviceLogger as logger } from '../utils/logger.js';

export function createPipelineRoutes(
  pipelineController: PipelineController
): Router {
  const router = Router();

  /**
   * GET /api/pipeline/config
   * Retrieve current pipeline configuration
   */
  router.get('/config', (req: Request, res: Response) => {
    try {
      const config = pipelineController.getConfig();
      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error('Failed to get pipeline config', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve pipeline configuration',
      });
    }
  });

  /**
   * PUT /api/pipeline/config
   * Update pipeline configuration
   * Body: Partial<PipelineConfig>
   */
  router.put('/config', (req: Request, res: Response) => {
    try {
      const newConfig = req.body as Partial<PipelineConfig>;

      if (!newConfig || Object.keys(newConfig).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No configuration provided',
        });
      }

      pipelineController.updateConfig(newConfig);

      res.json({
        success: true,
        data: pipelineController.getConfig(),
      });
    } catch (error) {
      logger.error('Failed to update pipeline config', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to update pipeline configuration',
      });
    }
  });

  /**
   * POST /api/pipeline/execute
   * Execute the full pipeline with optional config override
   * Body: {
   *   scrapeRequest: ScrapeRequest,
   *   configOverride?: Partial<PipelineConfig>
   * }
   */
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { scrapeRequest, configOverride } = req.body;

      if (!scrapeRequest) {
        return res.status(400).json({
          success: false,
          error: 'Missing scrapeRequest in body',
        });
      }

      logger.info('Pipeline execution requested', {
        scrapeRequest: {
          companyId: scrapeRequest.companyId,
          credentials: '[REDACTED]',
        },
      });

      const result = await pipelineController.execute(
        scrapeRequest,
        configOverride
      );

      res.json({
        success: true,
        data: {
          pipelineId: result.pipelineId,
          executionStartTime: result.executionStartTime,
          stages: result.stages,
          summary: {
            successful: result.stages.filter((s) => s.success).length,
            failed: result.stages.filter((s) => !s.success).length,
            totalDuration:
              new Date().getTime() - result.executionStartTime.getTime(),
          },
        },
      });
    } catch (error) {
      logger.error('Pipeline execution failed', { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Pipeline execution failed',
      });
    }
  });

  /**
   * POST /api/pipeline/execute-quick
   * Quick execution with minimal configuration
   * Body: {
   *   companyId: string,
   *   credentials: Record<string, string>,
   *   options?: ScraperOptions,
   *   enabledStages?: string[],
   *   notificationChannels?: string[]
   * }
   */
  router.post('/execute-quick', async (req: Request, res: Response) => {
    try {
      const {
        companyId,
        credentials,
        options,
        enabledStages,
        notificationChannels,
      } = req.body;

      if (!companyId || !credentials) {
        return res.status(400).json({
          success: false,
          error: 'Missing companyId or credentials',
        });
      }

      const scrapeRequest = {
        companyId,
        credentials,
        options: options || {},
      };

      // Build config override based on enabledStages
      const configOverride: Partial<PipelineConfig> = {};

      if (enabledStages && Array.isArray(enabledStages)) {
        const stages = [
          'scrape',
          'catalog',
          'analyze',
          'upload',
          'notification',
        ] as const;
        stages.forEach((stage) => {
          (configOverride as any)[stage] = {
            ...(configOverride as any)[stage],
            enabled: enabledStages.includes(stage),
          };
        });
      }

      if (notificationChannels && Array.isArray(notificationChannels)) {
        if (!(configOverride as any).notification) {
          (configOverride as any).notification = {};
        }
        (configOverride as any).notification.channels = notificationChannels;
      }

      logger.info('Quick pipeline execution requested', {
        companyId,
        enabledStages: enabledStages || 'default',
      });

      const result = await pipelineController.execute(
        scrapeRequest,
        configOverride
      );

      res.json({
        success: true,
        data: {
          pipelineId: result.pipelineId,
          stages: result.stages,
          summary: {
            successful: result.stages.filter((s) => s.success).length,
            failed: result.stages.filter((s) => !s.success).length,
            totalDuration:
              new Date().getTime() - result.executionStartTime.getTime(),
          },
        },
      });
    } catch (error) {
      logger.error('Quick pipeline execution failed', { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Pipeline execution failed',
      });
    }
  });

  /**
   * POST /api/pipeline/execute-multiple
   * Execute pipeline with multiple profiles (scrape all, combine, then process)
   * Body: {
   *   scrapeRequests: Array<{companyId: string, credentials: Record<string, string>, options?: ScraperOptions}>,
   *   configOverride?: Partial<PipelineConfig>
   * }
   */
  router.post('/execute-multiple', async (req: Request, res: Response) => {
    try {
      const { scrapeRequests, configOverride } = req.body;

      if (!scrapeRequests || !Array.isArray(scrapeRequests) || scrapeRequests.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'scrapeRequests must be a non-empty array',
        });
      }

      logger.info('Multi-profile pipeline execution requested', {
        profileCount: scrapeRequests.length,
        companyIds: scrapeRequests.map((r) => r.companyId),
      });

      const result = await pipelineController.executeMultiple(
        scrapeRequests,
        configOverride
      );

      res.json({
        success: true,
        data: {
          pipelineId: result.pipelineId,
          executionStartTime: result.executionStartTime,
          stages: result.stages,
          summary: {
            successful: result.stages.filter((s) => s.success).length,
            failed: result.stages.filter((s) => !s.success).length,
            totalDuration:
              new Date().getTime() - result.executionStartTime.getTime(),
          },
        },
      });
    } catch (error) {
      logger.error('Multi-profile pipeline execution failed', { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Pipeline execution failed',
      });
    }
  });

  /**
   * GET /api/pipeline/stages
   * Get list of available pipeline stages and their current status
   */
  router.get('/stages', (req: Request, res: Response) => {
    try {
      const config = pipelineController.getConfig();
      const stages = [
        {
          name: 'scrape',
          enabled: config.scrape.enabled,
          description: 'Extract data from financial institutions',
        },
        {
          name: 'catalog',
          enabled: config.catalog.enabled,
          description: 'Format and structure raw data',
        },
        {
          name: 'analyze',
          enabled: config.analyze.enabled,
          description: 'Run analysis and categorize transactions',
        },
        {
          name: 'upload',
          enabled: config.upload.enabled,
          description: 'Upload processed data to destination',
        },
        {
          name: 'notification',
          enabled: config.notification.enabled,
          description: 'Send status notifications',
        },
      ];

      res.json({
        success: true,
        data: {
          stages,
          order: ['scrape', 'catalog', 'analyze', 'upload', 'notification'],
          globalPersistResults: config.globalPersistResults,
          notificationDetailLevel: config.notificationDetailLevel,
        },
      });
    } catch (error) {
      logger.error('Failed to get pipeline stages', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve pipeline stages',
      });
    }
  });

  /**
   * PATCH /api/pipeline/stages/:stageName
   * Toggle or configure a specific stage
   * Body: { enabled?: boolean, ...stageConfig }
   */
  router.patch('/stages/:stageName', (req: Request, res: Response) => {
    try {
      const stageName = req.params.stageName as string;
      const stageUpdate = req.body;

      const validStages = [
        'scrape',
        'catalog',
        'analyze',
        'upload',
        'notification',
      ] as const;

      if (!validStages.includes(stageName as any)) {
        return res.status(400).json({
          success: false,
          error: `Invalid stage name. Must be one of: ${validStages.join(', ')}`,
        });
      }

      const config = pipelineController.getConfig();
      const updatedConfig: any = {
        ...config,
        [stageName]: {
          ...(config as any)[stageName],
          ...stageUpdate,
        },
      };

      pipelineController.updateConfig(updatedConfig);

      res.json({
        success: true,
        data: {
          stage: stageName,
          config:
            updatedConfig[stageName],
        },
      });
    } catch (error) {
      logger.error('Failed to update pipeline stage', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to update pipeline stage',
      });
    }
  });

  return router;
}
