import * as cron from 'node-cron';
import { DbService } from './dbService.js';
import { DEFAULT_INVESTMENT_USER_ID } from '../constants/investments.js';
import { isInvestmentsFeatureEnabled } from '../constants/marketData.js';
import { recordPortfolioSnapshotNow } from './investmentPortfolioService.js';
import { serviceLogger as logger } from '../utils/logger.js';

let snapshotTask: ReturnType<typeof cron.schedule> | null = null;

function parseHHMM(s: string): { h: number; m: number } | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { h, m: min };
}

/** Minute hour day-of-month month day-of-week (node-cron 5-field). */
function cronFromRunTime(runTime: string): string | null {
    const p = parseHHMM(runTime);
    if (!p) return null;
    return `${p.m} ${p.h} * * *`;
}

export function reloadPortfolioSnapshotSchedule(): void {
    stopPortfolioSnapshotSchedule();
    if (!isInvestmentsFeatureEnabled()) {
        logger.info('Portfolio snapshot scheduler not started (investments feature disabled)');
        return;
    }
    const db = new DbService();
    const st = db.getPortfolioSnapshotSettings(DEFAULT_INVESTMENT_USER_ID);
    if (!st.enabled) {
        logger.info('Portfolio snapshot schedule is disabled');
        return;
    }
    const expr = cronFromRunTime(st.runTime);
    if (!expr || !cron.validate(expr)) {
        logger.error('Invalid portfolio snapshot run_time; scheduler not started', { runTime: st.runTime });
        return;
    }
    snapshotTask = cron.schedule(
        expr,
        () => {
            void runSnapshotJob();
        },
        { timezone: st.timezone }
    );
    logger.info('Portfolio snapshot scheduler started', { cron: expr, timezone: st.timezone });
}

export function stopPortfolioSnapshotSchedule(): void {
    if (snapshotTask) {
        snapshotTask.stop();
        snapshotTask = null;
        logger.info('Portfolio snapshot scheduler stopped');
    }
}

function isoDateInTimeZone(d: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

async function runSnapshotJob(): Promise<void> {
    try {
        if (!isInvestmentsFeatureEnabled()) return;
        const db = new DbService();
        const st = db.getPortfolioSnapshotSettings(DEFAULT_INVESTMENT_USER_ID);
        if (!st.enabled) return;
        const snapshotDate = isoDateInTimeZone(new Date(), st.timezone);
        const result = await recordPortfolioSnapshotNow(db, DEFAULT_INVESTMENT_USER_ID, snapshotDate);
        if (!result.ok) {
            logger.warn('Scheduled portfolio snapshot skipped', { reason: result.reason, snapshotDate });
        } else {
            logger.info('Scheduled portfolio snapshot saved', { snapshotDate });
        }
    } catch (e) {
        logger.warn('Scheduled portfolio snapshot failed', {
            message: e instanceof Error ? e.message : String(e),
        });
    }
}
