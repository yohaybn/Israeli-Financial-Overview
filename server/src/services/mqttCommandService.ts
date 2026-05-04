/**
 * MQTT JSON command bridge — same intent as Telegram slash commands on a subscribed command topic.
 * Auth: set `commandSecret` in mqtt_config and/or require `userId` matching Telegram `allowedUsers`.
 */

import path from 'path';
import fs from 'fs-extra';
import {
  DEFAULT_FINANCIAL_REPORT_SCHEDULE,
  normalizeFinancialReportSchedule,
  type Profile,
  type ScrapeRequest,
  type ScrapeResult,
  type Transaction,
  transactionNeedsReview,
  transactionsToCsv,
  transactionsToJson,
} from '@app/shared';
import { mqttClientService } from './mqttClientService.js';
import { telegramBotService } from './telegramBotService.js';
import { profileService } from './profileService.js';
import { ScraperService } from './scraperService.js';
import { StorageService } from './storageService.js';
import { postScrapeService } from './postScrapeService.js';
import { appLockService } from './appLockService.js';
import { ConfigService } from './configService.js';
import { AiService } from './aiService.js';
import { generateFinancialPdfBuffer } from './financialPdfReportService.js';
import { serverLogger as logger } from '../utils/logger.js';
import { PROJECT_ROOT } from '../runtimeEnv.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const SCHEDULER_CONFIG_PATH = path.join(DATA_DIR, 'config', 'scheduler_config.json');
const LEGACY_SCHEDULER_CONFIG_PATH = path.join(PROJECT_ROOT, 'server', 'data', 'scheduler_config.json');

interface MqttCommandEnvelope {
  command?: string;
  requestId?: string;
  secret?: string;
  userId?: string;
  args?: Record<string, unknown>;
}

let unregisterHandler: (() => void) | null = null;

function readFinancialReportScheduleFromDisk() {
  let stored: { financialReportSchedule?: Record<string, unknown> } = {};
  try {
    if (fs.existsSync(SCHEDULER_CONFIG_PATH)) {
      stored = fs.readJsonSync(SCHEDULER_CONFIG_PATH) as { financialReportSchedule?: Record<string, unknown> };
    } else if (fs.existsSync(LEGACY_SCHEDULER_CONFIG_PATH)) {
      stored = fs.readJsonSync(LEGACY_SCHEDULER_CONFIG_PATH) as { financialReportSchedule?: Record<string, unknown> };
    }
  } catch (e) {
    logger.warn('mqttCommand: read scheduler config failed', { error: (e as Error).message });
  }
  const partial = stored.financialReportSchedule;
  return normalizeFinancialReportSchedule({
    ...DEFAULT_FINANCIAL_REPORT_SCHEDULE,
    ...(partial && typeof partial === 'object' ? partial : {}),
  });
}

function currentLocalMonthYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function responseTopicFor(cfg: ReturnType<typeof mqttClientService.getConfig>): string {
  const cmd = cfg.commandTopic?.trim();
  if (!cmd) return '';
  return (cfg.commandResponseTopic?.trim() || `${cmd.replace(/\/+$/, '')}/response`).trim();
}

function authorizeCommand(cfg: ReturnType<typeof mqttClientService.getConfig>, env: MqttCommandEnvelope): { ok: true } | { ok: false; error: string } {
  const secret = (cfg.commandSecret || '').trim();
  const hasTelegramUsers = telegramBotService.isAllowedUsersConfigured();
  if (secret) {
    if (env.secret !== secret) {
      return { ok: false, error: 'invalid_or_missing_secret' };
    }
  } else if (hasTelegramUsers) {
    const uid = (env.userId || '').trim();
    if (!uid || !telegramBotService.isTelegramUserAllowed(uid)) {
      return { ok: false, error: 'user_not_authorized_set_command_secret_or_valid_userId' };
    }
  } else {
    return {
      ok: false,
      error: 'configure_command_secret_or_telegram_allowed_users',
    };
  }
  if (hasTelegramUsers) {
    const uid = (env.userId || '').trim();
    if (!uid || !telegramBotService.isTelegramUserAllowed(uid)) {
      return { ok: false, error: 'user_not_authorized' };
    }
  }
  return { ok: true };
}

