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

const POST_SCRAPE_DIR = () => path.join(process.env.DATA_DIR || './data', 'post_scrape');
const MAX_LAST_SUMMARY_CHARS = 2000;

function sanitizePipelineId(id: string): string {
  return id.replace(/[/\\:]/g, '_');
}

export class PostScrapeService {
  private ai: AiService;
  private storageService: StorageService;
  private dbService: DbService;

  constructor() {
    this.ai = new AiService();
    this.storageService = new StorageService();
    this.dbService = new DbService();
  }

  private async getLastAiSummary(pipelineId: string, kind: 'fraud' | 'custom'): Promise<string | null> {
    try {
      await fs.ensureDir(POST_SCRAPE_DIR());
      const file = path.join(POST_SCRAPE_DIR(), `last_ai_${kind}_${sanitizePipelineId(pipelineId)}.txt`);
      if (await fs.pathExists(file)) {
        const text = await fs.readFile(file, 'utf-8');
        return text.trim() || null;
      }
    } catch (e) {
      logger.warn('Failed to read last AI summary', { pipelineId, kind, error: (e as Error).message });
    }
    return null;
  }

  private async setLastAiSummary(pipelineId: string, kind: 'fraud' | 'custom', text: string): Promise<void> {
    try {
      await fs.ensureDir(POST_SCRAPE_DIR());
      const file = path.join(POST_SCRAPE_DIR(), `last_ai_${kind}_${sanitizePipelineId(pipelineId)}.txt`);
      const truncated = text.length > MAX_LAST_SUMMARY_CHARS ? text.slice(0, MAX_LAST_SUMMARY_CHARS) + '…' : text;
      await fs.writeFile(file, truncated, 'utf-8');
    } catch (e) {
      logger.warn('Failed to write last AI summary', { pipelineId, kind, error: (e as Error).message });
    }
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

  private shouldAggregateTelegram(request?: ScrapeRequest): boolean {
    return Boolean((request as any)?.options?.aggregateTelegramNotifications);
  }

  private getTelegramAggregationBuffer(request?: ScrapeRequest): NotificationPayload[] | null {
    if (!this.shouldAggregateTelegram(request) || !request) return null;
    const reqAny = request as any;
    if (!reqAny.__telegramAggregationPayloads) {
      reqAny.__telegramAggregationPayloads = [];
    }
    return reqAny.__telegramAggregationPayloads as NotificationPayload[];
  }

  private getRunSource(request?: ScrapeRequest): 'telegram_bot' | 'scheduler' | 'manual' {
    const reqAny = request as any;
    const options = reqAny?.options || {};
    const explicit = options.runSource;
    if (explicit === 'telegram_bot' || explicit === 'scheduler' || explicit === 'manual') {
      return explicit;
    }

    const initiatedBy = String(options?.postScrape?.initiatedBy || options?.initiatedBy || '').toLowerCase();
    if (initiatedBy.startsWith('telegram')) return 'telegram_bot';
    if (initiatedBy.startsWith('scheduler')) return 'scheduler';
    return 'manual';
  }

  private async notifyWithTelegramAggregation(
    channels: string[],
    payload: NotificationPayload,
    request?: ScrapeRequest
  ): Promise<void> {
    const buffer = this.getTelegramAggregationBuffer(request);
    if (!buffer) {
      await notificationService.notify(channels, payload);
      return;
    }

    const nonTelegramChannels = channels.filter((c) => c !== 'telegram');
    if (nonTelegramChannels.length > 0) {
      await notificationService.notify(nonTelegramChannels, payload);
    }

    const tgNotifier = notificationService.getNotifier('telegram');
    const shouldCollectTelegram = channels.includes('telegram') || Boolean(tgNotifier && tgNotifier.isEnabled());
    if (shouldCollectTelegram) {
      buffer.push(payload);
    }
  }

  async flushAggregatedTelegramNotification(request?: ScrapeRequest): Promise<void> {
    const buffer = this.getTelegramAggregationBuffer(request);
    if (!buffer || buffer.length === 0) return;

    const bySeverity = { success: 1, warning: 2, failure: 3 } as const;
    const finalStatus = buffer.reduce<'success' | 'warning' | 'failure'>((current, p) => {
      return bySeverity[p.status] > bySeverity[current] ? p.status : current;
    }, 'success');

    const insights = buffer
      .flatMap((p) => p.summary?.insights || [])
      .filter((s) => !!s)
      .slice(0, 12);

    const scrapePayload =
      [...buffer].reverse().find((p) => p.summary?.transactionCount != null || p.summary?.accounts != null) ||
      buffer[buffer.length - 1];

    const combinedPayload: NotificationPayload = {
      pipelineId: request?.profileName || request?.companyId || scrapePayload.pipelineId || 'scrape',
      status: finalStatus,
      timestamp: new Date(),
      detailLevel: 'normal',
      runSource: this.getRunSource(request),
      summary: {
        durationMs: Math.max(...buffer.map((p) => p.summary?.durationMs || 0)),
        stagesRun: ['scrape', 'post-scrape'],
        successfulStages: finalStatus === 'failure' ? ['scrape'] : ['scrape', 'post-scrape'],
        failedStage: finalStatus === 'failure' ? 'post-scrape' : undefined,
        transactionCount: scrapePayload.summary?.transactionCount,
        accounts: scrapePayload.summary?.accounts,
        balance: scrapePayload.summary?.balance,
        insights,
      },
      errorDetails: finalStatus === 'failure'
        ? {
          stage: 'post-scrape',
          message: buffer
            .map((p) => p.errorDetails?.message)
            .find((m) => !!m) || 'Post-scrape failed',
        }
        : undefined,
    };

    const tgChatId = (request as any)?.options?.postScrape?.telegramChatId || (request as any)?.options?.telegramChatId;
    if (tgChatId) {
      const tgNotifier = notificationService.getNotifier('telegram') as any;
      if (tgNotifier && typeof tgNotifier.addChatId === 'function') {
        try {
          tgNotifier.addChatId(String(tgChatId));
          await tgNotifier.send(combinedPayload);
        } finally {
          try { tgNotifier.removeChatId(String(tgChatId)); } catch (e) { }
        }
      } else {
        await notificationService.notify(['telegram'], combinedPayload);
      }
    } else {
      await notificationService.notify(['telegram'], combinedPayload);
    }

    (request as any).__telegramAggregationPayloads = [];
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
        runSource: this.getRunSource(request),
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

      await this.notifyWithTelegramAggregation(channels, payload, request);
      logger.info(`Post-scrape error notification sent for ${stage}`);
    } catch (notifyErr) {
      logger.warn('Failed to send post-scrape error notification', { error: (notifyErr as Error).message });
    }
  }

