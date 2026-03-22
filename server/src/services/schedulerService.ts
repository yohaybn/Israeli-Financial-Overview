import * as cron from 'node-cron';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { SchedulerConfig, DEFAULT_SCHEDULER_CONFIG, Profile, ScrapeResult } from '@app/shared';
import { serviceLogger as logger } from '../utils/logger.js';
import { ScraperService } from './scraperService.js';
import { ProfileService } from './profileService.js';
import { StorageService } from './storageService.js';
import { BackupService } from './backupService.js';
import { postScrapeService } from './postScrapeService.js';
// PipelineController removed - scheduler will run scrapes and rely on post-scrape actions

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const SCHEDULER_CONFIG_PATH = path.join(DATA_DIR, 'scheduler_config.json');

type SchedulerBackupConfig = {
    enabled: boolean;
    destination: 'local' | 'google-drive';
};

type SchedulerConfigWithBackup = SchedulerConfig & {
    backupSchedule?: SchedulerBackupConfig;
};

export class SchedulerService {
    private config: SchedulerConfigWithBackup;
    private scraperService: ScraperService;
    private profileService: ProfileService;
    private storageService: StorageService;
    private backupService: BackupService;

    private currentJob: cron.ScheduledTask | null = null;
    private isRunning: boolean = false;

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
                return {
                    ...(DEFAULT_SCHEDULER_CONFIG as SchedulerConfigWithBackup),
                    ...stored,
                    backupSchedule: {
                        ...(DEFAULT_SCHEDULER_CONFIG as SchedulerConfigWithBackup).backupSchedule,
                        ...stored.backupSchedule
                    }
                };
            }
        } catch (error) {
            logger.error('Failed to load scheduler config, using defaults', { error });
        }
        return { ...(DEFAULT_SCHEDULER_CONFIG as SchedulerConfigWithBackup) };
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
            this.startJob();
        }
    }

    public getConfig(): SchedulerConfig {
        return { ...this.config };
    }

    public updateConfig(newConfig: Partial<SchedulerConfigWithBackup>) {
        this.config = {
            ...this.config,
            ...newConfig,
            backupSchedule: {
                enabled: newConfig.backupSchedule?.enabled ?? this.config.backupSchedule?.enabled ?? false,
                destination: newConfig.backupSchedule?.destination ?? this.config.backupSchedule?.destination ?? 'local'
            }
        };
        this.saveConfig();

        // Restart job if enabled or schedule changed
        if (this.config.enabled) {
            this.startJob();
        } else {
            this.stopJob();
        }
    }

    public startJob() {
        this.stopJob(); // Ensure no duplicate jobs

        if (!cron.validate(this.config.cronExpression)) {
            logger.error('Invalid cron expression', { expression: this.config.cronExpression });
            return;
        }

        logger.info(`Starting scheduler with cron: ${this.config.cronExpression}`);
        this.currentJob = cron.schedule(this.config.cronExpression, () => {
            this.runScheduledScrape();
        });

        // Calculate next run
        // Note: node-cron doesn't expose nextDate cleanly on the task object in all versions, 
        // but we can infer it or just update it on execution.
    }

    public stopJob() {
        if (this.currentJob) {
            this.currentJob.stop();
            this.currentJob = null;
            logger.info('Scheduler stopped');
        }
    }

    public async runScheduledScrape() {
        if (this.isRunning) {
            logger.warn('Scheduled scrape skipped - previous job still running');
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

            // Run all scrapes with post-scrape deferred, then run post-scrape once with combined results
            const batchResults: ScrapeResult[] = [];
            const batchRequest = {
                companyId: 'scheduler',
                credentials: {} as Record<string, string>,
                profileName: 'Scheduled run',
                options: {
                    headless: true,
                    runSource: 'scheduler' as const,
                    initiatedBy: 'scheduler',
                    deferPostScrape: true,
                },
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
                        deferPostScrape: true,
                    } as any,
                };

                try {
                    const result = await this.scraperService.runScrape(scrapeRequest);
                    batchResults.push(result);
                    if (result.success && result.transactions && result.transactions.length > 0) {
                        try {
                            await this.storageService.saveScrapeResult(result, profile.name || profile.companyId);
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
                    await postScrapeService.handleBatchResults(batchResults, batchRequest);
                } catch (postErr) {
                    logger.warn('Post-scrape batch failed after scheduled run', { error: postErr });
                }
            }

            if (this.config.backupSchedule?.enabled) {
                try {
                    const destination = this.config.backupSchedule.destination || 'local';
                    const localBackup = await this.backupService.createLocalBackup();
                    logger.info(`Scheduled backup created locally: ${localBackup.filename}`);

                    if (destination === 'google-drive') {
                        const driveFile = await this.backupService.uploadLatestSnapshotToGoogleDrive(localBackup.path);
                        logger.info(`Scheduled backup uploaded to Google Drive: ${driveFile.id || driveFile.name}`);
                    }
                } catch (backupError) {
                    logger.error('Scheduled backup failed', { error: backupError });
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