async function publishResponse(
  cfg: ReturnType<typeof mqttClientService.getConfig>,
  body: Record<string, unknown>
): Promise<void> {
  const rt = responseTopicFor(cfg);
  if (!rt || !mqttClientService.getStatus().connected) return;
  await mqttClientService.publish(rt, JSON.stringify(body), { qos: 1 });
}

async function handleStatus(): Promise<Record<string, unknown>> {
  const tg = telegramBotService.getConfig();
  const mq = mqttClientService.getStatus();
  return {
    ok: true,
    command: 'status',
    telegram: {
      active: telegramBotService.isActive(),
      notificationChats: tg.notificationChatIds?.length ?? 0,
      reportChats: (tg.reportChatIds || []).length,
      tokenPresent: !!tg.botToken?.trim(),
    },
    mqtt: {
      connected: mq.connected,
      brokerHost: mq.brokerHost,
      lastError: mq.lastError,
    },
    appLock: {
      configured: appLockService.isLockConfigured(),
      unlocked: appLockService.isUnlocked(),
    },
  };
}

function helpPayload(): Record<string, unknown> {
  return {
    ok: true,
    command: 'help',
    commands: [
      { name: 'status', args: {} },
      { name: 'help', args: {} },
      { name: 'scrape', args: { profileId: '<id>' } },
      { name: 'scrape', args: { all: true, startDate: 'YYYY-MM-DD optional' } },
      { name: 'export', args: { format: 'csv|json', month: 'YYYY-MM optional' } },
      { name: 'review', args: {} },
      { name: 'report', args: { scope: 'month|all', monthYm: 'YYYY-MM when scope=month' } },
    ],
    note: 'Include secret when commandSecret is set; include userId when Telegram allowedUsers is configured.',
  };
}

async function handleExport(args: Record<string, unknown> | undefined): Promise<Record<string, unknown>> {
  const format = String(args?.format || '').toLowerCase();
  if (format !== 'csv' && format !== 'json') {
    return { ok: false, error: 'export_requires_args_format_csv_or_json' };
  }
  const month = args?.month != null ? String(args.month).trim() : '';
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, error: 'invalid_month_use_YYYY-MM' };
  }
  const storage = new StorageService();
  let txns = (await storage.getAllTransactions(true)) as Transaction[];
  if (month) {
    txns = txns.filter((t) => typeof t.date === 'string' && t.date.startsWith(month));
  }
  if (!txns.length) {
    return { ok: false, error: 'no_transactions' };
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const fileBase = month ? `transactions-${month}` : `transactions-${stamp}`;
  const body = format === 'json' ? transactionsToJson(txns) : transactionsToCsv(txns);
  const filename = `${fileBase}.${format}`;
  return {
    ok: true,
    command: 'export',
    filename,
    format,
    count: txns.length,
    dataBase64: Buffer.from(body, 'utf-8').toString('base64'),
  };
}

async function handleReview(): Promise<Record<string, unknown>> {
  const cfg = await postScrapeService.getConfig();
  const rem = cfg.transactionReviewReminder;
  if (rem?.enabled === false) {
    return { ok: false, error: 'review_disabled' };
  }
  const transfersOn = rem?.notifyTransfersCategory !== false;
  const uncategorizedOn = rem?.notifyUncategorized !== false;
  if (!transfersOn && !uncategorizedOn) {
    return { ok: false, error: 'review_disabled' };
  }
  const storage = new StorageService();
  let txns = (await storage.getAllTransactions(true)) as Transaction[];
  txns = txns.filter((t) => t.isInternalTransfer !== true);
  const lines: string[] = [];
  for (const t of txns) {
    const reason = transactionNeedsReview(t, { transfers: transfersOn, uncategorized: uncategorizedOn });
    if (!reason) continue;
    const desc = (t.description || '').slice(0, 80);
    lines.push(`${t.date?.toString().slice(0, 10) ?? ''} | ${t.amount ?? t.chargedAmount ?? 0} | ${desc} | ${t.id} | ${reason}`);
  }
  return {
    ok: true,
    command: 'review',
    count: lines.length,
    lines: lines.slice(0, 200),
    truncated: lines.length > 200,
  };
}

