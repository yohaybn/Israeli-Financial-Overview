import * as cron from 'node-cron';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    SchedulerConfig,
    DEFAULT_SCHEDULER_CONFIG,
    DEFAULT_BACKUP_SCHEDULE,
    BackupScheduleConfig,
    Profile,
    ScrapeResult,
    normalizeSchedulerConfig,
    normalizeBackupSchedule,
    buildSchedulerCronExpression,
    buildCronFromScheduleFields,
    intervalDaysShouldRun,
    localDateISO
} from '@app/shared';
import { serviceLogger as logger } from '../utils/logger.js';
import { ScraperService } from './scraperService.js';
import { ProfileService } from './profileService.js';
import { StorageService } from './storageService.js';
import { BackupService } from './backupService.js';
import { postScrapeService } from './postScrapeService.js';
import { appLockService } from './appLockService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const SCHEDULER_CONFIG_PATH = path.join(DATA_DIR, 'scheduler_config.json');

type SchedulerConfigWithBackup = SchedulerConfig & {
    backupSchedule?: BackupScheduleConfig;
};

export class SchedulerService {
    private config: SchedulerConfigWithBackup;
    private scraperService: ScraperService;
    private profileService: ProfileService;
    private storageService: StorageService;
    private backupService: BackupService;

    private scrapeJob: cron.ScheduledTask | null = null;
    private backupJob: cron.ScheduledTask | null = null;
    private isRunning: boolean = false;
    private backupIsRunning: boolean = false;

    constructor(scraperService: ScraperService, profileService: ProfileService, storageService?: StorageService) {
        this.scraperService = scraperService;
        this.profileService = profileService;
        this.storageService = storageService ?? new StorageService();
        this.backupService = new BackupService();
        this.config = this.loadConfig();
        this.initialize();
    }

    private loadConfig(): SchedulerConfigWithBackup {
        try {
            if (fs.existsSync(SCHEDULER_CONFIG_PATH)) {
                const stored = JSON.parse(fs.readFileSync(SCHEDULER_CONFIG_PATH, 'utf-8'));
                const merged = {
                    ...(DEFAULT_SCHEDULER_CONFIG as SchedulerConfigWithBackup),
                    ...stored,
                    backupSchedule: normalizeBackupSchedule({
                        ...DEFAULT_BACKUP_SCHEDULE,
                        ...stored.backupSchedule
                    })
                };
                return normalizeSchedulerConfig(merged) as SchedulerConfigWithBackup;
            }
        } catch (error) {
            logger.error('Failed to load scheduler config, using defaults', { error });
        }
        return normalizeSchedulerConfig({
            ...(DEFAULT_SCHEDULER_CONFIG as SchedulerConfigWithBackup),
            backupSchedule: normalizeBackupSchedule({ ...DEFAULT_BACKUP_SCHEDULE })
        }) as SchedulerConfigWithBackup;
    }

    private saveConfig() {
        try {
            fs.writeFileSync(SCHEDULER_CONFIG_PATH, JSON.stringify(this.config, null, 2));
        } catch (error) {
            logger.error('Failed to save scheduler config', { error });
        }
    }

    private initialize() {
        if (this.config.enabled) {
            this.startScrapeJob();
        }
        if (this.config.backupSchedule?.enabled) {
            this.startBackupJob();
        }
    }

    public getConfig(): SchedulerConfig {
        return {
            ...normalizeSchedulerConfig(this.config),
            backupSchedule: normalizeBackupSchedule(this.config.backupSchedule ?? DEFAULT_BACKUP_SCHEDULE)
        };
    }

    public updateConfig(newConfig: Partial<SchedulerConfigWithBackup>) {
        const mergedBackup = normalizeBackupSchedule({
            ...DEFAULT_BACKUP_SCHEDULE,
            ...this.config.backupSchedule,
            ...(newConfig.backupSchedule ?? {})
        });

        this.config = normalizeSchedulerConfig({
            ...this.config,
            ...newConfig,
            backupSchedule: mergedBackup
        }) as SchedulerConfigWithBackup;
        this.saveConfig();

        if (this.config.enabled) {
            this.startScrapeJob();
        } else {
            this.stopScrapeJob();
        }

        if (this.config.backupSchedule?.enabled) {
            this.startBackupJob();
        } else {
            this.stopBackupJob();
        }
    }

    public startScrapeJob() {
        this.stopScrapeJob();

        const cfg = normalizeSchedulerConfig(this.config);
        const expr = buildSchedulerCronExpression(cfg);
        if (!cron.validate(expr)) {
            logger.error('Invalid cron expression', { expression: expr });
            return;
        }

        logger.info(`Starting scrape scheduler with cron: ${expr}`, { scheduleType: cfg.scheduleType });
        this.scrapeJob = cron.schedule(expr, () => {
            const current = normalizeSchedulerConfig(this.config);
            if (current.scheduleType === 'interval_days') {
                const anchor = current.intervalAnchorDate || localDateISO();
                const n = current.intervalDays ?? 3;
                if (!intervalDaysShouldRun(anchor, n, new Date())) {
                    return;
                }
            }
            this.runScheduledScrape();
        });
    }

    public stopScrapeJob() {
        if (this.scrapeJob) {
            this.scrapeJob.stop();
            this.scrapeJob = null;
            logger.info('Scrape scheduler stopped');
        }
    }

