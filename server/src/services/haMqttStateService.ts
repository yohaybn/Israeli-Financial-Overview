/**
 * Publishes retained JSON state topics for Home Assistant automations.
 */

import {
  resolveStateTopicPrefix,
  transactionNeedsReview,
  type DigestLocale,
  type Transaction,
} from '@app/shared';
import { mqttClientService } from './mqttClientService.js';
import { serviceLogger as logger } from '../utils/logger.js';
import { getActiveScrapeCount } from './scraperService.js';
import { appLockService } from './appLockService.js';
import { StorageService } from './storageService.js';
import { DbService } from './dbService.js';
import { postScrapeService } from './postScrapeService.js';
import { mergeTopInsights } from './insightRulesService.js';
import { getMqttScheduler } from './mqttSchedulerRegistry.js';

export type ScrapeStatePayload = {
  running: boolean;
  lastStatus?: 'success' | 'failure' | 'warning';
  lastRunAt?: string;
  transactionCount?: number;
  profileId?: string;
  profileName?: string;
  error?: string;
  durationMs?: number;
};

let lastScrapeState: ScrapeStatePayload = { running: false };

function stateBase(): string {
  return resolveStateTopicPrefix(mqttClientService.getConfig());
}

function stateTopic(suffix: string): string {
  return `${stateBase()}/${suffix.replace(/^\/+/, '')}`;
}

async function publishState(suffix: string, payload: unknown): Promise<void> {
  const cfg = mqttClientService.getConfig();
  if (!cfg.enabled || !mqttClientService.getStatus().connected) return;
  try {
    await mqttClientService.publishRetainedState(stateTopic(suffix), payload);
  } catch (e) {
    logger.debug('HA MQTT state publish failed', { suffix, error: (e as Error).message });
  }
}

export async function publishAvailability(online: boolean): Promise<void> {
  await publishState('availability', online ? 'online' : 'offline');
}

export async function publishScrapeState(partial: Partial<ScrapeStatePayload>): Promise<void> {
  lastScrapeState = {
    ...lastScrapeState,
    running: getActiveScrapeCount() > 0,
    ...partial,
  };
  await publishState('scrape', lastScrapeState);
}

export async function publishReviewState(): Promise<void> {
  try {
    const cfg = await postScrapeService.getConfig();
    const rem = cfg.transactionReviewReminder;
    const transfersOn = rem?.notifyTransfersCategory !== false;
    const uncategorizedOn = rem?.notifyUncategorized !== false;
    if (rem?.enabled === false || (!transfersOn && !uncategorizedOn)) {
      await publishState('review', { count: 0, updatedAt: new Date().toISOString() });
      return;
    }
    const storage = new StorageService();
    let txns = (await storage.getAllTransactions(true)) as Transaction[];
    txns = txns.filter((t) => t.isInternalTransfer !== true);
    let count = 0;
    for (const t of txns) {
      if (transactionNeedsReview(t, { transfers: transfersOn, uncategorized: uncategorizedOn })) count++;
    }
    await publishState('review', { count, updatedAt: new Date().toISOString() });
  } catch (e) {
    logger.debug('publishReviewState failed', { error: (e as Error).message });
  }
}

export async function publishInsightsTopState(locale: DigestLocale = 'en', limit = 5): Promise<void> {
  try {
    const db = new DbService();
    const storage = new StorageService();
    const txns = await storage.getAllTransactions(true);
    const { refreshInsightRuleFires } = await import('./insightRulesService.js');
    refreshInsightRuleFires(txns, db);
    const merged = mergeTopInsights(db, limit, locale);
    await publishState('insights/top', {
      updatedAt: new Date().toISOString(),
      items: merged.map((m) => ({
        id: m.id,
        text: m.text,
        score: m.score,
        kind: m.source,
        createdAt: m.createdAt,
      })),
    });
  } catch (e) {
    logger.debug('publishInsightsTopState failed', { error: (e as Error).message });
  }
}

export async function publishAlertsState(): Promise<void> {
  try {
    const db = new DbService();
    const alerts = db.listAiMemoryAlerts(500);
    const topScore = alerts.length ? Math.max(...alerts.map((a) => a.score)) : 0;
    await publishState('alerts', {
      count: alerts.length,
      topScore,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    logger.debug('publishAlertsState failed', { error: (e as Error).message });
  }
}

export async function publishAppLockState(): Promise<void> {
  await publishState('app_lock', {
    configured: appLockService.isLockConfigured(),
    unlocked: appLockService.isUnlocked(),
    updatedAt: new Date().toISOString(),
  });
}

export async function publishSchedulerState(): Promise<void> {
  try {
    const scheduler = getMqttScheduler();
    if (!scheduler) {
      await publishState('scheduler', { enabled: false, profileCount: 0, updatedAt: new Date().toISOString() });
      return;
    }
    const cfg = scheduler.getConfig();
    await publishState('scheduler', {
      enabled: cfg.enabled === true,
      profileCount: cfg.selectedProfiles?.length ?? 0,
      lastRun: cfg.lastRun,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    logger.debug('publishSchedulerState failed', { error: (e as Error).message });
  }
}

/** Refresh all retained state snapshots (after MQTT connect). */
export async function refreshAllHaMqttState(): Promise<void> {
  await publishAvailability(true);
  await publishScrapeState({});
  await publishReviewState();
  await publishInsightsTopState();
  await publishAlertsState();
  await publishAppLockState();
  await publishSchedulerState();
}

export function getLastScrapeState(): ScrapeStatePayload {
  return { ...lastScrapeState };
}