async function handleReport(args: Record<string, unknown> | undefined): Promise<Record<string, unknown>> {
  const scopeRaw = String(args?.scope || 'month').toLowerCase();
  const pdfScope = scopeRaw === 'all' ? 'all' : 'month';
  let monthYm = currentLocalMonthYm();
  if (pdfScope === 'month') {
    const m = args?.monthYm != null ? String(args.monthYm).trim() : '';
    if (m) {
      if (!/^\d{4}-\d{2}$/.test(m)) return { ok: false, error: 'invalid_monthYm' };
      monthYm = m;
    }
  }
  const fr = readFinancialReportScheduleFromDisk();
  const storage = new StorageService();
  const configService = new ConfigService();
  const aiService = new AiService();
  const pdf = await generateFinancialPdfBuffer(storage, configService, aiService, {
    monthYm,
    pdfScope,
    localeMode: fr.localeMode,
    sections: fr.sections,
    monthComparison: {
      enabled:
        pdfScope === 'month' &&
        fr.sections.monthComparison === true &&
        ((fr.monthComparisonPriorMonths ?? 0) > 0 || fr.monthComparisonYearOverYear === true),
      priorMonths: fr.monthComparisonPriorMonths ?? 0,
      yearOverYear: fr.monthComparisonYearOverYear === true,
    },
  });
  const filename = pdfScope === 'all' ? 'financial-report-all-time.pdf' : `financial-report-${monthYm}.pdf`;
  return {
    ok: true,
    command: 'report',
    filename,
    pdfBase64: pdf.toString('base64'),
  };
}

async function executeScrapeOne(
  profile: Profile,
  userId: string | undefined,
  startDate: string | undefined,
  deferBatch: boolean
): Promise<{ result: ScrapeResult | null; newTransactionIds: string[]; savedFilename?: string }> {
  const scraperService = new ScraperService();
  const scrapeRequest: ScrapeRequest = {
    companyId: profile.companyId,
    credentials: profile.credentials,
    profileId: profile.id,
    profileName: profile.name,
    options: {
      ...profile.options,
      showBrowser: false,
      aggregateTelegramNotifications: !deferBatch,
      deferPostScrape: deferBatch,
      runSource: 'manual',
      initiatedBy: userId ? `mqtt:${userId}` : 'mqtt',
      ...(startDate ? { startDate } : {}),
    } as any,
  };
  const result = await scraperService.runScrape(scrapeRequest);
  if (!result.success) {
    return { result, newTransactionIds: [] };
  }
  const storage = new StorageService();
  let newTransactionIds: string[] = [];
  let savedFilename: string | undefined;
  try {
    const saved = await storage.saveScrapeResult(result, profile.companyId, profile.name || profile.id);
    newTransactionIds = saved.newTransactionIds;
    savedFilename = saved.filename;
  } catch (saveErr) {
    logger.warn('MQTT scrape: save failed', { error: (saveErr as Error).message });
  }
  return { result, newTransactionIds, savedFilename };
}

