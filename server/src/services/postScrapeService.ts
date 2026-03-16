import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { notificationService, NotificationPayload } from './notifications/index.js';
import { AiService } from './aiService.js';
import { ScrapeResult, ScrapeRequest, PostScrapeConfig, FraudSeverity } from '@app/shared';
import { serviceLogger as logger } from '../utils/logger.js';
import { StorageService } from './storageService.js';
import { fraudDetectionService } from './fraudDetectionService.js';
import { DbService } from './dbService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PostScrapeService {
  private ai: AiService;
  private storageService: StorageService;
  private dbService: DbService;

  constructor() {
    this.ai = new AiService();
    this.storageService = new StorageService();
    this.dbService = new DbService();
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

      // Fetch bot language
      let botLanguage: 'en' | 'he' = 'en';
      try {
        const telConfigPath = path.join(process.env.DATA_DIR || './data', 'config', 'telegram_config.json');
        if (await fs.pathExists(telConfigPath)) {
          const telConfig = await fs.readJson(telConfigPath);
          if (telConfig.language) botLanguage = telConfig.language;
        }
      } catch (e) {
        // ignore - fallback to en
      }

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

      // 2) Fraud detection (local / AI / both)
      if (cfg.fraudDetection?.enabled) {
        const mode = cfg.fraudDetection.mode || 'ai';
        const scope = cfg.fraudDetection.scope || 'current';

        try {
          let transactionsToAnalyze = transactions;
          let history: typeof transactions = [];

          if (scope === 'all') {
            const allDbTxns = await this.storageService.getAllTransactions();
            const currentIds = new Set(transactions.map(t => t.id));
            const uniqueDbTxns = allDbTxns.filter(t => !currentIds.has(t.id));
            transactionsToAnalyze = [...transactions, ...uniqueDbTxns];
            history = uniqueDbTxns;
            logger.info(`Post-scrape fraud detection: using all transactions (${transactionsToAnalyze.length} total, ${transactions.length} new)`);
          }

          // Local fraud detection
          if (mode === 'local' || mode === 'both') {
            try {
              const localCfg = cfg.fraudDetection.local;
              const { summary, findings } = fraudDetectionService.detectLocal(
                transactions,
                history,
                localCfg
              );

              logger.info('Post-scrape: local fraud detection completed', {
                analyzed: summary.analyzedCount,
                flagged: summary.flaggedCount,
                maxScore: summary.maxScore,
              });

              if (findings.length > 0) {
                this.dbService.upsertFraudFindings(findings);

                if (cfg.fraudDetection.notifyOnIssue) {
                  const thresholds = localCfg?.thresholds;
                  const notifyMinSeverity: FraudSeverity =
                    thresholds?.notifyMinSeverity || 'medium';

                  const sevRank: Record<FraudSeverity, number> = {
                    low: 1,
                    medium: 2,
                    high: 3,
                  };

                  const shouldNotify = findings.some(
                    (f) => sevRank[f.severity] >= sevRank[notifyMinSeverity]
                  );

                  if (shouldNotify) {
                    const channels = cfg.notificationChannels || ['console'];
                    const top = [...findings].sort((a, b) => b.score - a.score).slice(0, 5);
                    const lines = top.map((f) => {
                      const txn = transactions.find((t) => t.id === f.transactionId);
                      const desc = txn?.description || 'Unknown';
                      const amount = txn?.amount ?? 0;
                      const reason = f.reasons[0]?.message || 'Suspicious pattern';
                      return `• ${desc} (₪${amount}, score ${f.score}) - ${reason}`;
                    });

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
                        insights: [
                          `Local fraud detection flagged ${summary.flaggedCount} transactions (max score ${summary.maxScore}).`,
                          ...lines,
                        ].slice(0, 10),
                        accounts: result.accounts?.length || 0,
                        balance: result.accounts?.reduce?.((sum: number, acc: any) => sum + (acc.balance || 0), 0) || 0,
                      },
                    };

                    await notificationService.notify(channels, payload);
                    logger.info('Post-scrape: local fraud notification sent');
                  }
                }
              }
            } catch (err) {
              logger.warn('Post-scrape local fraud detection failed', {
                error: (err as Error).message,
              });
              await this.sendPostScrapeErrorNotification(
                'fraud-detection-local',
                (err as Error).message,
                request
              );
            }
          }

          // AI fraud detection (existing behavior), gated by mode
          if (mode === 'ai' || mode === 'both') {
            if (transactionsToAnalyze.length > 0) {
              const fraudQuery = botLanguage === 'he' 
                ? `נתח את העסקאות הבאות וזהה הונאות פוטנציאליות, חיובים לא מורשים, חריגות או מחלוקות. החזר סיכום תמציתי וכל בעיה שתתגלה בעברית.`
                : `Analyze these transactions and identify any potential fraud, unauthorized charges, anomalies, or disputes. Return a concise summary and any detected issues in English.`;
              
              this.refreshAiIfNeeded();
              if (!this.ai.hasApiKey()) {
                logger.info('Skipping post-scrape fraud analysis (AI): GEMINI_API_KEY not configured.');
              } else {
                const fraudResult = await this.ai.analyzeData(fraudQuery, transactionsToAnalyze as any);
                logger.info('Post-scrape: AI fraud analysis completed');

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
                      insights: [ 'Fraud detection (AI) flagged potential issues' ],
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
                  // (Note: notificationService.notify already handles global channels including telegram if registered)
                  const tgChatId = (request as any)?.options?.postScrape?.telegramChatId || (request as any)?.options?.telegramChatId;
                  if (tgChatId) {
                    const tgNotifier = notificationService.getNotifier('telegram') as any;
                    // Only send if it's NOT already in the global notification channels to avoid duplicates
                    const globalChannels = channels;
                    if (tgNotifier && typeof tgNotifier.addChatId === 'function' && !globalChannels.includes('telegram')) {
                      try {
                        tgNotifier.addChatId(String(tgChatId));
                        await tgNotifier.send({ ...payload, summary: { ...payload.summary, insights: [ fraudResult.substring(0, 1000) ] } } as any);
                      } catch (err) {
                        logger.warn('Failed to send direct Telegram fraud notification (AI)', { error: (err as Error).message });
                      } finally {
                        try { tgNotifier.removeChatId(String(tgChatId)); } catch (e) {}
                      }
                    }
                  }

                  logger.info('Post-scrape: AI fraud notification sent');
                }
              }
            }
          }
        } catch (err) {
          logger.warn('Post-scrape fraud check failed', { error: (err as Error).message });
          await this.sendPostScrapeErrorNotification('fraud-detection', (err as Error).message, request);
        }
      }

      // 3) Custom AI query
      if (cfg.customAI?.enabled && cfg.customAI.query) {
        try {
          let transactionsToAnalyze = transactions;
          if (cfg.customAI.scope === 'all') {
            const allDbTxns = await this.storageService.getAllTransactions();
            const currentIds = new Set(transactions.map(t => t.id));
            const uniqueDbTxns = allDbTxns.filter(t => !currentIds.has(t.id));
            transactionsToAnalyze = [...transactions, ...uniqueDbTxns];
            logger.info(`Post-scrape custom AI: using all transactions (${transactionsToAnalyze.length} total, ${transactions.length} new)`);
          }

          if (transactionsToAnalyze.length > 0) {
            this.refreshAiIfNeeded();
            if (!this.ai.hasApiKey()) {
              logger.info('Skipping custom AI query: GEMINI_API_KEY not configured.');
            } else {
              const langSuffix = botLanguage === 'he' ? '\nאנא השב בעברית.' : '\nPlease respond in English.';
              const aiResult = await this.ai.analyzeData(cfg.customAI.query + langSuffix, transactionsToAnalyze as any);
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
                  // Only send if it's NOT already in the global notification channels to avoid duplicates
                  if (tgNotifier && typeof tgNotifier.addChatId === 'function' && !channels.includes('telegram')) {
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
