import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { notificationService, NotificationPayload } from './notifications/index.js';
import { AiService, AI_CATEGORIZATION_NO_API_KEY } from './aiService.js';
import {
  ScrapeResult,
  ScrapeRequest,
  PostScrapeConfig,
  FraudSeverity,
  computeFinancialDigestSnapshot,
  formatBudgetHealthDigestLine,
  formatAnomalyDigestLine,
  type DigestLocale,
  type Transaction,
  type TransactionReviewItem,
  expenseCategoryKey,
  transactionNeedsReview,
} from '@app/shared';
import { telegramBotService } from './telegramBotService.js';
import { serviceLogger as logger } from '../utils/logger.js';
import { StorageService } from './storageService.js';
import { fraudDetectionService } from './fraudDetectionService.js';
import { DbService } from './dbService.js';
import type { Server } from 'socket.io';
import {
  type ScrapeRunActionRecord,
  generateScrapeRunLogId,
  writeScrapeRunLog,
} from '../utils/scrapeRunLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POST_SCRAPE_DIR = () => path.join(process.env.DATA_DIR || './data', 'post_scrape');
const REVIEW_ALERT_FILE = () => path.join(POST_SCRAPE_DIR(), 'last_transaction_review.json');
const MAX_LAST_SUMMARY_CHARS = 2000;

function sanitizePipelineId(id: string): string {
  return id.replace(/[/\\:]/g, '_');
}

export class PostScrapeService {
  private ai: AiService;
  private storageService: StorageService;
  private dbService: DbService;
  private io: Server | null = null;

  constructor() {
    this.ai = new AiService();
    this.storageService = new StorageService();
    this.dbService = new DbService();
  }