  async handleResult(result: ScrapeResult, request?: ScrapeRequest): Promise<void> {
    const pipelineId = request ? (request.profileName || request.companyId || 'unknown') : 'post-scrape';
    const transactions = result.transactions || [];
    const failedSteps: { step: string; error: string }[] = [];

    const recordStepFailure = async (step: string, err: Error): Promise<void> => {
      const msg = err?.message || String(err);
      failedSteps.push({ step, error: msg });
      logger.warn(`Post-scrape step "${step}" failed (continuing with remaining steps)`, { error: msg });
      await this.sendPostScrapeErrorNotification(step, `${msg} Continuing with remaining steps.`, request);
    };

    logger.info('Post-scrape started', {
      pipelineId,
      transactionCount: transactions.length,
      accounts: result.accounts?.length || 0,
    });

    let cfg: PostScrapeConfig;
    try {
      cfg = await this.getConfig();
    } catch (err) {
      logger.error('Post-scrape: failed to load config', { error: (err as Error).message });
      await this.sendPostScrapeErrorNotification('post-scrape', (err as Error).message, request);
      return;
    }

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
        logger.info('Post-scrape step: categorization');
        this.refreshAiIfNeeded();
        if (!this.ai.hasApiKey()) {
          logger.info('Skipping post-scrape categorization: GEMINI_API_KEY not configured.');
        } else {
          try {
            await this.ai.categorizeTransactions(transactions as any);
            logger.info('Post-scrape step: categorization completed');
          } catch (err) {
            await recordStepFailure('categorization', err as Error);
          }
        }
      }

