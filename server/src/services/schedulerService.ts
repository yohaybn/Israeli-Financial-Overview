import * as cron from 'node-cron';
import fs from 'fs-extra';
import path from 'path';
import {
    SchedulerConfig,
    DEFAULT_SCHEDULER_CONFIG,
    DEFAULT_BACKUP_SCHEDULE,
    DEFAULT_INSIGHT_RULES_SCHEDULE,
    DEFAULT_FINANCIAL_REPORT_SCHEDULE,
    BackupScheduleConfig,
    Profile,
    ScrapeResult,
    normalizeSchedulerConfig,
    normalizeBackupSchedule,
    normalizeInsightRulesSchedule,
    normalizeFinancialReportSchedule,
    buildSchedulerCronExpression,
    buildCronFromScheduleFields,
    intervalDaysShouldRun,
    localDateISO,
    resolveFinancialReportMonthYm,
} from '@app/shared';
import { serviceLogger as logger } from '../utils/logger.js';
import { ScraperService } from './scraperService.js';
import { ProfileService } from './profileService.js';
import { StorageService } from './storageService.js';
import { BackupService } from './backupService.js';
import { postScrapeService } from './postScrapeService.js';
import { appLockService } from './appLockService.js';
import { PROJECT_ROOT } from '../runtimeEnv.js';
import { generateFinancialPdfBuffer } from './financialPdfReportService.js';
import { ConfigService } from './configService.js';
import { AiService } from './aiService.js';
import { telegramBotService } from './telegramBotService.js';

/** Resolve each use so `process.env.DATA_DIR` updates (Maintenance) are not stuck on the import-time cwd. */
function schedulerDataDir(): string {
    return path.resolve(process.env.DATA_DIR || './data');
}

function schedulerConfigPath(): string {
    return path.join(schedulerDataDir(), 'scheduler_config.json');
}

/** Pre-fix location when DATA_DIR was unset (scheduler used `server/data` while DB used `./data`). */
const LEGACY_SCHEDULER_CONFIG_PATH = path.join(PROJECT_ROOT, 'server', 'data', 'scheduler_config.json');

type SchedulerConfigStored = SchedulerConfig & {
    backupSchedule?: BackupScheduleConfig;
};

export class SchedulerService {
    private config: SchedulerConfigStored;
    private scraperService: ScraperService;
    private profileService: ProfileService;
    private storageService: StorageService;
    private backupService: BackupService;

    private scrapeJob: cron.ScheduledTask | null = null;
    private backupJob: cron.ScheduledTask | null = null;
    private insightRulesJob: cron.ScheduledTask | null = null;
    private financialReportJob: cron.ScheduledTask | null = null;
    private isRunning: boolean = false;
    private backupIsRunning: boolean = false;
    private insightRulesIsRunning: boolean = false;
    private financialReportIsRunning: boolean = false;

    constructor(scraperService: ScraperService, profileService: ProfileService, storageService?: StorageService) {
        this.scraperService = scraperService;
        this.profileService = profileService;
        this.storageService = storageService ?? new StorageService();
        this.backupService = new BackupService();
        this.config = this.loadConfig();
        this.initialize();
    }

    private loadConfig(): SchedulerConfigStored {
        this.migrateLegacySchedulerConfigIfNeeded();
        const cfgPath = schedulerConfigPath();
        try {
            if (fs.existsSync(cfgPath)) {
                const stored = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
                const merged = {
                    ...(DEFAULT_SCHEDULER_CONFIG as SchedulerConfigStored),
                    ...stored,
                    backupSchedule: normalizeBackupSchedule({
                        ...DEFAULT_BACKUP_SCHEDULE,
                        ...stored.backupSchedule
                    }),
                    insightRulesSchedule: normalizeInsightRulesSchedule({
                        ...DEFAULT_INSIGHT_RULES_SCHEDULE,
                        ...stored.insightRulesSchedule
                    }),
                    financialReportSchedule: normalizeFinancialReportSchedule({
                        ...DEFAULT_FINANCIAL_REPORT_SCHEDULE,
                        ...stored.financialReportSchedule
                    })
                };
                delete (merged as { runInsightRules?: boolean }).runInsightRules;
                return normalizeSchedulerConfig(merged) as SchedulerConfigStored;
            }
        } catch (error) {
            logger.error('Failed to load scheduler config, using defaults', { error });
        }
        return normalizeSchedulerConfig({
            ...(DEFAULT_SCHEDULER_CONFIG as SchedulerConfigStored),
            backupSchedule: normalizeBackupSchedule({ ...DEFAULT_BACKUP_SCHEDULE }),
            insightRulesSchedule: normalizeInsightRulesSchedule({ ...DEFAULT_INSIGHT_RULES_SCHEDULE }),
            financialReportSchedule: normalizeFinancialReportSchedule({ ...DEFAULT_FINANCIAL_REPORT_SCHEDULE })
        }) as SchedulerConfigStored;
    }

