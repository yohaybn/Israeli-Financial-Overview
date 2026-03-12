import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { notificationService, NotificationPayload } from './notifications/index.js';
import { AiService } from './aiService.js';
import { ScrapeResult, ScrapeRequest, PostScrapeConfig } from '@app/shared';
import { serviceLogger as logger } from '../utils/logger.js';
import { StorageService } from './storageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PostScrapeService {
  private ai: AiService;
  private storageService: StorageService;

  constructor() {
    this.ai = new AiService();
    this.storageService = new StorageService();
  }

  /**
   * If GEMINI_API_KEY was added after process start, re-instantiate AiService so it picks up the key.
   */
  private refreshAiIfNeeded() {
    try {
      const hasKey = !!process.env.GEMINI_API_KEY;
      if (hasKey && !this.ai?.hasApiKey()) {
        this.ai = new AiService();
        logger.info('Re-initialized AiService after GEMINI_API_KEY became available');
      }
    } catch (e) {
      // ignore - best effort
    }
  }

  async getConfig(): Promise<PostScrapeConfig> {
    const global = await this.storageService.getGlobalScrapeConfig();
    return global.postScrapeConfig;
  }

  async updateConfig(newCfg: Partial<PostScrapeConfig>): Promise<PostScrapeConfig> {
    const global = await this.storageService.getGlobalScrapeConfig();
    global.postScrapeConfig = { ...global.postScrapeConfig, ...newCfg };
    await this.storageService.updateGlobalScrapeConfig(global);
    return global.postScrapeConfig;
  }

  /**
   * Send an error notification for a failed post-scrape action.
   */
  private async sendPostScrapeErrorNotification(stage: string, errorMessage: string, request?: ScrapeRequest): Promise<void> {
    try {
      const cfg = await this.getConfig();
      const channels = [...(cfg.notificationChannels || ['console'])];

      // Auto-include telegram if registered and enabled
      if (!channels.includes('telegram')) {
        const tgNotifier = notificationService.getNotifier('telegram');
        if (tgNotifier && tgNotifier.isEnabled()) {
          channels.push('telegram');
        }
      }

      const payload: NotificationPayload = {
        pipelineId: request?.profileName || request?.companyId || 'post-scrape',
        status: 'failure',
        timestamp: new Date(),
        detailLevel: 'normal',
        summary: {
          durationMs: 0,
          stagesRun: ['scrape', stage],
          successfulStages: ['scrape'],
          failedStage: stage,
          insights: [`Post-scrape ${stage} failed: ${errorMessage}`],
        },
        errorDetails: {
          stage,
          message: errorMessage,
        },
      };

      await notificationService.notify(channels, payload);
      logger.info(`Post-scrape error notification sent for ${stage}`);
    } catch (notifyErr) {
      logger.warn('Failed to send post-scrape error notification', { error: (notifyErr as Error).message });
    }
  }

  async handleResult(result: ScrapeResult, request?: ScrapeRequest): Promise<void> {
    try {
      const cfg = await this.getConfig();
      const transactions = result.transactions || [];

      // 1) Optional categorization
      // Favor local request option if provided, otherwise use global config
      const runCategorization = request?.options?.autoCategorize !== undefined 
          ? request.options.autoCategorize 
          : cfg.runCategorization;

      if (runCategorization && transactions.length > 0) {
        this.refreshAiIfNeeded();
        if (!this.ai.hasApiKey()) {
          logger.info('Skipping post-scrape categorization: GEMINI_API_KEY not configured. Set GEMINI_API_KEY or disable post-scrape categorization.');
        } else {
          try {
            await this.ai.categorizeTransactions(transactions as any);
            logger.info('Post-scrape: categorization completed');
          } catch (err) {
            logger.warn('Post-scrape categorization failed', { error: (err as Error).message });
            await this.sendPostScrapeErrorNotification('categorization', (err as Error).message, request);
          }
        }
      }

      // 2) Fraud detection
      if (cfg.fraudDetection?.enabled && transactions.length > 0) {
        try {
          const fraudQuery = `Analyze these transactions and identify any potential fraud, unauthorized charges, anomalies, or disputes. Return a concise summary and any detected issues.`;
          this.refreshAiIfNeeded();
          if (!this.ai.hasApiKey()) {
            logger.info('Skipping post-scrape fraud analysis: GEMINI_API_KEY not configured.');
          } else {
            const fraudResult = await this.ai.analyzeData(fraudQuery, transactions as any);
            logger.info('Post-scrape: fraud analysis completed');
          logger.info('Post-scrape: fraud analysis completed');

            const lower = (fraudResult || '').toLowerCase();
            const suspicious = /suspicious|fraud|anomaly|chargeback|dispute|unauthorized/.test(lower);
            if (suspicious && cfg.fraudDetection.notifyOnIssue) {
              const channels = cfg.notificationChannels || ['console'];
              const payload: NotificationPayload = {
                pipelineId: request ? (request.profileName || request.companyId || 'unknown') : 'post-scrape',
                status: 'warning' as any,
                timestamp: new Date(),
                detailLevel: 'normal',
                summary: {
                  durationMs: result.executionTimeMs || 0,
                  stagesRun: ['scrape'],
                  successfulStages: ['scrape'],
                  transactionCount: transactions.length,
                  insights: [ 'Fraud detection flagged potential issues' ],
                  accounts: result.accounts?.length || 0,
                  balance: result.accounts?.reduce?.((sum: number, acc: any) => sum + (acc.balance || 0), 0) || 0,
                },
              };

              // Notify global channels
              await notificationService.notify(channels, {
                ...payload,
                summary: { ...payload.summary, insights: [ fraudResult.substring(0, 1000) ] },
              } as any);

              // If scrape was triggered from Telegram, notify the initiating chat directly
              const tgChatId = (request as any)?.options?.postScrape?.telegramChatId || (request as any)?.options?.telegramChatId;
              if (tgChatId) {
                const tgNotifier = notificationService.getNotifier('telegram') as any;
                if (tgNotifier && typeof tgNotifier.addChatId === 'function') {
                  try {
                    tgNotifier.addChatId(String(tgChatId));
                    await tgNotifier.send({ ...payload, summary: { ...payload.summary, insights: [ fraudResult.substring(0, 1000) ] } } as any);
                  } catch (err) {
                    logger.warn('Failed to send direct Telegram fraud notification', { error: (err as Error).message });
                  } finally {
                    try { tgNotifier.removeChatId(String(tgChatId)); } catch (e) {}
                  }
                }
              }

              logger.info('Post-scrape: fraud notification sent');
            }
          }
        } catch (err) {
          logger.warn('Post-scrape fraud check failed', { error: (err as Error).message });
          await this.sendPostScrapeErrorNotification('fraud-detection', (err as Error).message, request);
        }
      }

      // 3) Custom AI query
      if (cfg.customAI?.enabled && cfg.customAI.query && transactions.length > 0) {
        try {
          this.refreshAiIfNeeded();
          if (!this.ai.hasApiKey()) {
            logger.info('Skipping custom AI query: GEMINI_API_KEY not configured.');
          } else {
            const aiResult = await this.ai.analyzeData(cfg.customAI.query, transactions as any);
            logger.info('Post-scrape: custom AI query completed');

            if (cfg.customAI.notifyOnResult) {
              const channels = cfg.notificationChannels || ['console'];
              const payload: NotificationPayload = {
                pipelineId: request ? (request.profileName || request.companyId || 'unknown') : 'post-scrape',
                status: 'success',
                timestamp: new Date(),
                detailLevel: 'normal',
                summary: {
                  durationMs: result.executionTimeMs || 0,
                  stagesRun: ['scrape'],
                  successfulStages: ['scrape'],
                  transactionCount: transactions.length,
                  insights: [ 'Custom AI query result attached' ],
                  accounts: result.accounts?.length || 0,
                  balance: result.accounts?.reduce?.((sum: number, acc: any) => sum + (acc.balance || 0), 0) || 0,
                },
              };

              await notificationService.notify(channels, {
                ...payload,
                summary: { ...payload.summary, insights: [ aiResult.substring(0, 1000) ] },
              } as any);

              const tgChatId = (request as any)?.options?.postScrape?.telegramChatId || (request as any)?.options?.telegramChatId;
              if (tgChatId) {
                const tgNotifier = notificationService.getNotifier('telegram') as any;
                if (tgNotifier && typeof tgNotifier.addChatId === 'function') {
                  try {
                    tgNotifier.addChatId(String(tgChatId));
                    await tgNotifier.send({ ...payload, summary: { ...payload.summary, insights: [ aiResult.substring(0, 1000) ] } } as any);
                  } catch (err) {
                    logger.warn('Failed to send direct Telegram custom-AI notification', { error: (err as Error).message });
                  } finally {
                    try { tgNotifier.removeChatId(String(tgChatId)); } catch (e) {}
                  }
                }
              }

              logger.info('Post-scrape: custom AI notification sent');
            }
          }
        } catch (err) {
          logger.warn('Post-scrape custom AI query failed', { error: (err as Error).message });
          await this.sendPostScrapeErrorNotification('custom-ai', (err as Error).message, request);
        }
      }

      // Optionally persist post-scrape metadata
      try {
        const global = await this.storageService.getGlobalScrapeConfig();
        const outDir = path.join(process.env.DATA_DIR || './data', 'post_scrape');
        await fs.ensureDir(outDir);
        const filename = `${request?.companyId || 'unknown'}_${Date.now()}_postscrape.json`;
        await fs.writeJson(path.join(outDir, filename), { config: global.postScrapeConfig, resultSummary: { transactions: transactions.length, accounts: result.accounts?.length || 0 } }, { spaces: 2 });
      } catch (err) {
        logger.debug('Failed to persist post-scrape summary', { error: (err as Error).message });
      }

    } catch (error) {
      logger.error('PostScrapeService failed', { error });
      await this.sendPostScrapeErrorNotification('post-scrape', (error as Error).message, request);
    }
  }

  /**
   * Send a notification for a completed scrape run (success or failure).
   * This is called for every scrape regardless of AI features.
   */
  async sendScrapeNotification(result: ScrapeResult, request?: ScrapeRequest): Promise<void> {
    try {
      const cfg = await this.getConfig();
      const channels = [...(cfg.notificationChannels || ['console'])];

      // Auto-include telegram if the notifier is registered and enabled
      if (!channels.includes('telegram')) {
        const tgNotifier = notificationService.getNotifier('telegram');
        if (tgNotifier && tgNotifier.isEnabled()) {
          channels.push('telegram');
        }
      }

      const success = result.success;
      const transactions = result.transactions || [];

      const payload: NotificationPayload = {
        pipelineId: request?.profileName || request?.companyId || 'scrape',
        status: success ? 'success' : 'failure',
        timestamp: new Date(),
        detailLevel: 'normal',
        summary: {
          durationMs: result.executionTimeMs || 0,
          stagesRun: ['scrape'],
          successfulStages: success ? ['scrape'] : [],
          failedStage: success ? undefined : 'scrape',
          transactionCount: transactions.length,
          accounts: result.accounts?.length || 0,
          balance: result.accounts?.reduce?.((sum: number, acc: any) => sum + (acc.balance || 0), 0) || 0,
        },
        errorDetails: !success && result.error ? {
          stage: 'scrape',
          message: result.error,
        } : undefined,
      };

      await notificationService.notify(channels, payload);
      logger.info('Scrape notification sent', { success, channels });
    } catch (err) {
      logger.warn('Failed to send scrape notification', { error: (err as Error).message });
    }
  }
}

export const postScrapeService = new PostScrapeService();
