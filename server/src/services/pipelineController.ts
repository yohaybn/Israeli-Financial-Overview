/**
 * Pipeline Controller
 * Orchestrates data processing through multiple stages with configurable toggles
 */

import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { ScrapeResult, ScraperOptions } from '@app/shared';
import { serviceLogger as logger } from '../utils/logger.js';
import { notificationService, NotificationPayload, NotificationDetailLevel } from './notifications/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const PIPELINE_CONFIG_PATH = path.join(DATA_DIR, 'config', 'pipeline_config.json');
const PIPELINE_RESULTS_DIR = path.join(DATA_DIR, 'pipeline_results');

export type PipelineStage = 'scrape' | 'catalog' | 'analyze' | 'upload' | 'notification';

export interface PipelineStageConfig {
  enabled: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  persistIntermediateResults?: boolean;
}

export interface PipelineConfig {
  scrape: PipelineStageConfig;
  catalog: PipelineStageConfig;
  analyze: PipelineStageConfig;
  upload: PipelineStageConfig;
  notification: PipelineStageConfig & {
    channels?: string[];
    detailLevel?: NotificationDetailLevel;
  };
  globalPersistResults?: boolean;
  notificationDetailLevel?: NotificationDetailLevel;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  scrape: {
    enabled: true,
    retryOnFailure: true,
    maxRetries: 2,
    retryDelayMs: 5000,
    persistIntermediateResults: true,
  },
  catalog: {
    enabled: true,
    retryOnFailure: true,
    maxRetries: 1,
    retryDelayMs: 2000,
    persistIntermediateResults: true,
  },
  analyze: {
    enabled: true,
    retryOnFailure: true,
    maxRetries: 1,
    retryDelayMs: 2000,
    persistIntermediateResults: true,
  },
  upload: {
    enabled: true,
    retryOnFailure: true,
    maxRetries: 2,
    retryDelayMs: 5000,
    persistIntermediateResults: true,
  },
  notification: {
    enabled: true,
    retryOnFailure: true,
    maxRetries: 3,
    retryDelayMs: 2000,
    channels: ['console'],
    persistIntermediateResults: false,
  },
  globalPersistResults: true,
  notificationDetailLevel: 'normal',
};

export interface StageResult {
  stage: PipelineStage;
  success: boolean;
  error?: string;
  data?: any;
  durationMs: number;
  retryAttempt?: number;
}

export interface PipelineExecutionContext {
  pipelineId: string;
  executionStartTime: Date;
  stages: StageResult[];
  rawData?: ScrapeResult;
  catalogedData?: any;
  analysisResults?: any;
  uploadStatus?: any;
  config: PipelineConfig;
}

export interface PipelineExecutionOptions {
  scraperService: any;
  aiService?: any;
  sheetsService?: any;
  storageService?: any;
  profileService?: any;
  filters?: any;
  io?: Server;
}

export class PipelineController {
  private config: PipelineConfig;
  private opts: PipelineExecutionOptions;
  private currentExecution: PipelineExecutionContext | null = null;

  constructor(opts: PipelineExecutionOptions) {
    this.opts = opts;
    this.config = this.loadConfig();
  }

  /**
   * Load pipeline configuration from file
   */
  private loadConfig(): PipelineConfig {
    try {
      if (fs.existsSync(PIPELINE_CONFIG_PATH)) {
        const loadedConfig = JSON.parse(
          fs.readFileSync(PIPELINE_CONFIG_PATH, 'utf-8')
        );
        return { ...DEFAULT_PIPELINE_CONFIG, ...loadedConfig };
      }
    } catch (error) {
      logger.error('Failed to load pipeline config, using defaults', { error });
    }
    return { ...DEFAULT_PIPELINE_CONFIG };
  }

  /**
   * Save pipeline configuration
   */
  private saveConfig(): void {
    try {
      const CONFIG_DIR = path.join(DATA_DIR, 'config');
      fs.ensureDirSync(CONFIG_DIR);
      fs.writeFileSync(
        PIPELINE_CONFIG_PATH,
        JSON.stringify(this.config, null, 2)
      );
      logger.debug('Pipeline config saved');
    } catch (error) {
      logger.error('Failed to save pipeline config', { error });
    }
  }