async function handleScrape(args: Record<string, unknown> | undefined, userId: string | undefined): Promise<Record<string, unknown>> {
  const all = args?.all === true || String(args?.all).toLowerCase() === 'true';
  const profileId = args?.profileId != null ? String(args.profileId).trim() : '';
  const startDate = args?.startDate != null ? String(args.startDate).trim() : undefined;
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { ok: false, error: 'invalid_startDate_use_YYYY-MM-DD' };
  }
  const profiles = await profileService.getProfiles();
  if (!profiles.length) {
    return { ok: false, error: 'no_profiles' };
  }

  if (all) {
    const results: ScrapeResult[] = [];
    const allNewIds: string[] = [];
    const filenames: string[] = [];
    const lines: string[] = [];
    const batchRequest: ScrapeRequest = {
      companyId: 'batch',
      credentials: {},
      profileName: 'All profiles',
      options: {
        showBrowser: false,
        deferPostScrape: true,
        aggregateTelegramNotifications: true,
        aggregateMqttNotifications: true,
        runSource: 'manual',
        initiatedBy: userId ? `mqtt:${userId}` : 'mqtt',
        ...(startDate ? { startDate } : {}),
      } as any,
    };
    for (const p of profiles) {
      const { result, newTransactionIds, savedFilename } = await executeScrapeOne(p, userId, startDate, true);
      if (result) results.push(result);
      allNewIds.push(...newTransactionIds);
      if (savedFilename) filenames.push(savedFilename);
      const label = p.name || p.id;
      if (result?.success) {
        lines.push(`ok ${label}: ${result.transactions?.length ?? 0} txns`);
      } else {
        lines.push(`fail ${label}: ${result?.error || 'error'}`);
      }
    }
    if (results.length) {
      try {
        const reqAny = batchRequest.options as any;
        reqAny.postScrape = { ...(reqAny.postScrape || {}), newTransactionIds: allNewIds };
        reqAny.batchSavedFilenames = filenames;
        await postScrapeService.handleBatchResults(results, batchRequest);
      } catch (e) {
        logger.warn('MQTT scrape-all post-batch failed', { error: (e as Error).message });
      }
    }
    return { ok: true, command: 'scrape', mode: 'all', summary: lines };
  }

  if (!profileId) {
    return { ok: false, error: 'scrape_requires_profileId_or_all_true' };
  }
  const profile = await profileService.getProfile(profileId);
  if (!profile) {
    return { ok: false, error: 'profile_not_found' };
  }
  const { result, newTransactionIds } = await executeScrapeOne(profile, userId, startDate, false);
  return {
    ok: !!result?.success,
    command: 'scrape',
    profileId,
    transactionCount: result?.transactions?.length ?? 0,
    error: result?.success ? undefined : result?.error,
    newTransactionCount: newTransactionIds.length,
  };
}

async function dispatchCommand(env: MqttCommandEnvelope): Promise<Record<string, unknown>> {
  const cmd = (env.command || '').trim().toLowerCase();
  if (!cmd) return { ok: false, error: 'missing_command' };

  if (appLockService.isLockConfigured() && !appLockService.isUnlocked()) {
    return { ok: false, error: 'app_locked_unlock_in_web_ui' };
  }

  switch (cmd) {
    case 'status':
      return handleStatus();
    case 'help':
      return helpPayload();
    case 'export':
      return handleExport(env.args);
    case 'review':
      return handleReview();
    case 'report':
      return handleReport(env.args);
    case 'scrape':
      return handleScrape(env.args, env.userId);
    default:
      return { ok: false, error: `unknown_command_${cmd}` };
  }
}

async function onPacket(topic: string, payload: Buffer): Promise<void> {
  const cfg = mqttClientService.getConfig();
  const cmdTop = cfg.commandTopic?.trim();
  if (!cmdTop || topic !== cmdTop) return;

  let env: MqttCommandEnvelope = {};
  try {
    env = JSON.parse(payload.toString('utf-8')) as MqttCommandEnvelope;
  } catch {
    await publishResponse(cfg, { ok: false, error: 'invalid_json', requestId: undefined });
    return;
  }
  const rid = env.requestId;
  const auth = authorizeCommand(cfg, env);
  if (!auth.ok) {
    await publishResponse(cfg, { ok: false, error: auth.error, requestId: rid });
    return;
  }

  try {
    const out = await dispatchCommand(env);
    await publishResponse(cfg, { ...out, requestId: rid });
  } catch (e) {
    logger.error('MQTT command failed', { error: (e as Error).message, stack: (e as Error).stack });
    await publishResponse(cfg, { ok: false, error: (e as Error).message, requestId: rid });
  }
}

export function initMqttCommandService(): void {
  disposeMqttCommandService();
  unregisterHandler = mqttClientService.addPacketHandler((topic, buf) => {
    void onPacket(topic, buf);
  });
  logger.info('MQTT command service listening (handlers registered)');
}

export function disposeMqttCommandService(): void {
  if (unregisterHandler) {
    unregisterHandler();
    unregisterHandler = null;
  }
}
