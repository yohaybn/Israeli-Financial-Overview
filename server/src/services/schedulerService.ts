import * as cron from 'node-cron';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { SchedulerConfig, DEFAULT_SCHEDULER_CONFIG, Profile } from '@app/shared';
import { serviceLogger as logger } from '../utils/logger.js';
import { ScraperService } from './scraperService.js';
import { ProfileService } from './profileService.js';
// PipelineController removed - scheduler will run scrapes and rely on post-scrape actions

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const SCHEDULER_CONFIG_PATH = path.join(DATA_DIR, 'scheduler_config.json');

export class SchedulerService {
    private config: SchedulerConfig;
    private scraperService: ScraperService;
    private profileService: ProfileService;
    
    private currentJob: cron.ScheduledTask | null = null;
    private isRunning: boolean = false;

    constructor(scraperService: ScraperService, profileService: ProfileService) {
        this.scraperService = scraperService;
        this.profileService = profileService;
        this.config = this.loadConfig();
        this.initialize();
    }

    private loadConfig(): SchedulerConfig {
        try {
            if (fs.existsSync(SCHEDULER_CONFIG_PATH)) {
                return JSON.parse(fs.readFileSync(SCHEDULER_CONFIG_PATH, 'utf-8'));
            }
        } catch (error) {
            logger.error('Failed to load scheduler config, using defaults', { error });
        }
        return { ...DEFAULT_SCHEDULER_CONFIG };
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

    public updateConfig(newConfig: Partial<SchedulerConfig>) {
        this.config = { ...this.config, ...newConfig };
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

            // Run sequentially
            for (const profile of profilesToRun) {
                logger.info(`Running scheduled scrape for profile: ${profile.name} (${profile.companyId})`);

                const scrapeRequest = {
                    companyId: profile.companyId,
                    credentials: {}, // ScraperService will fetch them from profile storage using profileId
                    profileId: profile.id,
                    profileName: profile.name,
                    options: {
                        ...profile.options,
                        headless: true,
                    } as any
                };

                // Run direct scrape; post-scrape actions are handled by ScraperService/postScrapeService
                try {
                    await this.scraperService.runScrape(scrapeRequest);
                    logger.info(`Scheduled scrape completed for profile: ${profile.name}`);
                } catch (error) {
                    logger.error(`Scheduled scrape failed for profile: ${profile.name}`, { error });
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