    private startBackupJob() {
        this.stopBackupJob();

        const b = normalizeBackupSchedule(this.config.backupSchedule ?? DEFAULT_BACKUP_SCHEDULE);
        if (!b.enabled) {
            return;
        }

        const expr = buildCronFromScheduleFields(b);
        if (!cron.validate(expr)) {
            logger.error('Invalid backup cron expression', { expression: expr });
            return;
        }

        logger.info(`Starting backup scheduler with cron: ${expr}`, { scheduleType: b.scheduleType });
        this.backupJob = cron.schedule(expr, () => {
            const current = normalizeBackupSchedule(this.config.backupSchedule ?? DEFAULT_BACKUP_SCHEDULE);
            if (!current.enabled) {
                return;
            }
            if (current.scheduleType === 'interval_days') {
                const anchor = current.intervalAnchorDate || localDateISO();
                const n = current.intervalDays ?? 3;
                if (!intervalDaysShouldRun(anchor, n, new Date())) {
                    return;
                }
            }
            this.runScheduledBackup();
        });
    }

    private stopBackupJob() {
        if (this.backupJob) {
            this.backupJob.stop();
            this.backupJob = null;
            logger.info('Backup scheduler stopped');
        }
    }

    public async runScheduledBackup() {
        if (this.backupIsRunning) {
            logger.warn('Scheduled backup skipped - previous backup still running');
            return;
        }

        const b = normalizeBackupSchedule(this.config.backupSchedule ?? DEFAULT_BACKUP_SCHEDULE);
        if (!b.enabled) {
            return;
        }

        this.backupIsRunning = true;
        logger.info('Starting scheduled backup job...');

        try {
            const destination = b.destination || 'local';
            const localBackup = await this.backupService.createLocalBackup();
            logger.info(`Scheduled backup created locally: ${localBackup.filename}`);

            if (destination === 'google-drive') {
                const driveFile = await this.backupService.uploadLatestSnapshotToGoogleDrive(localBackup.path);
                logger.info(`Scheduled backup uploaded to Google Drive: ${driveFile.id || driveFile.name}`);
            }

            this.config.backupSchedule = {
                ...b,
                lastRun: new Date().toISOString()
            };
            this.saveConfig();
            logger.info('Scheduled backup job completed successfully');
        } catch (backupError) {
            logger.error('Scheduled backup failed', { error: backupError });
        } finally {
            this.backupIsRunning = false;
        }
    }

    public async runScheduledScrape() {
        if (this.isRunning) {
            logger.warn('Scheduled scrape skipped - previous job still running');
            return;
        }

        if (!appLockService.isUnlocked()) {
            logger.warn('Scheduled scrape skipped — application is locked (unlock in the web UI)');
            return;
        }

        this.isRunning = true;
        this.config.lastRun = new Date().toISOString();
        this.saveConfig();

        logger.info('Starting scheduled scrape job...');

        try {
            const profiles = await this.profileService.getProfiles();
            const profilesToRun = profiles.filter((p: Profile) => this.config.selectedProfiles.includes(p.id));

            if (profilesToRun.length === 0) {
                logger.warn('No profiles selected for scheduled scrape');
                this.isRunning = false;
                return;
            }

            const batchResults: ScrapeResult[] = [];
            const allNewTransactionIds: string[] = [];
            const batchRequest = {
                companyId: 'scheduler',
                credentials: {} as Record<string, string>,
                profileName: 'Scheduled run',
                options: {
                    headless: true,
                    runSource: 'scheduler' as const,
                    initiatedBy: 'scheduler',
                    deferPostScrape: true
                } as any
            };

            for (const profile of profilesToRun) {
                logger.info(`Running scheduled scrape for profile: ${profile.name} (${profile.companyId})`);

                const scrapeRequest = {
                    companyId: profile.companyId,
                    credentials: {} as Record<string, string>,
                    profileId: profile.id,
                    profileName: profile.name,
                    options: {
                        ...profile.options,
                        headless: true,
                        runSource: 'scheduler',
                        initiatedBy: 'scheduler',
                        deferPostScrape: true
                    } as any
                };

                try {
                    const result = await this.scraperService.runScrape(scrapeRequest);
                    batchResults.push(result);
                    if (result.success && result.transactions && result.transactions.length > 0) {
                        try {
                            const { newTransactionIds } = await this.storageService.saveScrapeResult(
                                result,
                                profile.name || profile.companyId
                            );
                            allNewTransactionIds.push(...newTransactionIds);
                        } catch (saveErr) {
                            logger.warn(`Failed to save scrape result for ${profile.name}`, { error: saveErr });
                        }
                    }
                    logger.info(`Scheduled scrape completed for profile: ${profile.name}`);
                } catch (error) {
                    logger.error(`Scheduled scrape failed for profile: ${profile.name}`, { error });
                    batchResults.push({ success: false, error: (error as Error)?.message, logs: [], executionTimeMs: 0 });
                }
            }

            if (batchResults.some((r) => r.success)) {
                try {
                    batchRequest.options.postScrape = {
                        ...(batchRequest.options.postScrape || {}),
                        newTransactionIds: allNewTransactionIds,
                    };
                    await postScrapeService.handleBatchResults(batchResults, batchRequest);
                } catch (postErr) {
                    logger.warn('Post-scrape batch failed after scheduled run', { error: postErr });
                }
            }

            logger.info('Scheduled scrape job completed successfully');
        } catch (error) {
            logger.error('Scheduled scrape job failed', { error });
        } finally {
            this.isRunning = false;
        }
    }
}
