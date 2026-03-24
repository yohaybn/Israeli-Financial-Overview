import fs from 'fs-extra';
import path from 'path';
import { DbService } from './dbService.js';
import { serverLogger } from '../utils/logger.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const SETTINGS_FILE = path.join(DATA_DIR, 'config', 'ai_settings.json');

/**
 * Deletes insights/alerts older than configured retention (from ai_settings.json).
 * Safe to call on startup, after settings save, or on a timer.
 */
export async function runAiMemoryRetentionPrune(): Promise<{
    insightsRemoved: number;
    alertsRemoved: number;
}> {
    if (!(await fs.pathExists(SETTINGS_FILE))) {
        return { insightsRemoved: 0, alertsRemoved: 0 };
    }
    let fileSettings: { memoryInsightRetentionDays?: unknown; memoryAlertRetentionDays?: unknown };
    try {
        fileSettings = await fs.readJson(SETTINGS_FILE);
    } catch {
        return { insightsRemoved: 0, alertsRemoved: 0 };
    }
    const id = Math.max(0, Math.floor(Number(fileSettings.memoryInsightRetentionDays) || 0));
    const ad = Math.max(0, Math.floor(Number(fileSettings.memoryAlertRetentionDays) || 0));
    if (id < 1 && ad < 1) {
        return { insightsRemoved: 0, alertsRemoved: 0 };
    }
    const db = new DbService();
    let insightsRemoved = 0;
    let alertsRemoved = 0;
    if (id >= 1) insightsRemoved = db.deleteAiMemoryInsightsOlderThan(id);
    if (ad >= 1) alertsRemoved = db.deleteAiMemoryAlertsOlderThan(ad);
    if (insightsRemoved > 0 || alertsRemoved > 0) {
        serverLogger.info('AI memory retention prune', { insightsRemoved, alertsRemoved, insightDays: id, alertDays: ad });
    }
    return { insightsRemoved, alertsRemoved };
}