    /** Copy from old `server/data` path so settings survive after fixing DATA_DIR resolution. */
    private migrateLegacySchedulerConfigIfNeeded(): void {
        const cfgPath = schedulerConfigPath();
        const dataDir = schedulerDataDir();
        if (fs.existsSync(cfgPath) || !fs.existsSync(LEGACY_SCHEDULER_CONFIG_PATH)) {
            return;
        }
        try {
            fs.ensureDirSync(dataDir);
            fs.copyFileSync(LEGACY_SCHEDULER_CONFIG_PATH, cfgPath);
            logger.info('Migrated scheduler_config.json from legacy server/data to DATA_DIR', {
                DATA_DIR: dataDir,
                from: LEGACY_SCHEDULER_CONFIG_PATH
            });
        } catch (error) {
            logger.warn('Could not migrate legacy scheduler_config.json', { error });
        }
    }

    private saveConfig() {
        try {
            const dataDir = schedulerDataDir();
            const cfgPath = schedulerConfigPath();
            fs.ensureDirSync(dataDir);
            fs.writeFileSync(cfgPath, JSON.stringify(this.config, null, 2));
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
        if (this.config.insightRulesSchedule?.enabled) {
            this.startInsightRulesJob();
        }
        if (this.config.financialReportSchedule?.enabled) {
            this.startFinancialReportJob();
        }
    }

    public getConfig(): SchedulerConfig {
        return {
            ...normalizeSchedulerConfig(this.config),
            insightRulesSchedule: normalizeInsightRulesSchedule(
                this.config.insightRulesSchedule ?? DEFAULT_INSIGHT_RULES_SCHEDULE
            ),
            backupSchedule: normalizeBackupSchedule(this.config.backupSchedule ?? DEFAULT_BACKUP_SCHEDULE),
            financialReportSchedule: normalizeFinancialReportSchedule(
                this.config.financialReportSchedule ?? DEFAULT_FINANCIAL_REPORT_SCHEDULE
            )
        };
    }

    /** After maintenance factory reset: scheduler config file may be gone; re-read from disk and restart cron jobs. */
    reloadAfterDataWipe(): void {
        this.stopScrapeJob();
        this.stopBackupJob();
        this.stopInsightRulesJob();
        this.stopFinancialReportJob();
        this.config = this.loadConfig();
        this.initialize();
    }

    public updateConfig(newConfig: Partial<SchedulerConfigStored>) {
        const mergedBackup = normalizeBackupSchedule({
            ...DEFAULT_BACKUP_SCHEDULE,
            ...this.config.backupSchedule,
            ...(newConfig.backupSchedule ?? {})
        });

        const mergedInsight = normalizeInsightRulesSchedule({
            ...DEFAULT_INSIGHT_RULES_SCHEDULE,
            ...this.config.insightRulesSchedule,
            ...(newConfig.insightRulesSchedule ?? {})
        });

        const mergedFinancial = normalizeFinancialReportSchedule({
            ...DEFAULT_FINANCIAL_REPORT_SCHEDULE,
            ...this.config.financialReportSchedule,
            ...(newConfig.financialReportSchedule ?? {})
        });

        this.config = normalizeSchedulerConfig({
            ...this.config,
            ...newConfig,
            backupSchedule: mergedBackup,
            insightRulesSchedule: mergedInsight,
            financialReportSchedule: mergedFinancial
        }) as SchedulerConfigStored;
        delete (this.config as { runInsightRules?: boolean }).runInsightRules;
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

        if (this.config.insightRulesSchedule?.enabled) {
            this.startInsightRulesJob();
        } else {
            this.stopInsightRulesJob();
        }

        if (this.config.financialReportSchedule?.enabled) {
            this.startFinancialReportJob();
        } else {
            this.stopFinancialReportJob();
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

    private startInsightRulesJob() {
        this.stopInsightRulesJob();

        const s = normalizeInsightRulesSchedule(this.config.insightRulesSchedule ?? DEFAULT_INSIGHT_RULES_SCHEDULE);
        if (!s.enabled) {
            return;
        }

        const expr = buildCronFromScheduleFields(s);
        if (!cron.validate(expr)) {
            logger.error('Invalid insight rules cron expression', { expression: expr });
            return;
        }

        logger.info(`Starting insight rules scheduler with cron: ${expr}`, { scheduleType: s.scheduleType });
        this.insightRulesJob = cron.schedule(expr, () => {
            const current = normalizeInsightRulesSchedule(
                this.config.insightRulesSchedule ?? DEFAULT_INSIGHT_RULES_SCHEDULE
            );
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
            void this.runScheduledInsightRulesRefresh();
        });
    }

    private stopInsightRulesJob() {
        if (this.insightRulesJob) {
            this.insightRulesJob.stop();
            this.insightRulesJob = null;
            logger.info('Insight rules scheduler stopped');
        }
    }

    /**
     * Timer-only refresh: re-evaluate insight rules against all transactions in the DB (no scrape).
     */
    public async runScheduledInsightRulesRefresh() {
        if (this.insightRulesIsRunning) {
            logger.warn('Scheduled insight rules refresh skipped - previous run still in progress');
            return;
        }

        const s = normalizeInsightRulesSchedule(this.config.insightRulesSchedule ?? DEFAULT_INSIGHT_RULES_SCHEDULE);
        if (!s.enabled) {
            return;
        }

        this.insightRulesIsRunning = true;
        logger.info('Starting scheduled insight rules refresh...');

        try {
            const { matched, cleared } = await this.storageService.refreshInsightRuleFiresFromDb();
            this.config.insightRulesSchedule = {
                ...s,
                lastRun: new Date().toISOString()
            };
            this.saveConfig();
            logger.info('Scheduled insight rules refresh completed', { matched, cleared });
        } catch (err) {
            logger.error('Scheduled insight rules refresh failed', { error: err });
        } finally {
            this.insightRulesIsRunning = false;
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
            const batchSavedFilenames: string[] = [];
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
                            const { newTransactionIds, filename } = await this.storageService.saveScrapeResult(
                                result,
                                profile.companyId,
                                profile.name || profile.id
                            );
                            if (filename) batchSavedFilenames.push(filename);
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
                    batchRequest.options.batchSavedFilenames = batchSavedFilenames;
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

    private startFinancialReportJob() {
        this.stopFinancialReportJob();

        const s = normalizeFinancialReportSchedule(
            this.config.financialReportSchedule ?? DEFAULT_FINANCIAL_REPORT_SCHEDULE
        );
        if (!s.enabled) {
            return;
        }

        const expr = buildCronFromScheduleFields(s);
        if (!cron.validate(expr)) {
            logger.error('Invalid financial report cron expression', { expression: expr });
            return;
        }

        logger.info(`Starting financial PDF scheduler with cron: ${expr}`, { scheduleType: s.scheduleType });
        this.financialReportJob = cron.schedule(expr, () => {
            const current = normalizeFinancialReportSchedule(
                this.config.financialReportSchedule ?? DEFAULT_FINANCIAL_REPORT_SCHEDULE
            );
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
            void this.runScheduledFinancialPdfReport();
        });
    }

    private stopFinancialReportJob() {
        if (this.financialReportJob) {
            this.financialReportJob.stop();
            this.financialReportJob = null;
            logger.info('Financial PDF scheduler stopped');
        }
    }

    private async runScheduledFinancialPdfReport() {
        if (this.financialReportIsRunning) {
            logger.warn('Scheduled financial PDF skipped — previous run still in progress');
            return;
        }

        const s = normalizeFinancialReportSchedule(
            this.config.financialReportSchedule ?? DEFAULT_FINANCIAL_REPORT_SCHEDULE
        );
        if (!s.enabled) {
            return;
        }

        this.financialReportIsRunning = true;
        const monthYm = resolveFinancialReportMonthYm(s.scheduledMonthRule);
        logger.info('Scheduled financial PDF starting', { monthYm });

        try {
            const storageService = new StorageService();
            const configService = new ConfigService();
            const aiService = new AiService();
            const pdf = await generateFinancialPdfBuffer(storageService, configService, aiService, {
                monthYm,
                localeMode: s.localeMode,
                sections: s.sections,
            });
            if (s.sendTelegram) {
                telegramBotService.syncNotificationNotifierChatIds();
                await telegramBotService.sendFinancialPdfToChats(pdf, `financial-report-${monthYm}.pdf`, monthYm);
            }
            this.config.financialReportSchedule = {
                ...s,
                lastRun: new Date().toISOString(),
            };
            this.saveConfig();
            logger.info('Scheduled financial PDF completed', { monthYm });
        } catch (err) {
            logger.error('Scheduled financial PDF failed', { error: err });
        } finally {
            this.financialReportIsRunning = false;
        }
    }
}