      // 2) Fraud detection (local / AI / both) – each sub-step continues on failure
      if (cfg.fraudDetection?.enabled) {
        const mode = cfg.fraudDetection.mode || 'ai';
        const scope = cfg.fraudDetection.scope || 'current';

        let transactionsToAnalyze = transactions;
        let history: typeof transactions = [];

        try {
          if (scope === 'all') {
            const allDbTxns = await this.storageService.getAllTransactions(true);
            const currentIds = new Set(transactions.map(t => t.id));
            const uniqueDbTxns = allDbTxns.filter(t => !currentIds.has(t.id));
            transactionsToAnalyze = [...transactions, ...uniqueDbTxns];
            history = uniqueDbTxns;
            logger.info(`Post-scrape fraud detection: using all transactions (${transactionsToAnalyze.length} total, ${transactions.length} new)`);
          }
        } catch (err) {
          await recordStepFailure('fraud-detection (load history)', err as Error);
        }

        if (mode === 'local' || mode === 'both') {
          logger.info('Post-scrape step: fraud detection (local)');
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
                    const channels = [...(cfg.notificationChannels || ['console'])];
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
                      runSource: this.getRunSource(request),
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

                    await this.notifyWithTelegramAggregation(channels, payload, request);
                    logger.info('Post-scrape: local fraud notification sent');
                  }
                }
              }
            } catch (err) {
              await recordStepFailure('fraud-detection-local', err as Error);
            }
          }

          // AI fraud detection – own try/catch so failure here doesn't skip custom AI
          if (mode === 'ai' || mode === 'both') {
            if (transactionsToAnalyze.length > 0) {
              logger.info('Post-scrape step: fraud detection (AI)');
              this.refreshAiIfNeeded();
              if (!this.ai.hasApiKey()) {
                logger.info('Skipping post-scrape fraud analysis (AI): GEMINI_API_KEY not configured.');
              } else {
                try {
                  const runContext =
                    `Today's date: ${new Date().toISOString().split('T')[0]}. This run: ${transactions.length} new transactions, ${transactionsToAnalyze.length} total in scope.\n\n`;
                  const lastSummary = await this.getLastAiSummary(pipelineId, 'fraud');
                  const previousInstruction = lastSummary
                    ? (botLanguage === 'he'
                        ? `\n\nסיכום הריצה הקודמת (להתייחסות בלבד):\n${lastSummary}\n\nהתמקד במה ששנה או מה חדש הפעם; הימנע מלחזור על אותו ניסוח.\n\n`
                        : `\n\nPrevious run's summary (for reference only):\n${lastSummary}\n\nFocus on what changed or what is new this time; avoid repeating the same wording.\n\n`)
                    : '\n\n';
                  const baseQuery =
                    botLanguage === 'he'
                      ? `נתח את העסקאות הבאות וזהה הונאות פוטנציאליות, חיובים לא מורשים, חריגות או מחלוקות. החזר סיכום תמציתי וכל בעיה שתתגלה בעברית.`
                      : `Analyze these transactions and identify any potential fraud, unauthorized charges, anomalies, or disputes. Return a concise summary and any detected issues in English.`;
                  const fraudQuery = runContext + previousInstruction + baseQuery;

                  const useFraudSplit = scope === 'all' && history.length > 0;
                  const fraudResult = await this.ai.analyzeData(
                    fraudQuery,
                    useFraudSplit ? [] : (transactionsToAnalyze as any),
                    {
                      temperature: 0.4,
                      ...(useFraudSplit
                        ? {
                            transactionSplit: {
                              oldTransactions: history as any,
                              newTransactions: transactions as any,
                              locale: botLanguage,
                            },
                          }
                        : {}),
                    }
                  );
                  logger.info('Post-scrape step: fraud detection (AI) completed');

                  await this.setLastAiSummary(pipelineId, 'fraud', fraudResult || '');

                const lower = (fraudResult || '').toLowerCase();
                const suspicious = /suspicious|fraud|anomaly|chargeback|dispute|unauthorized/.test(lower);
                if (suspicious && cfg.fraudDetection.notifyOnIssue) {
                  const channels = [...(cfg.notificationChannels || ['console'])];
                  const payload: NotificationPayload = {
                    pipelineId: request ? (request.profileName || request.companyId || 'unknown') : 'post-scrape',
                    status: 'warning' as any,
                    timestamp: new Date(),
                    detailLevel: 'normal',
                    runSource: this.getRunSource(request),
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

                  await this.notifyWithTelegramAggregation(channels, {
                    ...payload,
                    summary: { ...payload.summary, insights: [ fraudResult.substring(0, 1000) ] },
                  } as any, request);

                  logger.info('Post-scrape: AI fraud notification sent');
                }
                } catch (err) {
                  await recordStepFailure('fraud-detection-ai', err as Error);
                }
              }
            }
          }
      }

      // 3) Custom AI query
      if (cfg.customAI?.enabled && cfg.customAI.query) {
        logger.info('Post-scrape step: custom AI query');
        try {
          let transactionsToAnalyze = transactions;
          let customHistory: typeof transactions = [];
          if (cfg.customAI.scope === 'all') {
            const allDbTxns = await this.storageService.getAllTransactions(true);
            const currentIds = new Set(transactions.map(t => t.id));
            const uniqueDbTxns = allDbTxns.filter(t => !currentIds.has(t.id));
            customHistory = uniqueDbTxns;
            transactionsToAnalyze = [...transactions, ...uniqueDbTxns];
            logger.info(`Post-scrape custom AI: using all transactions (${transactionsToAnalyze.length} total, ${transactions.length} new)`);
          }

          if (transactionsToAnalyze.length > 0) {
            this.refreshAiIfNeeded();
            if (!this.ai.hasApiKey()) {
              logger.info('Skipping custom AI query: GEMINI_API_KEY not configured.');
            } else {
              const runContext =
                `Today's date: ${new Date().toISOString().split('T')[0]}. This run: ${transactions.length} new transactions, ${transactionsToAnalyze.length} total in scope. The user receives this analysis after every run. Focus on what changed or what is new this time; avoid repeating the same wording from previous runs.\n\n`;
              const lastSummary = await this.getLastAiSummary(pipelineId, 'custom');
              const previousInstruction = lastSummary
                ? (botLanguage === 'he'
                    ? `סיכום הריצה הקודמת (להתייחסות בלבד):\n${lastSummary}\n\n`
                    : `Previous run's summary (for reference only):\n${lastSummary}\n\n`)
                : '';
              const langSuffix = botLanguage === 'he' ? '\nאנא השב בעברית.' : '\nPlease respond in English.';
              const customQuery = runContext + previousInstruction + cfg.customAI.query + langSuffix;

              const useCustomSplit = cfg.customAI.scope === 'all' && customHistory.length > 0;
              const aiResult = await this.ai.analyzeData(
                customQuery,
                useCustomSplit ? [] : (transactionsToAnalyze as any),
                {
                  temperature: 0.4,
                  ...(useCustomSplit
                    ? {
                        transactionSplit: {
                          oldTransactions: customHistory as any,
                          newTransactions: transactions as any,
                          locale: botLanguage,
                        },
                      }
                    : {}),
                }
              );
              logger.info('Post-scrape: custom AI query completed');

              await this.setLastAiSummary(pipelineId, 'custom', aiResult || '');

              if (cfg.customAI.notifyOnResult) {
                const channels = [...(cfg.notificationChannels || ['console'])];
                const payload: NotificationPayload = {
                  pipelineId: request ? (request.profileName || request.companyId || 'unknown') : 'post-scrape',
                  status: 'success',
                  timestamp: new Date(),
                  detailLevel: 'normal',
                  runSource: this.getRunSource(request),
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

                await this.notifyWithTelegramAggregation(channels, {
                  ...payload,
                  summary: { ...payload.summary, insights: [ aiResult.substring(0, 1000) ] },
                } as any, request);

                logger.info('Post-scrape: custom AI notification sent');
              }
            }
          }
        } catch (err) {
          await recordStepFailure('custom-ai', err as Error);
        }
      }

      // 4) Persist post-scrape metadata (non-fatal)
      try {
        const global = await this.storageService.getGlobalScrapeConfig();
        const outDir = path.join(process.env.DATA_DIR || './data', 'post_scrape');
        await fs.ensureDir(outDir);
        const filename = `${request?.companyId || 'unknown'}_${Date.now()}_postscrape.json`;
        await fs.writeJson(path.join(outDir, filename), { config: global.postScrapeConfig, resultSummary: { transactions: transactions.length, accounts: result.accounts?.length || 0 } }, { spaces: 2 });
        logger.debug('Post-scrape metadata persisted', { filename });
      } catch (err) {
        logger.warn('Post-scrape: failed to persist metadata (non-fatal)', { error: (err as Error).message });
      }

    if (failedSteps.length > 0) {
      logger.warn('Post-scrape finished with failed steps', {
        pipelineId,
        failedSteps: failedSteps.map(f => `${f.step}: ${f.error}`),
      });
      const summaryMsg = `Post-scrape completed with errors. Failed: ${failedSteps.map(f => f.step).join(', ')}. Check logs for details. Remaining steps ran successfully.`;
      await this.sendPostScrapeErrorNotification('post-scrape-summary', summaryMsg, request);
    } else {
      logger.info('Post-scrape finished successfully', { pipelineId });
    }
  }

  /**
   * Run post-scrape once after multiple scrapes have finished.
   * Use when scrapers were run with deferPostScrape (e.g. Telegram "scrape all" or scheduler).
   * Combines successful results into one synthetic result; "current" scope = all latest scrapes (this batch).
   */
  async handleBatchResults(batchResults: ScrapeResult[], request?: ScrapeRequest): Promise<void> {
    const successful = batchResults.filter((r) => r.success && r.transactions && r.transactions.length > 0);
    if (successful.length === 0) {
      logger.info('Post-scrape batch: no successful results with transactions, skipping');
      return;
    }

    const combinedTransactions = successful.flatMap((r) => r.transactions || []);
    const totalDurationMs = successful.reduce((sum, r) => sum + (r.executionTimeMs || 0), 0);
    const accounts = successful.flatMap((r) => r.accounts || []);

    const syntheticResult: ScrapeResult = {
      success: true,
      transactions: combinedTransactions,
      accounts: accounts.length ? accounts : undefined,
      executionTimeMs: totalDurationMs,
      logs: [],
    };

    logger.info(`Post-scrape batch: running once for ${successful.length} scrape(s), ${combinedTransactions.length} total transactions`);

    await this.handleResult(syntheticResult, request);
    await this.sendScrapeNotification(syntheticResult, request);

    const reqAny = request as any;
    if (reqAny && (reqAny.options?.aggregateTelegramNotifications || reqAny.options?.postScrape)) {
      try {
        await this.flushAggregatedTelegramNotification(request);
      } catch (err) {
        logger.warn('Post-scrape batch: flush Telegram notification failed', { error: (err as Error).message });
      }
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
        runSource: this.getRunSource(request),
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

      await this.notifyWithTelegramAggregation(channels, payload, request);
      logger.info('Scrape notification sent', { success, channels });
    } catch (err) {
      logger.warn('Failed to send scrape notification', { error: (err as Error).message });
    }
  }
}

export const postScrapeService = new PostScrapeService();
