import { createScraper, CompanyTypes } from 'israeli-bank-scrapers';
import { ScrapeResult, ScrapeRequest } from '@app/shared';
import { Server } from 'socket.io';
import puppeteer from 'puppeteer';
import fs from 'fs-extra';

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

export class ScraperService {
    private io: Server | null = null;

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

        const addLog = (msg: string) => {
            const logEntry = `[${new Date().toISOString()}] ${msg}`;
            logs.push(logEntry);
            this.emitLog(logEntry);
        };

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

        // Map our options to the library's options
        const libOptions: any = {
            companyId: request.companyId as CompanyTypes,
            combineInstallments: request.options.combineInstallments ?? false,
            showBrowser: request.options.showBrowser ?? false,
            verbose: request.options.verbose ?? true,
            timeout: request.options.timeout,
            defaultTimeout: request.options.timeout, // The library uses defaultTimeout for puppeteer navigation
            args: combinedArgs,
            executablePath: executablePath,
        };

        // Set start date - default to 30 days ago if not provided
        if (request.options.startDate) {
            libOptions.startDate = new Date(request.options.startDate);
        } else {
            // Default to 30 days ago
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            libOptions.startDate = thirtyDaysAgo;
        }

        // Add futureMonthsToScrape if specified
        if (request.options.futureMonthsToScrape !== undefined) {
            libOptions.futureMonthsToScrape = request.options.futureMonthsToScrape;
        }

        try {
            this.emitProgress(ScraperProgressTypes.Initializing, 'Initializing scraper...');
            addLog(`Starting scrape for ${request.companyId}...`);
            addLog(`Options: startDate=${libOptions.startDate.toISOString().split('T')[0]}, showBrowser=${libOptions.showBrowser}`);

            const scraper = createScraper(libOptions);

            // Subscribe to scraper progress events if the library supports it
            if (typeof scraper.onProgress === 'function') {
                scraper.onProgress((progressType: string) => {
                    this.emitProgress(progressType, `Scraper progress: ${progressType}`);
                    addLog(`Progress: ${progressType}`);
                });
            }

            this.emitProgress(ScraperProgressTypes.StartScraping, 'Starting scrape process...');
            const scrapeResult = await scraper.scrape(request.credentials as any);

            const executionTimeMs = Date.now() - startTime;

            if (scrapeResult.success) {
                this.emitProgress(ScraperProgressTypes.EndScraping, 'Scrape completed successfully!');
                addLog(`Scrape successful in ${executionTimeMs}ms.`);

                // Flatten transactions from all accounts
                const transactions = scrapeResult.accounts?.flatMap((acc: any) =>
                    acc.txns?.map((txn: any) => ({
                        ...txn,
                        provider: request.companyId,
                        accountNumber: acc.accountNumber || 'unknown',
                    })) || []
                ) || [];

                // Emit completion event
                if (this.io) {
                    this.io.emit('scrape:complete', {
                        success: true,
                        transactionCount: transactions.length,
                        executionTimeMs,
                    });
                }

                return {
                    success: true,
                    accounts: scrapeResult.accounts as any,
                    transactions,
                    logs,
                    executionTimeMs,
                };
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

                return {
                    success: false,
                    error: `${scrapeResult.errorType}${scrapeResult.errorMessage ? ': ' + scrapeResult.errorMessage : ''}`,
                    logs,
                    executionTimeMs,
                };
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

            return {
                success: false,
                error: e.message,
                logs,
                executionTimeMs,
            };
        }
    }
}