  /**
   * Update pipeline configuration
   */
  updateConfig(newConfig: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    logger.info('Pipeline config updated', { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  /**
   * Execute the full pipeline
   */
  async execute(scrapeRequest: any, overrideConfig?: Partial<PipelineConfig>): Promise<PipelineExecutionContext> {
    const pipelineId = uuidv4();
    const executionStartTime = new Date();

    const context: PipelineExecutionContext = {
      pipelineId,
      executionStartTime,
      stages: [],
      config: { ...this.config, ...overrideConfig },
    };

    this.currentExecution = context;

    try {
      this.emitProgress(`Pipeline ${pipelineId} started`);

      // Define the stages in order
      const orderedStages: PipelineStage[] = [
        'scrape',
        'catalog',
        'analyze',
        'upload',
        'notification',
      ];

      // Execute enabled stages in order
      for (const stage of orderedStages) {
        if (!context.config[stage].enabled) {
          logger.info(`Pipeline stage skipped: ${stage}`);
          continue;
        }

        try {
          await this.executeStage(stage, scrapeRequest, context);
        } catch (error) {
          logger.error(`Pipeline execution failed at stage ${stage}`, {
            error,
          });
          // Don't continue further stages if one fails
          break;
        }
      }

      const executionDurationMs = new Date().getTime() - executionStartTime.getTime();
      await this.finalizePipeline(context, executionDurationMs);

      return context;
    } catch (error) {
      logger.error('Pipeline execution failed', { error, pipelineId });
      throw error;
    } finally {
      this.currentExecution = null;
    }
  }

  /**
   * Execute the full pipeline with multiple scrape requests
   * Combines all scrape results and processes them through the pipeline
   */
  async executeMultiple(
    scrapeRequests: any[],
    overrideConfig?: Partial<PipelineConfig>
  ): Promise<PipelineExecutionContext> {
    const pipelineId = uuidv4();
    const executionStartTime = new Date();

    const context: PipelineExecutionContext = {
      pipelineId,
      executionStartTime,
      stages: [],
      config: { ...this.config, ...overrideConfig },
    };

    this.currentExecution = context;

    try {
      this.emitProgress(`Pipeline ${pipelineId} started with ${scrapeRequests.length} profile(s)`);

      // Define the stages in order
      const orderedStages: PipelineStage[] = [
        'scrape',
        'catalog',
        'analyze',
        'upload',
        'notification',
      ];

      // Execute stages in order
      for (const stage of orderedStages) {
        if (!context.config[stage].enabled) {
          logger.info(`Pipeline stage skipped: ${stage}`);
          continue;
        }

        try {
          if (stage === 'scrape') {
            // Special handling for scrape stage: run all profiles and combine results
            await this.executeMultipleScrapeStage(scrapeRequests, context);
          } else {
            // For other stages, process the combined data
            await this.executeStage(stage, {}, context);
          }
        } catch (error) {
          logger.error(`Pipeline execution failed at stage ${stage}`, {
            error,
          });
          // Don't continue further stages if one fails
          break;
        }
      }

      const executionDurationMs = new Date().getTime() - executionStartTime.getTime();
      await this.finalizePipeline(context, executionDurationMs);

      return context;
    } catch (error) {
      logger.error('Pipeline execution failed', { error, pipelineId });
      throw error;
    } finally {
      this.currentExecution = null;
    }
  }

  /**
   * Execute Scrape Stage with multiple profiles and combine results
   */
  private async executeMultipleScrapeStage(
    scrapeRequests: any[],
    context: PipelineExecutionContext
  ): Promise<void> {
    if (!this.opts.scraperService) {
      throw new Error('ScraperService not available');
    }

    const allResults: any[] = [];
    const combinedData: any = {
      success: true,
      accounts: [],
      allTransactions: [],
      error: null,
    };

    // Run scrape for each profile
    for (const [index, scrapeRequest] of scrapeRequests.entries()) {
      try {
        this.emitProgress(
          `Scraping profile ${index + 1}/${scrapeRequests.length} (${scrapeRequest.companyId})`
        );

        const result = await this.opts.scraperService.runScrape(scrapeRequest);

        if (!result.success) {
          this.emitProgress(`Warning: Scrape for ${scrapeRequest.companyId} failed: ${result.error}`);
          continue;
        }

        allResults.push(result);

        // Combine accounts
        if (result.accounts) {
          combinedData.accounts = combinedData.accounts.concat(result.accounts);
        }

        // Combine transactions
        if (result.allTransactions) {
          combinedData.allTransactions = combinedData.allTransactions.concat(
            result.allTransactions
          );
        }

        this.emitProgress(
          `Completed scraping profile ${index + 1}/${scrapeRequests.length}`
        );
      } catch (error) {
        logger.warn(`Failed to scrape profile ${index + 1}:`, {
          error,
          companyId: scrapeRequest.companyId,
        });
        this.emitProgress(
          `Error scraping profile ${index + 1}: ${(error as Error).message}`
        );
      }
    }

    if (allResults.length === 0) {
      throw new Error('No successful scrapes from any profile');
    }

    // Set the combined data as the scrape result
    context.rawData = {
      ...allResults[0],
      ...combinedData,
      _profilesScraped: scrapeRequests.length,
      _successfulScrapes: allResults.length,
    };

    this.emitProgress(
      `Scraping complete: ${allResults.length}/${scrapeRequests.length} profiles succeeded, ` +
      `${combinedData.accounts.length} total accounts, ` +
      `${combinedData.allTransactions.length} total transactions`
    );

    if (
      context.config.scrape.persistIntermediateResults &&
      context.config.globalPersistResults
    ) {
      await this.persistIntermediateResult(
        context.pipelineId,
        'scrape',
        context.rawData
      );
    }
  }

  /**
   * Execute a single stage with retry logic
   */
  private async executeStage(
    stage: PipelineStage,
    scrapeRequest: any,
    context: PipelineExecutionContext
  ): Promise<void> {
    const stageConfig = context.config[stage];
    const maxRetries = stageConfig.maxRetries || 1;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const stageStartTime = new Date().getTime();

      try {
        this.emitProgress(`Executing stage: ${stage} (attempt ${attempt})`);

        switch (stage) {
          case 'scrape':
            await this.executeScrapeStage(scrapeRequest, context);
            break;
          case 'catalog':
            await this.executeCatalogStage(context);
            break;
          case 'analyze':
            await this.executeAnalyzeStage(context);
            break;
          case 'upload':
            await this.executeUploadStage(context);
            break;
          case 'notification':
            await this.executeNotificationStage(context);
            break;
        }

        const stageDurationMs = new Date().getTime() - stageStartTime;

        context.stages.push({
          stage,
          success: true,
          durationMs: stageDurationMs,
          retryAttempt: attempt > 1 ? attempt : undefined,
        });

        this.emitProgress(`Stage completed: ${stage} (${stageDurationMs}ms)`);
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        const stageDurationMs = new Date().getTime() - stageStartTime;

        logger.warn(
          `Stage ${stage} failed (attempt ${attempt}/${maxRetries}): ${(error as Error).message}`
        );

        if (attempt === maxRetries) {
          // Final attempt failed
          context.stages.push({
            stage,
            success: false,
            error: (error as Error).message,
            durationMs: stageDurationMs,
            retryAttempt: attempt > 1 ? attempt : undefined,
          });

          this.emitProgress(
            `Stage failed: ${stage} after ${attempt} attempts`
          );
          throw error;
        }

        // Wait before retrying
        const delayMs = stageConfig.retryDelayMs || 2000;
        await this.delay(delayMs);
      }
    }
  }

  /**
   * Execute Scrape Stage
   */
  private async executeScrapeStage(
    scrapeRequest: any,
    context: PipelineExecutionContext
  ): Promise<void> {
    if (!this.opts.scraperService) {
      throw new Error('ScraperService not available');
    }

    const result = await this.opts.scraperService.runScrape(scrapeRequest);

    if (!result.success) {
      throw new Error(
        `Scrape failed: ${result.error || 'Unknown error'}`
      );
    }

    context.rawData = result;

    if (context.config.scrape.persistIntermediateResults && context.config.globalPersistResults) {
      await this.persistIntermediateResult(
        context.pipelineId,
        'scrape',
        result
      );
    }
  }

  /**
   * Execute Catalog Stage
   */
  private async executeCatalogStage(
    context: PipelineExecutionContext
  ): Promise<void> {
    if (!context.rawData) {
      throw new Error('No raw data from scrape stage');
    }

    // Catalog stage: format and structure data
    // This can include applying filters, normalizing dates, etc.
    const catalogedData = {
      ...context.rawData,
      catalogedAt: new Date().toISOString(),
      filters: this.opts.filters || [],
    };

    context.catalogedData = catalogedData;

    if (
      context.config.catalog.persistIntermediateResults &&
      context.config.globalPersistResults
    ) {
      await this.persistIntermediateResult(
        context.pipelineId,
        'catalog',
        catalogedData
      );
    }
  }

  /**
   * Execute Analyze Stage
   */
  private async executeAnalyzeStage(
    context: PipelineExecutionContext
  ): Promise<void> {
    if (!context.catalogedData) {
      throw new Error('No cataloged data from catalog stage');
    }

    // Analyze stage: categorize transactions, generate insights
    const analysisResults: any = {
      timestamp: new Date().toISOString(),
      transactionCount: context.catalogedData.transactions?.length || 0,
      categorized: 0,
      insights: [] as string[],
      categorizedTransactions: [] as any[],
    };

    // If AI service is available, use it for categorization
    if (this.opts.aiService && context.catalogedData.transactions) {
      try {
        const categories = await this.opts.aiService.suggestCategories(
          context.catalogedData.transactions
        );

        analysisResults.categorized = categories?.length || 0;
        analysisResults.categorizedTransactions = categories || [];
        analysisResults.insights.push(
          `Categorized ${categories?.length || 0} transactions`
        );
      } catch (error) {
        logger.warn('AI categorization failed, continuing...', { error });
      }
    }

    context.analysisResults = analysisResults;

    if (context.config.globalPersistResults) {
      // Only save if there are transactions or accounts
      const hasTransactions = analysisResults.categorizedTransactions && analysisResults.categorizedTransactions.length > 0;
      const hasAccounts = context.catalogedData?.accounts && context.catalogedData.accounts.length > 0;

      if (hasTransactions || hasAccounts) {
        try {
          const dateTimeFolder = this.getDateTimeFolder();
          const provideName = this.getProviderName(context.catalogedData);
          const RESULTS_DIR = path.join(DATA_DIR, 'results');
          const resultsDir = path.join(RESULTS_DIR, dateTimeFolder);
          fs.ensureDirSync(resultsDir);

          const filename = `${provideName}_categorized_${context.pipelineId}.json`;
          const filePath = path.join(resultsDir, filename);
          fs.writeFileSync(filePath, JSON.stringify(analysisResults, null, 2));

          logger.info(`Categorized results saved: ${filename}`);
        } catch (error) {
          logger.warn('Failed to save categorized results', { error });
        }
      } else {
        logger.info('Skipping categorized results save - no transactions or accounts found');
      }
    }

    if (
      context.config.analyze.persistIntermediateResults &&
      context.config.globalPersistResults
    ) {
      await this.persistIntermediateResult(
        context.pipelineId,
        'analyze',
        analysisResults
      );
    }
  }

  /**
   * Execute Upload Stage
   */
  private async executeUploadStage(
    context: PipelineExecutionContext
  ): Promise<void> {
    const uploadStatus = {
      timestamp: new Date().toISOString(),
      success: true,
      details: 'No upload destination configured',
    };

    // If sheets service is available and destination is configured, upload
    if (this.opts.sheetsService && context.catalogedData) {
      try {
        // This is a placeholder - integrate with actual sheets upload logic
        const result = await this.opts.sheetsService.syncTransactions(
          context.catalogedData.transactions || []
        );

        uploadStatus.details = `Uploaded to sheets: ${result?.spreadsheetName || 'Unknown'}`;
      } catch (error) {
        logger.warn('Sheets upload failed, continuing...', { error });
        uploadStatus.details = `Upload attempted but may have failed: ${(error as Error).message}`;
      }
    }

    context.uploadStatus = uploadStatus;

    if (
      context.config.upload.persistIntermediateResults &&
      context.config.globalPersistResults
    ) {
      await this.persistIntermediateResult(
        context.pipelineId,
        'upload',
        uploadStatus
      );
    }
  }

  /**
   * Execute Notification Stage
   */
  private async executeNotificationStage(
    context: PipelineExecutionContext
  ): Promise<void> {
    const notificationConfig = context.config.notification;

    if (!notificationConfig.enabled || !notificationConfig.channels?.length) {
      logger.info('Notification stage skipped - no channels configured');
      return;
    }

    const executionDurationMs =
      new Date().getTime() - context.executionStartTime.getTime();
    const successfulStages = context.stages
      .filter((s) => s.success)
      .map((s) => s.stage);
    const failedStage = context.stages.find((s) => !s.success)?.stage;

    const payload: NotificationPayload = {
      pipelineId: context.pipelineId,
      status: failedStage ? 'failure' : 'success',
      timestamp: new Date(),
      detailLevel:
        notificationConfig.detailLevel ||
        context.config.notificationDetailLevel ||
        'normal',
      summary: {
        durationMs: executionDurationMs,
        stagesRun: context.stages.map((s) => s.stage),
        successfulStages,
        failedStage,
        transactionCount:
          context.catalogedData?.transactions?.length ||
          context.rawData?.transactions?.length ||
          0,
        accounts:
          context.rawData?.accounts?.length || 0,
        balance: context.rawData?.accounts?.reduce(
          (sum: number, acc: any) => sum + (acc.balance || 0),
          0
        ),
        insights: context.analysisResults?.insights || [],
      },
      errorDetails: failedStage
        ? {
          stage: failedStage,
          message:
            context.stages.find((s) => s.stage === failedStage)?.error ||
            'Unknown error',
        }
        : undefined,
    };

    // Send notifications
    const results = await notificationService.notify(
      notificationConfig.channels,
      payload
    );

    logger.info('Pipeline notifications sent', {
      pipelineId: context.pipelineId,
      results,
    });
  }

  /**
   * Finalize pipeline execution
   */
  private async finalizePipeline(
    context: PipelineExecutionContext,
    executionDurationMs: number
  ): Promise<void> {
    context.stages = context.stages.map((s) => ({
      ...s,
      durationMs: s.durationMs || 0,
    }));

    logger.info('Pipeline execution completed', {
      pipelineId: context.pipelineId,
      duration: executionDurationMs,
      stages: context.stages,
    });

    // Emit final completion event
    this.emitProgress(
      `Pipeline completed in ${executionDurationMs}ms`,
      'pipeline:complete',
      {
        pipelineId: context.pipelineId,
        duration: executionDurationMs,
        stages: context.stages,
        summary: {
          successful: context.stages.filter((s) => s.success).length,
          failed: context.stages.filter((s) => !s.success).length,
        },
      }
    );
  }

  /**
   * Generate date/time folder for organization
   */
  private getDateTimeFolder(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }

  /**
   * Extract provider name from transactions
   */
  private getProviderName(data: any): string {
    if (data?.transactions && data.transactions.length > 0) {
      return data.transactions[0].provider || 'unknown';
    }
    if (data?.provider) return data.provider;
    return 'unknown';
  }

  /**
   * Persist intermediate results to file
   */
  private async persistIntermediateResult(
    pipelineId: string,
    stage: string,
    data: any
  ): Promise<void> {
    try {
      // Do not save empty results
      const hasTransactions = data?.categorizedTransactions && data.categorizedTransactions.length > 0;
      const hasAccounts = data?.accounts && data.accounts.length > 0;

      if (!hasTransactions && !hasAccounts) {
        logger.debug(`Skipping ${stage} result persist - no transactions or accounts found`);
        return;
      }

      const dateTimeFolder = this.getDateTimeFolder();
      const provideName = this.getProviderName(data);
      const resultsDir = path.join(PIPELINE_RESULTS_DIR, dateTimeFolder);
      fs.ensureDirSync(resultsDir);

      const filename = `${stage}_${provideName}_${pipelineId}.json`;
      const filePath = path.join(resultsDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

      logger.debug(`Pipeline result persisted: ${stage} for provider ${provideName}`);
    } catch (error) {
      logger.warn(
        `Failed to persist result for stage ${stage}`,
        { error }
      );
    }
  }

  /**
   * Helper to emit progress events
   */
  private emitProgress(
    message: string,
    eventType: string = 'pipeline:progress',
    data?: any
  ): void {
    const progress = {
      message,
      timestamp: new Date().toISOString(),
      ...data,
    };

    if (this.opts.io) {
      this.opts.io.emit(eventType, progress);
    }

    logger.debug(`[${eventType}] ${message}`);
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