  /** Optional: used to notify the web UI when AI categorization fails (cache still applied). */
  setSocketIO(io: Server | null) {
    this.io = io;
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

  private async persistReviewAlert(items: TransactionReviewItem[]): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(REVIEW_ALERT_FILE()));
      await fs.writeJson(
        REVIEW_ALERT_FILE(),
        { updatedAt: new Date().toISOString(), items },
        { spaces: 2 }
      );
    } catch (e) {
      logger.warn('Failed to persist transaction review alert', { error: (e as Error).message });
    }
  }

  /**
   * New transactions in Transfers (העברות) or default bucket (אחר) — remind user to set memo or category.
   * Uses configured notification channels. For batch runs where DB was saved before post-scrape, pass
   * `options.postScrape.newTransactionIds` on the request.
   */
  private async maybeNotifyTransactionReview(
    transactions: Transaction[],
    request: ScrapeRequest | undefined,
    botLanguage: 'en' | 'he'
  ): Promise<void> {
    try {
      const cfg = await this.getConfig();
      const rem = cfg.transactionReviewReminder;
      if (rem?.enabled === false) return;

      const transfersOn = rem?.notifyTransfersCategory !== false;
      const uncategorizedOn = rem?.notifyUncategorized !== false;
      if (!transfersOn && !uncategorizedOn) return;

      const explicitNewIds = (request as any)?.options?.postScrape?.newTransactionIds as string[] | undefined;
      const newIdSet = explicitNewIds && explicitNewIds.length > 0 ? new Set(explicitNewIds) : null;

      const newTxns = transactions.filter((t) => {
        if (t.isInternalTransfer === true) return false;
        if (newIdSet) return newIdSet.has(t.id);
        return !this.dbService.transactionExists(t.id);
      });

      const items: TransactionReviewItem[] = [];
      for (const t of newTxns) {
        const reason = transactionNeedsReview(t, { transfers: transfersOn, uncategorized: uncategorizedOn });
        if (!reason) continue;
        items.push({
          id: t.id,
          description: t.description || '',
          date: typeof t.date === 'string' ? t.date.slice(0, 10) : String(t.date),
          amount: t.amount ?? t.chargedAmount ?? 0,
          category: expenseCategoryKey(t.category),
          accountNumber: t.accountNumber || '',
          reason,
        });
      }

      if (items.length === 0) return;

      await this.persistReviewAlert(items);

      try {
        this.io?.emit('transactions:review-needed', { count: items.length, items });
      } catch (e) {
        logger.warn('Failed to emit transactions:review-needed', { error: (e as Error).message });
      }

      const channels = [...(cfg.notificationChannels || ['console'])];
      if (!channels.includes('telegram')) {
        const tgNotifier = notificationService.getNotifier('telegram');
        if (tgNotifier && tgNotifier.isEnabled()) {
          channels.push('telegram');
        }
      }

      const sendTelegram = channels.includes('telegram');
      const channelsNoTelegram = channels.filter((c) => c !== 'telegram');

      const headline =
        botLanguage === 'he'
          ? `${items.length} תנועות חדשות: נא להוסיף הערה או לדייק קטגוריה (העברות / אחר).`
          : `${items.length} new transaction(s): please set memo or refine category (Transfers / Other).`;

      const lines = items.slice(0, 12).map((it) => {
        const tag =
          it.reason === 'transfers'
            ? botLanguage === 'he'
              ? 'העברות'
              : 'Transfers'
            : botLanguage === 'he'
              ? 'אחר'
              : 'Other';
        const desc = (it.description || '').slice(0, 80);
        const acct = (it.accountNumber || '').trim();
        const acctBit = acct ? (botLanguage === 'he' ? ` · חשבון ${acct}` : ` · acct ${acct}`) : '';
        return `• ${desc} (${tag}, ₪${it.amount}${acctBit})`;
      });

      const payload: NotificationPayload = {
        pipelineId: request ? (request.profileName || request.companyId || 'post-scrape') : 'post-scrape',
        status: 'warning' as any,
        timestamp: new Date(),
        detailLevel: 'normal',
        runSource: this.getRunSource(request),
        summary: {
          durationMs: 0,
          stagesRun: ['scrape', 'post-scrape'],
          successfulStages: ['scrape', 'post-scrape'],
          transactionCount: transactions.length,
          insights: [headline, ...lines],
        },
      };

      await this.notifyWithTelegramAggregation(channelsNoTelegram, payload, request);

      if (sendTelegram) {
        try {
          await telegramBotService.sendMemoReplyPromptsForReview(items, request, botLanguage);
        } catch (e) {
          logger.warn('Transaction review: Telegram memo reply prompts failed', {
            error: (e as Error).message,
          });
        }
      }

      logger.info('Transaction review reminder sent', { count: items.length });
    } catch (err) {
      logger.warn('maybeNotifyTransactionReview failed', { error: (err as Error).message });
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

    const digestInsights = buffer
      .filter((p) => p.pipelineId === 'Spending digest')
      .flatMap((p) => p.summary?.insights || [])
      .filter((s) => !!s);
    const otherInsights = buffer
      .filter((p) => p.pipelineId !== 'Spending digest')
      .flatMap((p) => p.summary?.insights || [])
      .filter((s) => !!s);
    const insights = [...digestInsights, ...otherInsights].slice(0, 24);

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
   * Optional spending digest (budget pace + anomalies + whale alerts) via @app/shared.
   * Uses the same Telegram aggregation buffer as other post-scrape notifications when enabled.
   * Skips if disabled in post-scrape config, Telegram notifier off, or digest fingerprint unchanged since last send.
   */
  private async maybeSendSpendingDigestNotification(request?: ScrapeRequest): Promise<void> {
    const postCfg = await this.getConfig();
    if (!postCfg.spendingDigestEnabled) return;

    const tgNotifier = notificationService.getNotifier('telegram');
    if (!tgNotifier || !tgNotifier.isEnabled()) return;

    const txns = await this.storageService.getAllTransactions(true);
    const snapshot = computeFinancialDigestSnapshot(txns as any, {});
    if (!snapshot) return;

    const fpPath = path.join(process.env.DATA_DIR || './data', 'post_scrape', 'last_spending_digest_fp.txt');
    await fs.ensureDir(path.dirname(fpPath));
    let lastFp = '';
    try {
      if (await fs.pathExists(fpPath)) {
        lastFp = (await fs.readFile(fpPath, 'utf-8')).trim();
      }
    } catch {
      /* ignore */
    }
    if (lastFp === snapshot.digestFingerprint) {
      logger.debug('Spending digest skipped (same fingerprint as last send)');
      return;
    }

    const telCfg = telegramBotService.getConfig();
    const digestLocale: DigestLocale = telCfg.language === 'he' ? 'he' : 'en';
    const budgetLine = formatBudgetHealthDigestLine(snapshot.budgetHealth, digestLocale);
    const insights: string[] = [
      `${snapshot.month}: ${budgetLine} (pace ${snapshot.budgetHealth.velocityRatio.toFixed(2)}×)`,
    ];
    if (snapshot.anomalies.length) {
      snapshot.anomalies.forEach((a) => insights.push(`• ${formatAnomalyDigestLine(a, digestLocale)}`));
    } else {
      insights.push(digestLocale === 'he' ? 'אין התראות קטגוריה.' : 'No category alerts.');
    }

    const channels = [...(postCfg.notificationChannels || ['console'])];
    if (!channels.includes('telegram')) {
      if (tgNotifier && tgNotifier.isEnabled()) {
        channels.push('telegram');
      }
    }

    const payload: NotificationPayload = {
      pipelineId: 'Spending digest',
      status: 'success',
      timestamp: new Date(),
      detailLevel: 'normal',
      runSource: this.getRunSource(request),
      summary: {
        durationMs: 0,
        stagesRun: ['digest'],
        successfulStages: ['digest'],
        transactionCount: txns.length,
        insights,
      },
    };

    await this.notifyWithTelegramAggregation(channels, payload, request);

    await fs.writeFile(fpPath, snapshot.digestFingerprint, 'utf-8');
    logger.info('Spending digest queued/sent (same channel aggregation as post-scrape)');
  }

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

  private async sendCategorizationFailedNotification(
    errorMessage: string,
    botLanguage: 'en' | 'he',
    request?: ScrapeRequest
  ): Promise<void> {
    try {
      const cfg = await this.getConfig();
      const channels = [...(cfg.notificationChannels || ['console'])];

      if (!channels.includes('telegram')) {
        const tgNotifier = notificationService.getNotifier('telegram');
        if (tgNotifier && tgNotifier.isEnabled()) {
          channels.push('telegram');
        }
      }

      const insights =
        botLanguage === 'he'
          ? [
              `סיווג AI נכשל: ${errorMessage}`,
              'הוחלו קטגוריות מהמטמון ככל שניתן.',
              'לנסות שוב: באפליקציה → הגדרות → AI → סווג מחדש הכל, או POST /api/ai/categorize/all',
            ]
          : [
              `AI categorization failed: ${errorMessage}`,
              'Cached categories were applied where available.',
              'Retry: web app → Configuration → AI → Recategorize all, or POST /api/ai/categorize/all',
            ];

      const payload: NotificationPayload = {
        pipelineId: request ? (request.profileName || request.companyId || 'unknown') : 'post-scrape',
        status: 'warning',
        timestamp: new Date(),
        detailLevel: 'normal',
        runSource: this.getRunSource(request),
        summary: {
          durationMs: 0,
          stagesRun: ['scrape', 'categorization'],
          successfulStages: ['scrape'],
          failedStage: 'categorization',
          insights,
        },
        errorDetails: {
          stage: 'categorization',
          message: errorMessage,
        },
      };

      await this.notifyWithTelegramAggregation(channels, payload, request);
      logger.info('Categorization failure notification sent');
    } catch (notifyErr) {
      logger.warn('Failed to send categorization failure notification', { error: (notifyErr as Error).message });
    }
  }

  async handleResult(result: ScrapeResult, request?: ScrapeRequest): Promise<ScrapeRunActionRecord[]> {
    const pipelineId = request ? (request.profileName || request.companyId || 'unknown') : 'post-scrape';
    let transactions = result.transactions || [];
    const failedSteps: { step: string; error: string }[] = [];

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
      return [{ key: 'load-config', status: 'failed', detail: (err as Error).message }];
    }

    const actions: ScrapeRunActionRecord[] = [{ key: 'load-config', status: 'ok' }];

    const recordStepFailure = async (step: string, err: Error): Promise<void> => {
      const msg = err?.message || String(err);
      failedSteps.push({ step, error: msg });
      actions.push({ key: step, status: 'failed', detail: msg });
      logger.warn(`Post-scrape step "${step}" failed (continuing with remaining steps)`, { error: msg });
      await this.sendPostScrapeErrorNotification(step, `${msg} Continuing with remaining steps.`, request);
    };

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
        const { transactions: categorized, aiError } = await this.ai.categorizeTransactions(transactions as any);
        result.transactions = categorized;
        transactions = categorized;
        if (aiError) {
          if (aiError !== AI_CATEGORIZATION_NO_API_KEY) {
            await this.sendCategorizationFailedNotification(aiError, botLanguage, request);
            try {
              this.io?.emit('categorization:failed', { error: aiError });
            } catch (e) {
              logger.warn('Failed to emit categorization:failed socket event', { error: (e as Error).message });
            }
            logger.warn('Post-scrape: AI categorization failed; applied cache where available', { error: aiError });
            actions.push({ key: 'categorization', status: 'partial', detail: aiError });
          } else {
            logger.info('Post-scrape: category cache only (GEMINI_API_KEY not configured).');
            actions.push({
              key: 'categorization',
              status: 'skipped_no_key',
              detail: 'GEMINI_API_KEY not configured (cache only)',
            });
          }
        } else {
          logger.info('Post-scrape step: categorization completed');
          actions.push({ key: 'categorization', status: 'ok' });
        }
      } else {
        actions.push({
          key: 'categorization',
          status: 'skipped',
          detail: !runCategorization ? 'disabled in config or request' : 'no transactions',
        });
      }

      try {
        await this.maybeNotifyTransactionReview(transactions, request, botLanguage);
        actions.push({ key: 'transaction-review', status: 'ok' });
      } catch (e) {
        actions.push({ key: 'transaction-review', status: 'failed', detail: (e as Error).message });
      }

      // 2) Fraud detection (local / AI / both) – each sub-step continues on failure
      if (!cfg.fraudDetection?.enabled) {
        actions.push({ key: 'fraud-local', status: 'skipped' });
        actions.push({ key: 'fraud-ai', status: 'skipped' });
      } else {
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
          await recordStepFailure('fraud-history-load', err as Error);
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
              actions.push({ key: 'fraud-local', status: 'ok' });
            } catch (err) {
              await recordStepFailure('fraud-local', err as Error);
            }
          } else {
            actions.push({ key: 'fraud-local', status: 'skipped' });
          }

          // AI fraud detection – own try/catch so failure here doesn't skip custom AI
          if (mode === 'ai' || mode === 'both') {
            if (transactionsToAnalyze.length > 0) {
              logger.info('Post-scrape step: fraud detection (AI)');
              this.refreshAiIfNeeded();
              if (!this.ai.hasApiKey()) {
                logger.info('Skipping post-scrape fraud analysis (AI): GEMINI_API_KEY not configured.');
                actions.push({ key: 'fraud-ai', status: 'skipped_no_key', detail: 'GEMINI_API_KEY not configured' });
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
                  actions.push({ key: 'fraud-ai', status: 'ok' });
                } catch (err) {
                  await recordStepFailure('fraud-ai', err as Error);
                }
              }
            } else {
              actions.push({ key: 'fraud-ai', status: 'skipped', detail: 'no transactions in scope' });
            }
          } else {
            actions.push({ key: 'fraud-ai', status: 'skipped' });
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

          const skipWhenNoTx = cfg.customAI.skipIfNoTransactions !== false;
          const shouldRunCustomAi = transactionsToAnalyze.length > 0 || !skipWhenNoTx;

          if (!shouldRunCustomAi) {
            actions.push({ key: 'custom-ai', status: 'skipped', detail: 'no transactions' });
          } else {
            this.refreshAiIfNeeded();
            if (!this.ai.hasApiKey()) {
              logger.info('Skipping custom AI query: GEMINI_API_KEY not configured.');
              actions.push({ key: 'custom-ai', status: 'skipped_no_key', detail: 'GEMINI_API_KEY not configured' });
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
              actions.push({ key: 'custom-ai', status: 'ok' });
            }
          }
        } catch (err) {
          await recordStepFailure('custom-ai', err as Error);
        }
      } else {
        actions.push({ key: 'custom-ai', status: 'skipped' });
      }

      // 4) Persist post-scrape metadata (non-fatal)
      try {
        const global = await this.storageService.getGlobalScrapeConfig();
        const outDir = path.join(process.env.DATA_DIR || './data', 'post_scrape');
        await fs.ensureDir(outDir);
        const filename = `${request?.companyId || 'unknown'}_${Date.now()}_postscrape.json`;
        await fs.writeJson(path.join(outDir, filename), { config: global.postScrapeConfig, resultSummary: { transactions: transactions.length, accounts: result.accounts?.length || 0 } }, { spaces: 2 });
        logger.debug('Post-scrape metadata persisted', { filename });
        actions.push({ key: 'persist-metadata', status: 'ok', detail: filename });
      } catch (err) {
        logger.warn('Post-scrape: failed to persist metadata (non-fatal)', { error: (err as Error).message });
        actions.push({ key: 'persist-metadata', status: 'failed', detail: (err as Error).message });
      }

      actions.push({ key: 'spending-digest', status: 'queued', detail: 'async notification' });
      void this.maybeSendSpendingDigestNotification(request).catch((err) => {
        logger.warn('Spending digest notification failed', { error: (err as Error)?.message });
      });

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

    return actions;
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

    const cfg = await this.getConfig();
    const reqAny = request as any;
    if (reqAny?.options && reqAny.options.aggregateTelegramNotifications === undefined) {
      reqAny.options.aggregateTelegramNotifications = cfg.aggregateTelegramNotifications !== false;
    }

    const batchLogId = generateScrapeRunLogId();
    if (request) {
      (request as any).__scrapeRunLogId = batchLogId;
    }

    let postActions: ScrapeRunActionRecord[] = [];
    try {
      postActions = await this.handleResult(syntheticResult, request);
    } catch (err) {
      postActions = [{ key: 'post-scrape', status: 'failed', detail: (err as Error)?.message || String(err) }];
      logger.warn('Post-scrape batch: handleResult failed', { error: (err as Error)?.message });
    }

    let notifAction: ScrapeRunActionRecord = { key: 'scrape-notification', status: 'ok' };
    try {
      await this.sendScrapeNotification(syntheticResult, request);
    } catch (err) {
      notifAction = { key: 'scrape-notification', status: 'failed', detail: (err as Error)?.message || String(err) };
    }

    let flushAction: ScrapeRunActionRecord = { key: 'telegram-aggregate-flush', status: 'skipped' };
    if (reqAny && (reqAny.options?.aggregateTelegramNotifications || reqAny.options?.postScrape)) {
      flushAction = { key: 'telegram-aggregate-flush', status: 'ok' };
      try {
        await this.flushAggregatedTelegramNotification(request);
      } catch (err) {
        flushAction = {
          key: 'telegram-aggregate-flush',
          status: 'failed',
          detail: (err as Error).message,
        };
        logger.warn('Post-scrape batch: flush Telegram notification failed', { error: (err as Error).message });
      }
    }

    const pipelineId = request ? (request.profileName || request.companyId || 'batch') : 'batch';
    await writeScrapeRunLog({
      id: batchLogId,
      pipelineId,
      companyId: request?.companyId,
      profileName: request?.profileName,
      runSource: this.getRunSource(request),
      kind: 'batch',
      transactionCount: combinedTransactions.length,
      scrapeSuccess: true,
      savedFilenames: Array.isArray(reqAny?.options?.batchSavedFilenames)
        ? reqAny.options.batchSavedFilenames
        : undefined,
      actions: [...postActions, notifAction, flushAction],
    });
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
      throw err;
    }
  }

  async getReviewAlert(): Promise<{ updatedAt: string; items: TransactionReviewItem[] } | null> {
    try {
      if (await fs.pathExists(REVIEW_ALERT_FILE())) {
        const data = await fs.readJson(REVIEW_ALERT_FILE());
        if (data?.items && Array.isArray(data.items)) {
          return { updatedAt: data.updatedAt || '', items: data.items };
        }
      }
    } catch (e) {
      logger.warn('Failed to read review alert', { error: (e as Error).message });
    }
    return null;
  }

  async clearReviewAlert(): Promise<void> {
    try {
      if (await fs.pathExists(REVIEW_ALERT_FILE())) {
        await fs.remove(REVIEW_ALERT_FILE());
      }
    } catch (e) {
      logger.warn('Failed to clear review alert', { error: (e as Error).message });
    }
  }
}

export const postScrapeService = new PostScrapeService();
