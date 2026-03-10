import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { notificationService, NotificationPayload } from './notifications/index.js';
import { AiService } from './aiService.js';
import { ScrapeResult, ScrapeRequest } from '@app/shared';
import { serviceLogger as logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const CONFIG_PATH = path.join(DATA_DIR, 'config', 'post_scrape_config.json');

export interface PostScrapeConfig {
  runCategorization: boolean;
  fraudDetection: {
    enabled: boolean;
    notifyOnIssue: boolean;
  };
  customAI: {
    enabled: boolean;
    query: string;
    notifyOnResult: boolean;
  };
  notificationChannels: string[];
}

const DEFAULT_CONFIG: PostScrapeConfig = {
  runCategorization: true,
  fraudDetection: {
    enabled: false,
    notifyOnIssue: true,
  },
  customAI: {
    enabled: false,
    query: '',
    notifyOnResult: true,
  },
  notificationChannels: ['console'],
};

export class PostScrapeService {
  private config: PostScrapeConfig;
  private ai: AiService;

  constructor() {
    this.config = this.loadConfig();
    this.ai = new AiService();
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

  private loadConfig(): PostScrapeConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const loaded = fs.readJsonSync(CONFIG_PATH);
        return { ...DEFAULT_CONFIG, ...loaded };
      }
    } catch (error) {
      logger.warn('Failed to load post-scrape config, using defaults', { error });
    }
    return DEFAULT_CONFIG;
  }

  getConfig(): PostScrapeConfig {
    this.config = this.loadConfig();
    return { ...this.config };
  }

  updateConfig(newCfg: Partial<PostScrapeConfig>): PostScrapeConfig {
    this.config = { ...this.config, ...newCfg } as PostScrapeConfig;
    try {
      fs.ensureDirSync(path.dirname(CONFIG_PATH));
      fs.writeJsonSync(CONFIG_PATH, this.config, { spaces: 2 });
    } catch (error) {
      logger.warn('Failed to save post-scrape config', { error });
    }
    return this.getConfig();
  }

  async handleResult(result: ScrapeResult, request?: ScrapeRequest): Promise<void> {
    try {
      const cfg = this.config;

      const transactions = result.transactions || [];

      // 1) Optional categorization
      if (cfg.runCategorization && transactions.length > 0) {
        this.refreshAiIfNeeded();
        if (!this.ai.hasApiKey()) {
          logger.info('Skipping post-scrape categorization: GEMINI_API_KEY not configured. Set GEMINI_API_KEY or disable post-scrape categorization.');
        } else {
          try {
            await this.ai.categorizeTransactions(transactions as any);
            logger.info('Post-scrape: categorization completed');
          } catch (err) {
            logger.warn('Post-scrape categorization failed', { error: (err as Error).message });
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
                pipelineId: request ? (request.companyId || 'unknown') : 'post-scrape',
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
                pipelineId: request ? (request.companyId || 'unknown') : 'post-scrape',
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
        }
      }

      // Optionally persist post-scrape metadata
      try {
        const outDir = path.join(DATA_DIR, 'post_scrape');
        await fs.ensureDir(outDir);
        const filename = `${request?.companyId || 'unknown'}_${Date.now()}_postscrape.json`;
        await fs.writeJson(path.join(outDir, filename), { config: this.config, resultSummary: { transactions: transactions.length, accounts: result.accounts?.length || 0 } }, { spaces: 2 });
      } catch (err) {
        logger.debug('Failed to persist post-scrape summary', { error: (err as Error).message });
      }

    } catch (error) {
      logger.error('PostScrapeService failed', { error });
    }
  }
}

export const postScrapeService = new PostScrapeService();
