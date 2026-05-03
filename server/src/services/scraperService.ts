import { createScraper, CompanyTypes } from 'israeli-bank-scrapers';
import {
    ScrapeResult,
    ScrapeRequest,
    countTransactionsForExclusionPattern,
    isAccountNumberExcluded,
    mergeExcludedAccountNumberLists,
    stripNestedTxnsFromScrapeAccounts,
} from '@app/shared';
import { Server } from 'socket.io';
import { postScrapeService } from './postScrapeService.js';
import type { ScrapeRunActionRecord } from '../utils/scrapeRunLogger.js';
import {
    generateScrapeRunLogId,
    writeScrapeRunLog,
} from '../utils/scrapeRunLogger.js';
import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import { StorageService } from './storageService.js';
import { DbService } from './dbService.js';
import { profileService } from './profileService.js';
import { appLockService } from './appLockService.js';
import { serverLogger } from '../utils/logger.js';
import {
    getBoundSessionIdForProfile,
    getOneZeroOtpSession,
    registerOneZeroOtpSession,
    removeOneZeroOtpSession,
    resolveOneZeroOtpSessionId,
} from './oneZeroOtpSessionStore.js';

// Progress event types matching the library
export enum ScraperProgressTypes {
    Initializing = 'INITIALIZING',
    StartScraping = 'START_SCRAPING',
    LoggingIn = 'LOGGING_IN',
    LoginSuccess = 'LOGIN_SUCCESS',
    LoginFailed = 'LOGIN_FAILED',
    ChangePassword = 'CHANGE_PASSWORD',
    EndScraping = 'END_SCRAPING',
    Terminating = 'TERMINATING',
}

export interface ScrapeProgress {
    type: ScraperProgressTypes | string;
    message: string;
    timestamp: string;
}

let activeScrapeCount = 0;

/** When smart start is on, never scrape fewer than this many days of history (vs day-after-last-txn). */
const SMART_START_MIN_LOOKBACK_DAYS = 7;

export function getActiveScrapeCount(): number {
    return activeScrapeCount;
}

function scrapeRunSourceForLog(request: ScrapeRequest): 'telegram_bot' | 'scheduler' | 'manual' {
    const r = (request as any)?.options?.runSource;
    if (r === 'telegram_bot' || r === 'scheduler' || r === 'manual') return r;
    return 'manual';
}

export class ScraperService {
    private io: Server | null = null;
    private storageService: StorageService;
    private dbService: DbService;
    private profileService = profileService;

    constructor() {
        this.storageService = new StorageService();
        this.dbService = new DbService();
    }

    setSocketIO(io: Server) {
        this.io = io;
    }

    private emitProgress(type: string, message: string) {
        const progress: ScrapeProgress = {
            type,
            message,
            timestamp: new Date().toISOString(),
        };
        if (this.io) {
            this.io.emit('scrape:progress', progress);
        }
    }

    private emitLog(message: string) {
        if (this.io) {
            this.io.emit('scrape:log', {
                message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    private getExecutablePath(): string | undefined {
        const standardPaths = [
            puppeteer.executablePath(),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ];

        for (const p of standardPaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return undefined;
    }

    async runScrape(request: ScrapeRequest): Promise<ScrapeResult> {
        const logs: string[] = [];
        const startTime = Date.now();
        const postCfg = await postScrapeService.getConfig();
        const optAgg = (request.options as any)?.aggregateTelegramNotifications;
        const aggregateTelegramNotifications =
            optAgg !== undefined && optAgg !== null
                ? Boolean(optAgg)
                : (postCfg.aggregateTelegramNotifications !== false);
        if (request.options) {
            (request.options as any).aggregateTelegramNotifications = aggregateTelegramNotifications;
        }
        const optAggMq = (request.options as any)?.aggregateMqttNotifications;
        const aggregateMqttNotifications =
            optAggMq !== undefined && optAggMq !== null
                ? Boolean(optAggMq)
                : (postCfg.aggregateMqttNotifications !== false);
        if (request.options) {
            (request.options as any).aggregateMqttNotifications = aggregateMqttNotifications;
        }
        const useAggregatePath = aggregateTelegramNotifications || aggregateMqttNotifications;
        const deferPostScrape = Boolean((request.options as any)?.deferPostScrape);

        const addLog = (msg: string) => {
            const logEntry = `[${new Date().toISOString()}] ${msg}`;
            logs.push(logEntry);
            this.emitLog(logEntry);
        };

        if (!appLockService.isUnlocked()) {
            addLog('Scrape blocked: application is locked. Unlock in the web UI first.');
            this.emitProgress(ScraperProgressTypes.Terminating, 'Application is locked');
            const executionTimeMs = Date.now() - startTime;
            if (this.io) {
                this.io.emit('scrape:complete', {
                    success: false,
                    error: 'APP_LOCKED',
                    executionTimeMs
                });
            }
            return {
                success: false as const,
                error: 'Application is locked. Unlock in the web UI to run scrapes.',
                logs,
                executionTimeMs
            };
        }

        // If profileId is provided, fetch credentials from profile storage
        let credentials = request.credentials;
        if (request.profileId) {
            try {
                const profile = await this.profileService.getProfile(request.profileId);
                if (profile) {
                    addLog(`Using saved credentials from profile: ${profile.name}`);
                    credentials = profile.credentials;
                } else {
                    addLog(`Warning: Profile ID ${request.profileId} not found. Falling back to provided credentials.`);
                }
            } catch (err) {
                addLog(`Warning: Failed to load profile: ${(err as Error).message}. Falling back to provided credentials.`);
            }
        }

        const executablePath = this.getExecutablePath();
        if (!executablePath) {
            addLog('WARNING: No browser executable found. The scrape might fail if the library defaults cannot find one.');
        } else {
            addLog(`Using browser at: ${executablePath}`);
        }

        // Ensure required Docker/Linux arguments for Puppeteer
        const defaultArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
        const combinedArgs = request.options.args
            ? [...new Set([...defaultArgs, ...request.options.args])]
            : defaultArgs;

        // Fetch global configuration
        const globalConfig = await this.storageService.getGlobalScrapeConfig();
        
        // Merge global options with request overrides
        const mergedOptions = {
            ...globalConfig.scraperOptions,
            ...request.options
        };

        // Map our options to the library's options
        const libOptions: any = {
            companyId: request.companyId as CompanyTypes,
            combineInstallments: mergedOptions.combineInstallments ?? false,
            showBrowser: mergedOptions.showBrowser ?? false,
            verbose: mergedOptions.verbose ?? true,
            additionalTransactionInformation: mergedOptions.additionalTransactionInformation,
            includeRawTransaction: mergedOptions.includeRawTransaction,
            navigationRetryCount: mergedOptions.navigationRetryCount,
            optInFeatures: mergedOptions.optInFeatures,
            timeout: mergedOptions.timeout,
            defaultTimeout: mergedOptions.timeout,
            args: combinedArgs,
            executablePath: executablePath,
        };

        // Set start date - logic:
        // 1. Use explicit startDate from request if provided
        // 2. Otherwise, if smartStartDate is enabled, use min(last txn + 1 day, today - SMART_START_MIN_LOOKBACK_DAYS)
        // 3. Fallback to 30 days ago
        if (request.options.startDate) {
            libOptions.startDate = new Date(request.options.startDate);
            addLog(`Using explicit start date: ${request.options.startDate}`);
        } else if (globalConfig.useSmartStartDate && request.profileName) {
            try {
                const txns = await this.dbService.getAllTransactions();
                // Filter transactions for this profile if possible, or just find the latest overall for this company
                const profileTxns = txns.filter(t => t.accountNumber && txns.some(ot => ot.id === t.id)); // This is a bit weak, let's refine
                
                // Better: find latest date for this provider/company in the DB
                const latestDate = await this.dbService.getLatestTransactionDate(request.companyId);
                
                if (latestDate) {
                    const nextDay = new Date(latestDate);
                    nextDay.setDate(nextDay.getDate() + 1);
                    const minStart = new Date();
                    minStart.setDate(minStart.getDate() - SMART_START_MIN_LOOKBACK_DAYS);
                    const useMinLookback = nextDay.getTime() > minStart.getTime();
                    libOptions.startDate = useMinLookback ? minStart : nextDay;
                    if (useMinLookback) {
                        addLog(
                            `Smart start date enabled. Minimum ${SMART_START_MIN_LOOKBACK_DAYS}-day lookback: ${libOptions.startDate.toISOString().split('T')[0]} (day after last transaction would be ${nextDay.toISOString().split('T')[0]})`
                        );
                    } else {
                        addLog(
                            `Smart start date enabled. Using day after last transaction: ${libOptions.startDate.toISOString().split('T')[0]}`
                        );
                    }
                } else {
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    libOptions.startDate = thirtyDaysAgo;
                    addLog('Smart start date enabled but no previous transactions found. Defaulting to 30 days ago.');
                }
            } catch (err) {
                addLog(`Warning: Failed to calculate smart start date: ${(err as Error).message}. Defaulting to 30 days ago.`);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                libOptions.startDate = thirtyDaysAgo;
            }
        } else {
            // Default to 30 days ago
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            libOptions.startDate = thirtyDaysAgo;
            addLog(`Defaulting to 30 days ago: ${libOptions.startDate.toISOString().split('T')[0]}`);
        }

        // Add futureMonthsToScrape if specified
        if (request.options.futureMonthsToScrape !== undefined) {
            libOptions.futureMonthsToScrape = request.options.futureMonthsToScrape;
        }

        try {
            activeScrapeCount++;
            this.emitProgress(ScraperProgressTypes.Initializing, 'Initializing scraper...');
            addLog(`Starting scrape for ${request.companyId}...`);
            addLog(`Options: startDate=${libOptions.startDate.toISOString().split('T')[0]}, showBrowser=${libOptions.showBrowser}`);

            const scraper = createScraper(libOptions);

            // Subscribe to scraper progress events if the library supports it
            if (typeof scraper.onProgress === 'function') {
                scraper.onProgress((companyId: string, payload: { type: string }) => {
                    this.emitProgress(payload.type, `Scraper progress: ${payload.type}`);
                    addLog(`Progress: ${payload.type}`);
                });
            }

            this.emitProgress(ScraperProgressTypes.StartScraping, 'Starting scrape process...');
            const scrapeResult = await scraper.scrape(credentials as any);

            const executionTimeMs = Date.now() - startTime;

            if (scrapeResult.success) {
                this.emitProgress(ScraperProgressTypes.EndScraping, 'Scrape completed successfully!');
                addLog(`Scrape successful in ${executionTimeMs}ms.`);

                // Flatten transactions from all accounts; optionally drop excluded account numbers (global + request)
                let transactions = scrapeResult.accounts?.flatMap((acc: any) =>
                    acc.txns?.map((txn: any) => ({
                        ...txn,
                        provider: request.companyId,
                        accountNumber: acc.accountNumber || 'unknown',
                    })) || []
                ) || [];

                const excludedList = mergeExcludedAccountNumberLists(
                    globalConfig.scraperOptions.excludedAccountNumbers,
                    (request.options.excludedAccountNumbers || []) as string[]
                );
                let accountsOut: any[] | undefined = scrapeResult.accounts as any;
                if (excludedList.length > 0) {
                    for (const pattern of excludedList) {
                        const n = countTransactionsForExclusionPattern(transactions, pattern);
                        if (n > 0) {
                            const exclusionMsg = `Deleted ${n} transaction(s) due to account ${pattern} exclusion`;
                            addLog(exclusionMsg);
                            serverLogger.info(exclusionMsg, {
                                companyId: request.companyId,
                                profileName: request.profileName,
                            });
                        }
                    }
                    transactions = transactions.filter(
                        (t) => !isAccountNumberExcluded(t.accountNumber || '', excludedList)
                    );
                    if (accountsOut?.length) {
                        accountsOut = accountsOut.filter(
                            (acc: any) => !isAccountNumberExcluded(acc.accountNumber || '', excludedList)
                        );
                    }
                }
                if (accountsOut?.length) {
                    accountsOut = stripNestedTxnsFromScrapeAccounts(accountsOut) as any[];
                }

                // Emit completion event
                if (this.io) {
                    this.io.emit('scrape:complete', {
                        success: true,
                        transactionCount: transactions.length,
                        executionTimeMs,
                    });
                }

                const successResult = {
                    success: true,
                    accounts: accountsOut as any,
                    transactions,
                    logs,
                    executionTimeMs,
                };

                if (deferPostScrape) {
                    // Caller will run post-scrape once after all scrapes finish (batch)
                    return successResult;
                }

                const scrapeRunLogId = generateScrapeRunLogId();
                (request as any).__scrapeRunLogId = scrapeRunLogId;

                if (useAggregatePath) {
                    let postActions: ScrapeRunActionRecord[] = [];
                    try {
                        postActions = await postScrapeService.handleResult(successResult, request);
                    } catch (err: any) {
                        this.emitLog(`Post-scrape actions failed: ${err?.message || err}`);
                        postActions = [{ key: 'post-scrape', status: 'failed', detail: err?.message || String(err) }];
                    }
                    let notifAction: ScrapeRunActionRecord = { key: 'scrape-notification', status: 'ok' };
                    try {
                        await postScrapeService.sendScrapeNotification(successResult, request);
                    } catch (err: any) {
                        this.emitLog(`Scrape notification failed: ${err?.message || err}`);
                        notifAction = {
                            key: 'scrape-notification',
                            status: 'failed',
                            detail: err?.message || String(err),
                        };
                    }
                    let flushAction: ScrapeRunActionRecord = { key: 'telegram-aggregate-flush', status: 'ok' };
                    try {
                        await postScrapeService.flushAggregatedTelegramNotification(request);
                        await postScrapeService.flushAggregatedMqttNotification(request);
                    } catch (err: any) {
                        this.emitLog(`Aggregated Telegram notification failed: ${err?.message || err}`);
                        flushAction = {
                            key: 'telegram-aggregate-flush',
                            status: 'failed',
                            detail: err?.message || String(err),
                        };
                    }
                    await writeScrapeRunLog({
                        id: scrapeRunLogId,
                        pipelineId: request.profileName || request.companyId || 'unknown',
                        companyId: request.companyId,
                        profileName: request.profileName,
                        runSource: scrapeRunSourceForLog(request),
                        kind: 'single',
                        transactionCount: transactions.length,
                        scrapeSuccess: true,
                        actions: [...postActions, notifAction, flushAction],
                    });
                } else {
                    // Run post-scrape actions concurrently with scrape notification (same as before)
                    void (async () => {
                        const [hRes, nRes] = await Promise.allSettled([
                            postScrapeService.handleResult(successResult, request),
                            postScrapeService.sendScrapeNotification(successResult, request),
                        ]);
                        const postActions: ScrapeRunActionRecord[] =
                            hRes.status === 'fulfilled'
                                ? hRes.value
                                : [{ key: 'post-scrape', status: 'failed', detail: String(hRes.reason) }];
                        if (hRes.status === 'rejected') {
                            this.emitLog(`Post-scrape actions failed: ${String(hRes.reason)}`);
                        }
                        const notifAction: ScrapeRunActionRecord =
                            nRes.status === 'fulfilled'
                                ? { key: 'scrape-notification', status: 'ok' }
                                : {
                                      key: 'scrape-notification',
                                      status: 'failed',
                                      detail: String(nRes.reason),
                                  };
                        if (nRes.status === 'rejected') {
                            this.emitLog(`Scrape notification failed: ${String(nRes.reason)}`);
                        }
                        await writeScrapeRunLog({
                            id: scrapeRunLogId,
                            pipelineId: request.profileName || request.companyId || 'unknown',
                            companyId: request.companyId,
                            profileName: request.profileName,
                            runSource: scrapeRunSourceForLog(request),
                            kind: 'single',
                            transactionCount: transactions.length,
                            scrapeSuccess: true,
                            actions: [...postActions, notifAction],
                        });
                    })();
                }

                return successResult;
            } else {
                this.emitProgress(ScraperProgressTypes.LoginFailed, `Scrape failed: ${scrapeResult.errorType}`);
                addLog(`Scrape failed: ${scrapeResult.errorType} - ${scrapeResult.errorMessage || ''}`);

                // Emit failure event
                if (this.io) {
                    this.io.emit('scrape:complete', {
                        success: false,
                        error: scrapeResult.errorType,
                        executionTimeMs,
                    });
                }

                const failResult = {
                    success: false as const,
                    error: `${scrapeResult.errorType}${scrapeResult.errorMessage ? ': ' + scrapeResult.errorMessage : ''}`,
                    logs,
                    executionTimeMs,
                };

                if (deferPostScrape) {
                    return failResult;
                }
                if (useAggregatePath) {
                    try {
                        await postScrapeService.sendScrapeNotification(failResult, request);
                        await postScrapeService.flushAggregatedTelegramNotification(request);
                        await postScrapeService.flushAggregatedMqttNotification(request);
                    } catch (err: any) {
                        this.emitLog(`Scrape notification failed: ${err?.message || err}`);
                    }
                } else {
                    // Notify configured channels about the failed scrape
                    postScrapeService.sendScrapeNotification(failResult, request).catch((err: any) => {
                        this.emitLog(`Scrape notification failed: ${err?.message || err}`);
                    });
                }

                return failResult;
            }

        } catch (e: any) {
            const executionTimeMs = Date.now() - startTime;
            this.emitProgress(ScraperProgressTypes.Terminating, `Critical error: ${e.message}`);
            addLog(`Critical error: ${e.message}`);

            // Emit error event
            if (this.io) {
                this.io.emit('scrape:complete', {
                    success: false,
                    error: e.message,
                    executionTimeMs,
                });
            }

            const errorResult = {
                success: false as const,
                error: e.message,
                logs,
                executionTimeMs,
            };

            if (deferPostScrape) {
                return errorResult;
            }
            if (useAggregatePath) {
                try {
                    await postScrapeService.sendScrapeNotification(errorResult, request);
                    await postScrapeService.flushAggregatedTelegramNotification(request);
                    await postScrapeService.flushAggregatedMqttNotification(request);
                } catch (err: any) {
                    this.emitLog(`Scrape notification failed: ${err?.message || err}`);
                }
            } else {
                // Notify configured channels about the critical error
                postScrapeService.sendScrapeNotification(errorResult, request).catch(() => {});
            }

            return errorResult;
        } finally {
            activeScrapeCount--;
        }
    }

    /**
     * One Zero: send SMS OTP and keep scraper instance for {@link oneZeroOtpComplete}.
     * Requires app unlock (same as scrape).
     */
    async oneZeroOtpTrigger(
        phoneNumber: string,
        profileId?: string
    ): Promise<{ success: true; sessionId: string } | { success: false; error: string }> {
        if (!appLockService.isUnlocked()) {
            return { success: false, error: 'Application is locked. Unlock in the web UI first.' };
        }
        const trimmed = typeof phoneNumber === 'string' ? phoneNumber.trim() : '';
        if (!trimmed.startsWith('+')) {
            return {
                success: false,
                error: 'Phone number must be a full international number starting with + (e.g. +972...).',
            };
        }

        const executablePath = this.getExecutablePath();
        const defaultArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
        const globalConfig = await this.storageService.getGlobalScrapeConfig();
        const timeout = globalConfig.scraperOptions?.timeout ?? 120000;

        const libOptions: Record<string, unknown> = {
            companyId: CompanyTypes.oneZero,
            startDate: new Date(),
            combineInstallments: false,
            showBrowser: false,
            verbose: true,
            timeout,
            defaultTimeout: timeout,
            args: defaultArgs,
        };
        if (executablePath) {
            libOptions.executablePath = executablePath;
        }

        const scraper = createScraper(libOptions as any);
        const triggerResult = await scraper.triggerTwoFactorAuth(trimmed);
        if (!triggerResult.success) {
            const err = triggerResult as { errorMessage?: string };
            return {
                success: false,
                error: err.errorMessage || 'Failed to send OTP SMS',
            };
        }
        const pid =
            typeof profileId === 'string' && profileId.trim() !== '' ? profileId.trim() : undefined;
        const sessionId = registerOneZeroOtpSession(scraper, pid);
        return { success: true, sessionId };
    }

    /**
     * One Zero: exchange SMS OTP for long-term token; consumes the session from {@link oneZeroOtpTrigger}.
     * When {@link saveToProfileId} is set, the token is persisted on the profile and not returned (no token in responses).
     */
    async oneZeroOtpComplete(
        sessionId: string | undefined,
        otpCode: string,
        options?: { saveToProfileId?: string }
    ): Promise<
        | { success: true; otpLongTermToken: string; savedToProfile?: false }
        | { success: true; savedToProfile: true }
        | { success: false; error: string }
    > {
        if (!appLockService.isUnlocked()) {
            return { success: false, error: 'Application is locked. Unlock in the web UI first.' };
        }
        const code = typeof otpCode === 'string' ? otpCode.trim() : '';
        if (!code) {
            return { success: false, error: 'OTP code is required.' };
        }

        const savePid = typeof options?.saveToProfileId === 'string' ? options.saveToProfileId.trim() : '';

        const sid = resolveOneZeroOtpSessionId({
            sessionId,
            profileId: savePid || undefined,
        });
        if (!sid) {
            return {
                success: false,
                error:
                    'Invalid or expired OTP session. Send a new SMS code and try again, or use the same profile you used to request the SMS.',
            };
        }

        if (savePid) {
            const bound = getBoundSessionIdForProfile(savePid);
            if (!bound || bound !== sid) {
                return {
                    success: false,
                    error:
                        'OTP session does not match this profile. Request SMS again from this profile (web or bot), then enter the code.',
                };
            }
            const profile = await this.profileService.getProfile(savePid);
            if (!profile || profile.companyId !== CompanyTypes.oneZero) {
                return { success: false, error: 'Invalid One Zero profile.' };
            }
        }

        const scraper = getOneZeroOtpSession(sid);
        if (!scraper) {
            return {
                success: false,
                error: 'Invalid or expired OTP session. Send a new SMS code and try again.',
            };
        }

        try {
            const result = await scraper.getLongTermTwoFactorToken(code);
            removeOneZeroOtpSession(sid);
            if (!result.success) {
                const err = result as { errorMessage?: string };
                return {
                    success: false,
                    error: err.errorMessage || 'Failed to verify OTP',
                };
            }
            const token = result.longTermTwoFactorAuthToken;

            if (savePid) {
                await this.profileService.updateProfile(savePid, {
                    credentials: { otpLongTermToken: token },
                });
                return { success: true, savedToProfile: true };
            }

            return { success: true, otpLongTermToken: token };
        } catch (e: any) {
            removeOneZeroOtpSession(sid);
            return { success: false, error: e?.message || String(e) };
        }
    }
}
