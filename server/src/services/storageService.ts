import fs from 'fs-extra';
import path from 'path';
import {
    ScrapeResult,
    Transaction,
    GlobalScrapeConfig,
    assignBatchContentIdsFromTransactions,
    buildContentTransactionKey,
    hashTransactionId,
} from '@app/shared';
import { AiService } from './aiService.js';
import { closeDbForRestore, DbService } from './dbService.js';
import { serverLogger } from '../utils/logger.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const RESULTS_DIR = path.join(DATA_DIR, 'results');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const SCRAPE_CONFIG_PATH = path.join(CONFIG_DIR, 'scrape_config.json');

/** Strip only characters invalid in file names; preserves Hebrew and other Unicode letters. */
function sanitizeFilenameSegment(name: string): string {
    const trimmed = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
    return trimmed.length > 0 ? trimmed : 'scrape';
}

/** ISO time safe for filenames (no `:` or `.`). */
function filenameTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

const DEFAULT_GLOBAL_CONFIG: GlobalScrapeConfig = {
    scraperOptions: {
        showBrowser: false,
        combineInstallments: false,
        timeout: 120000,
        futureMonthsToScrape: 0,
        autoCategorize: true,
        ignorePendingTransactions: true,
    },
    useSmartStartDate: true,
    postScrapeConfig: {
        runCategorization: true,
        fraudDetection: {
            enabled: false,
            notifyOnIssue: true,
            scope: 'current',
        },
        customAI: {
            enabled: false,
            query: '',
            notifyOnResult: true,
            scope: 'current',
            skipIfNoTransactions: true,
        },
        notificationChannels: ['console'],
        aggregateTelegramNotifications: true,
        spendingDigestEnabled: false,
        transactionReviewReminder: {
            enabled: true,
            notifyTransfersCategory: true,
            notifyUncategorized: true,
        },
        budgetExports: {},
    },
};

export class StorageService {
    private aiService: AiService;
    private dbService: DbService;
    private dbSynced = false;
    private initPromise: Promise<void>;

    constructor() {
        this.aiService = new AiService();
        this.dbService = new DbService();
        this.initPromise = this.ensureDataDir();
    }

    private async ensureDataDir() {
        await fs.ensureDir(DATA_DIR);
        await fs.ensureDir(CONFIG_DIR);
        await fs.ensureDir(RESULTS_DIR);
        await this.migrateLegacyResults();
        if (!this.dbSynced) {
            await this.syncFilesToDb();
            this.dbSynced = true;
        }
    }

    /**
     * Sets {@link Transaction.id} when missing, using the same logic as {@link saveScrapeResult} (single-row batch ordinal).
     * Post-scrape runs before persist on the normal scrape path; Telegram memo prompts need this id to match the DB row.
     */
    ensureStableTransactionId(txn: Transaction): void {
        assignBatchContentIdsFromTransactions([txn], {
            providerFallback: txn.provider || 'unknown',
            accountFallback: txn.accountNumber || 'unknown',
        });
    }

    private async migrateLegacyResults() {
        const files = await fs.readdir(DATA_DIR);
        const internalFiles = [
            'config',
            'profiles',
            'logs',
            'results',
            'app.db',
            'app.db-shm',
            'app.db-wal'
        ];

        for (const file of files) {
            if (!internalFiles.includes(file) && file.endsWith('.json')) {
                const oldPath = path.join(DATA_DIR, file);
                const newPath = path.join(RESULTS_DIR, file);
                try {
                    await fs.move(oldPath, newPath, { overwrite: true });
                } catch (error) {
                    // Ignore move errors for now
                }
            }
        }
    }

    private async syncFilesToDb() {
        // One-time sync or on startup: read all JSONs and push to DB
        // To avoid re-processing everything every time, maybe check if DB is empty or just rely on INSERT OR IGNORE
        serverLogger.info('Syncing JSON files to DB...');
        const globalConfig = await this.getGlobalScrapeConfig();
        const ignorePending = globalConfig.scraperOptions.ignorePendingTransactions !== false;

        const files = await fs.readdir(RESULTS_DIR);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const result = await this.getScrapeResult(file);
                if (result && result.transactions) {
                    for (const txn of result.transactions) {
                        if (ignorePending && txn.status === 'pending') {
                            continue;
                        }
                        this.dbService.addTransaction(txn);
                    }
                }
            } catch (error) {
                serverLogger.warn(`Failed to sync file ${file} to DB:`, error);
            }
        }
        serverLogger.info('DB Sync complete');
    }

    /**
     * Persist scrape JSON as `{profileName}_{provider}_{timestamp}.json`.
     * @param provider Bank/scraper id (e.g. companyId: mizrahi, leumi).
     * @param profileName Saved profile label or source (manual import, merge, etc.); defaults to "default" if omitted.
     */
    async saveScrapeResult(
        result: ScrapeResult,
        provider: string,
        profileName?: string
    ): Promise<{ filename: string; newTransactionIds: string[] }> {
        // Do not save empty results
        const hasTransactions = result.transactions && result.transactions.length > 0;
        const hasAccounts = result.accounts && result.accounts.length > 0;

        if (!hasTransactions && !hasAccounts) {
            throw new Error('Cannot save empty result - no transactions or accounts found');
        }

        let accountNumber = 'unknown';

        if (result.accounts && result.accounts.length > 0) {
            accountNumber = result.accounts[0].accountNumber;
        }

        let insertedNewIds: string[] = [];

        if (result.transactions && result.transactions.length > 0) {
            const config = await this.getGlobalScrapeConfig();
            const ignorePending = config.scraperOptions.ignorePendingTransactions !== false;

            const validTransactions: Transaction[] = [];
            const newTransactionIds: string[] = [];
            for (const txn of result.transactions) {
                if (ignorePending && txn.status === 'pending') {
                    const tmp = { ...txn } as Transaction;
                    assignBatchContentIdsFromTransactions([tmp], {
                        providerFallback: provider,
                        accountFallback: txn.accountNumber || accountNumber,
                    });
                    this.dbService.deleteTransaction(tmp.id);
                    continue;
                }

                validTransactions.push(txn);
            }
            assignBatchContentIdsFromTransactions(validTransactions, {
                providerFallback: provider,
                accountFallback: accountNumber,
            });
            for (const txn of validTransactions) {
                if (this.dbService.addTransaction(txn)) {
                    newTransactionIds.push(txn.id);
                }
            }
            result.transactions = validTransactions;

            insertedNewIds = newTransactionIds;
        }

        const safeProfile = sanitizeFilenameSegment(profileName ?? 'default');
        const safeProvider = sanitizeFilenameSegment(provider);
        const filename = `${safeProfile}_${safeProvider}_${filenameTimestamp()}.json`;
        const filePath = path.join(RESULTS_DIR, filename);

        // Save in legacy format (array of accounts) as requested by user for consistency
        const legacyData = this.serializeToLegacyFormat(result);
        await fs.writeJson(filePath, legacyData, { spaces: 2 });
        return {
            filename,
            newTransactionIds: insertedNewIds,
        };
    }

    async deleteScrapeResult(filename: string): Promise<boolean> {
        const filePath = path.join(RESULTS_DIR, filename);
        const resolvedPath = path.resolve(RESULTS_DIR, filename);

        if (!resolvedPath.startsWith(RESULTS_DIR)) {
            throw new Error('Invalid filename - security violation');
        }

        if (await fs.pathExists(resolvedPath)) {
            await fs.remove(resolvedPath);
            // Rebuild DB to remove transactions from deleted file
            await this.reloadTransactionsFromFiles();
            return true;
        }
        return false;
    }

    async updateScrapeResult(filename: string, result: ScrapeResult) {
        const filePath = path.join(RESULTS_DIR, filename);
        const resolvedPath = path.resolve(RESULTS_DIR, filename);
        if (!resolvedPath.startsWith(RESULTS_DIR)) {
            throw new Error('Invalid filename');
        }

        // Update file
        const legacyData = this.serializeToLegacyFormat(result);
        await fs.writeJson(resolvedPath, legacyData, { spaces: 2 });

        // Reload DB to reflect file changes (categories, etc.)
        await this.reloadTransactionsFromFiles();
    }

    async listScrapeResults() {
        await this.initPromise;
        const files = await fs.readdir(RESULTS_DIR);
        const fileMetadata = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const filePath = path.join(RESULTS_DIR, file);
                const stats = await fs.stat(filePath);
                const result = await this.getScrapeResult(file);
                const transactionCount = result?.transactions?.length || 0;
                if (transactionCount > 0) {
                    fileMetadata.push({
                        filename: file,
                        transactionCount,
                        accountCount: result?.accounts?.length || 0,
                        createdAt: stats.birthtime.toISOString()
                    });
                }
            } catch (error) {
                continue;
            }
        }
        return fileMetadata;
    }

    async renameFile(oldFilename: string, newFilename: string): Promise<boolean> {
        if (!oldFilename.endsWith('.json') || !newFilename.endsWith('.json')) {
            throw new Error('Filenames must end with .json');
        }

        const oldPath = path.join(RESULTS_DIR, oldFilename);
        const newPath = path.join(RESULTS_DIR, newFilename);
        const resolvedOldPath = path.resolve(oldPath);
        const resolvedNewPath = path.resolve(newPath);

        if (!resolvedOldPath.startsWith(RESULTS_DIR) || !resolvedNewPath.startsWith(RESULTS_DIR)) {
            throw new Error('Invalid filename path');
        }

        if (!await fs.pathExists(resolvedOldPath)) {
            throw new Error('Source file does not exist');
        }

        if (await fs.pathExists(resolvedNewPath)) {
            throw new Error('Target filename already exists');
        }

        await fs.move(resolvedOldPath, resolvedNewPath);
        return true;
    }

    async getScrapeResult(filename: string): Promise<ScrapeResult | null> {
        const filePath = path.join(RESULTS_DIR, filename);
        if (!await fs.pathExists(filePath)) return null;

        const rawData = await fs.readJson(filePath);

        if (Array.isArray(rawData)) {
            return this.normalizeLegacyData(rawData, filename);
        }

        return rawData;
    }

    private normalizeLegacyData(data: any[], filename: string): ScrapeResult {
        const transactions: any[] = [];
        const accounts: any[] = [];

        const providerMatch = filename.match(/^([^_]+)/);
        const provider = providerMatch ? providerMatch[1] : 'unknown';

        data.forEach(account => {
            accounts.push({
                accountNumber: account.accountNumber,
                provider: provider,
                balance: account.balance || 0,
                currency: 'ILS'
            });

            if (account.txns) {
                account.txns.forEach((txn: any) => {
                    const stableId =
                        txn.identifier != null
                            ? String(txn.identifier)
                            : hashTransactionId(
                                  buildContentTransactionKey(
                                      {
                                          date: txn.date,
                                          amount: txn.chargedAmount ?? txn.amount,
                                          chargedAmount: txn.chargedAmount,
                                          description: txn.description,
                                      },
                                      account.accountNumber
                                  )
                              );
                    transactions.push({
                        id: stableId,
                        date: txn.date,
                        processedDate: txn.processedDate,
                        description: txn.description,
                        memo: txn.memo,
                        amount: txn.chargedAmount,
                        originalAmount: txn.originalAmount,
                        originalCurrency: txn.originalCurrency,
                        chargedAmount: txn.chargedAmount,
                        chargedCurrency: txn.chargedCurrency,
                        status: txn.status || 'completed',
                        category: txn.category,
                        provider: provider,
                        accountNumber: account.accountNumber,
                        // Preserve scraper row type (e.g. installments, normal) — was dropped before DB import
                        type: txn.type,
                        installments: txn.installments,
                        txnType: txn.txnType || (txn.type === 'internal_transfer' ? 'internal_transfer' : undefined)
                    });
                });
            }
        });

        return {
            success: true,
            accounts,
            transactions,
            executionTimeMs: 0
        };
    }

    private serializeToLegacyFormat(result: ScrapeResult): any[] {
        if (!result.accounts) return [];

        return result.accounts.map(acc => {
            const accTxns = result.transactions?.filter(t => t.accountNumber === acc.accountNumber) || [];
            return {
                accountNumber: acc.accountNumber,
                txns: accTxns.map(t => ({
                    type: (t as any).type || 'normal',
                    identifier: isNaN(Number(t.id)) ? t.id : Number(t.id),
                    date: t.date,
                    processedDate: t.processedDate,
                    originalAmount: t.originalAmount,
                    originalCurrency: t.originalCurrency,
                    chargedAmount: t.chargedAmount,
                    chargedCurrency: t.originalCurrency,
                    description: t.description,
                    memo: t.memo || '',
                    status: t.status,
                    category: t.category,
                    installments: (t as any).installments,
                    txnType: (t as any).txnType,
                    isSubscription: t.isSubscription,
                    subscriptionInterval: t.subscriptionInterval,
                    excludeFromSubscriptions: (t as any).excludeFromSubscriptions
                }))
            };
        });
    }

    async updateTransactionCategory(filename: string, transactionId: string, category: string): Promise<boolean> {
        // Get description first to enable mass update
        const result = await this.getScrapeResult(filename);
        const txn = result?.transactions?.find(t => t.id === transactionId);
        
        if (txn && txn.description) {
            return this.updateTransactionCategoryUnified(transactionId, category);
        }

        // Fallback to single update if description not found (shouldn't happen)
        this.dbService.updateTransactionCategory(transactionId, category, true);
        return true;
    }

    // New method for toggling ignore status
    async toggleTransactionIgnore(transactionId: string, isIgnored: boolean): Promise<boolean> {
        return this.dbService.toggleTransactionIgnore(transactionId, isIgnored);
    }

    async updateTransactionCategoryUnified(transactionId: string, category: string): Promise<boolean> {
        // Get description for mass update
        const transactions = await this.dbService.getAllTransactions(true); // Get all including ignored
        const txn = transactions.find(t => t.id === transactionId);

        if (!txn || !txn.description) {
            // Fallback to single update if no description (unlikely)
            this.dbService.updateTransactionCategory(transactionId, category, true);
            return true;
        }

        const description = txn.description;

        // 1. Update DB for ALL transactions with this description (user-chosen category)
        this.dbService.updateCategoryByDescription(description, category, true);

        // 2. Update AI cache
        await this.aiService.updateCategoryInCache(description, category);

        // 3. Sync to ALL files
        await this.syncCategoryUpdateByDescriptionToFiles(description, category);

        return true;
    }

    private async syncCategoryUpdateByDescriptionToFiles(description: string, category: string): Promise<void> {
        const files = await fs.readdir(RESULTS_DIR);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const filePath = path.join(RESULTS_DIR, file);
            try {
                const rawData = await fs.readJson(filePath);
                let updated = false;

                if (Array.isArray(rawData)) {
                    for (const account of rawData) {
                        if (account.txns) {
                            account.txns.forEach((t: any) => {
                                if (t.description === description) {
                                    t.category = category;
                                    t.categoryUserSet = true;
                                    updated = true;
                                }
                            });
                        }
                    }
                } else {
                    const result: ScrapeResult = rawData;
                    if (result.transactions) {
                        result.transactions.forEach(t => {
                            if (t.description === description) {
                                t.category = category;
                                (t as any).categoryUserSet = true;
                                updated = true;
                            }
                        });
                    }
                }

                if (updated) {
                    await fs.writeJson(filePath, rawData, { spaces: 2 });
                }
            } catch (e) {
                serverLogger.error(`Error updating file ${file}:`, e);
            }
        }
    }

    async updateTransactionTypeUnified(transactionId: string, txnType: string): Promise<boolean> {
        // Update DB
        const success = this.dbService.updateTransactionType(transactionId, txnType);
        if (!success) return false;

        // Sync to files
        await this.syncTransactionUpdateToFiles(transactionId, (t) => {
            t.txnType = txnType;
            t.type = txnType;
            t.isInternalTransfer = txnType === 'internal_transfer';
        });

        return true;
    }

    /** Returns true if a transaction with this id exists in the unified DB. */
    transactionExists(transactionId: string): boolean {
        return this.dbService.transactionExists(transactionId);
    }

    async updateTransactionMemoUnified(transactionId: string, memo: string): Promise<boolean> {
        // Update DB
        const success = this.dbService.updateTransactionMemo(transactionId, memo);
        if (!success) return false;

        // Sync to files
        await this.syncTransactionUpdateToFiles(transactionId, (t) => {
            t.memo = memo;
        });

        return true;
    }

    async updateTransactionSubscriptionUnified(transactionId: string, isSubscription: boolean, interval: string | null, excludeFromSubscriptions: boolean = false): Promise<boolean> {
        // Update DB
        const success = this.dbService.updateTransactionSubscription(transactionId, isSubscription, interval, excludeFromSubscriptions);
        if (!success) return false;

        // Sync to files
        await this.syncTransactionUpdateToFiles(transactionId, (t) => {
            t.isSubscription = isSubscription;
            t.subscriptionInterval = interval;
            t.excludeFromSubscriptions = excludeFromSubscriptions;
        });

        return true;
    }

    private async syncTransactionUpdateToFiles(transactionId: string, updateFn: (txn: any) => void): Promise<void> {
        const files = await fs.readdir(RESULTS_DIR);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const filePath = path.join(RESULTS_DIR, file);
            try {
                const rawData = await fs.readJson(filePath);
                let found = false;

                if (Array.isArray(rawData)) {
                    for (const account of rawData) {
                        if (account.txns) {
                            const txnIndex = account.txns.findIndex((t: any) => t.identifier?.toString() === transactionId || t.id === transactionId);
                            if (txnIndex !== -1) {
                                updateFn(account.txns[txnIndex]);
                                found = true;
                                break;
                            }
                        }
                    }
                    if (found) await fs.writeJson(filePath, rawData, { spaces: 2 });
                } else {
                    const result: ScrapeResult = rawData;
                    if (result.transactions) {
                        const txnIndex = result.transactions.findIndex(t => t.id === transactionId);
                        if (txnIndex !== -1) {
                            updateFn(result.transactions[txnIndex]);
                            await fs.writeJson(filePath, result, { spaces: 2 });
                        }
                    }
                }
            } catch (e) {
                console.error(`Error updating file ${file}:`, e);
            }
        }
    }


    async mergeResults(filenames: string[], outputName: string, deleteOriginals: boolean = false): Promise<string> {
        if (filenames.length < 2) {
            throw new Error('Must provide at least 2 files to merge');
        }

        const results: ScrapeResult[] = [];
        for (const filename of filenames) {
            const result = await this.getScrapeResult(filename);
            if (result) {
                results.push(result);
            }
        }

        if (results.length === 0) {
            throw new Error('No valid results to merge');
        }

        // Validate all files belong to the same account(s)
        const allAccountNumbers = new Set<string>();
        for (const result of results) {
            if (result.accounts) {
                for (const account of result.accounts) {
                    allAccountNumbers.add(account.accountNumber);
                }
            }
        }
        // Check that each file shares at least one account with the others
        const firstResult = results[0];
        const firstAccounts = new Set(firstResult.accounts?.map(a => a.accountNumber) || []);
        for (let i = 1; i < results.length; i++) {
            const resultAccounts = results[i].accounts?.map(a => a.accountNumber) || [];
            const hasCommon = resultAccounts.some(acc => firstAccounts.has(acc));
            if (!hasCommon) {
                throw new Error(`Cannot merge files with different accounts. File "${filenames[0]}" has account(s) ${[...firstAccounts].join(', ')} but file "${filenames[i]}" has account(s) ${resultAccounts.join(', ')}.`);
            }
        }

        const mergedAccounts: any = {};
        const seenTransactionIds = new Set<string>();
        const seenTransactionHashes = new Set<string>();
        const mergedTransactions: any[] = [];

        for (const result of results) {
            if (result.accounts) {
                for (const account of result.accounts) {
                    mergedAccounts[account.accountNumber] = account;
                }
            }

            if (result.transactions) {
                for (const txn of result.transactions) {
                    const idStr = String(txn.id);
                    // Create a hash to catch duplicate transactions that got assigned different random IDs
                    const hash = `${txn.date}_${txn.amount}_${txn.description}`;

                    if (!seenTransactionIds.has(idStr) && !seenTransactionHashes.has(hash)) {
                        seenTransactionIds.add(idStr);
                        seenTransactionHashes.add(hash);
                        mergedTransactions.push(txn);
                    }
                }
            }
        }

        const mergedResult: ScrapeResult = {
            success: true,
            transactions: mergedTransactions,
            accounts: Object.values(mergedAccounts),
            logs: [`Merged ${filenames.length} files`]
        };

        const { filename: mergedFilename } = await this.saveScrapeResult(mergedResult, 'merged', 'merge');

        // Delete original files after successful merge
        if (deleteOriginals) {
            for (const originalFile of filenames) {
                const resolvedPath = path.resolve(RESULTS_DIR, originalFile);
                if (resolvedPath.startsWith(RESULTS_DIR) && await fs.pathExists(resolvedPath)) {
                    await fs.remove(resolvedPath);
                    serverLogger.info(`Deleted original file after merge: ${originalFile}`);
                }
            }
            // Reload DB to reflect the deletion of originals
            await this.reloadTransactionsFromFiles();
        }

        return mergedFilename;
    }

    async getAllTransactions(includeIgnored = false): Promise<any[]> {
        // Read from DB now!
        await this.initPromise;
        return this.dbService.getAllTransactions(includeIgnored);
    }

    async reloadTransactionsFromFiles() {
        serverLogger.info('Manual reload of transactions from files triggered');
        this.dbService.clearTransactions();
        await this.syncFilesToDb();
        serverLogger.info('Manual reload complete');
    }

    /** After restoring app.db from backup, realign internal-transfer flags with raw_data (txnType / type). */
    async reconcileInternalTransferFromRawData(): Promise<void> {
        await this.initPromise;
        const n = this.dbService.reconcileInternalTransferColumnFromRawData();
        if (n > 0) {
            serverLogger.info(`Reconciled isInternalTransfer for ${n} transaction(s) after restore`);
        }
    }

    /**
     * Deletes all files under DATA_DIR (database, results, config, profiles, backups, logs, etc.),
     * recreates empty layout, and rebuilds an empty transaction set from result files (none).
     * Used for maintenance "restore to defaults" / factory reset.
     */
    async wipeEntireDataDirectory(): Promise<void> {
        await this.initPromise;
        serverLogger.info('Factory reset: wiping entire data directory...');
        closeDbForRestore();
        if (await fs.pathExists(DATA_DIR)) {
            const entries = await fs.readdir(DATA_DIR);
            for (const name of entries) {
                await fs.remove(path.join(DATA_DIR, name));
            }
        }
        await fs.ensureDir(DATA_DIR);
        await fs.ensureDir(CONFIG_DIR);
        await fs.ensureDir(RESULTS_DIR);
        await fs.ensureDir(path.join(DATA_DIR, 'profiles'));
        await fs.ensureDir(path.join(DATA_DIR, 'backups'));
        await fs.ensureDir(path.join(DATA_DIR, 'uploads'));
        await fs.ensureDir(path.join(DATA_DIR, 'logs'));
        await fs.ensureDir(path.join(DATA_DIR, 'security'));
        await fs.ensureDir(path.join(DATA_DIR, 'post_scrape'));
        await this.reloadTransactionsFromFiles();
        serverLogger.info('Factory reset: data directory wiped and database reinitialized');
    }

    async resetAllUserChanges() {
        serverLogger.info('Resetting all user changes to defaults...');

        // 1. Clear DB: transactions + categories cache
        this.dbService.clearTransactions();
        this.dbService.clearCategoriesCache();

        // 2. Clear AI categories cache file
        const aiCachePath = path.join(CONFIG_DIR, 'ai_categories_cache.json');
        if (await fs.pathExists(aiCachePath)) {
            await fs.writeJson(aiCachePath, {}, { spaces: 2 });
        }

        // 3. Re-sync transactions from raw files (original categories from files, no user overrides)
        await this.syncFilesToDb();

        serverLogger.info('All user changes have been reset to defaults');
    }

    async getGlobalScrapeConfig(): Promise<GlobalScrapeConfig> {
        try {
            if (await fs.pathExists(SCRAPE_CONFIG_PATH)) {
                const loaded = await fs.readJson(SCRAPE_CONFIG_PATH);
                let postScrapeMerged: GlobalScrapeConfig['postScrapeConfig'] = {
                    ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig,
                    ...loaded.postScrapeConfig,
                    transactionReviewReminder: {
                        ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.transactionReviewReminder,
                        ...loaded.postScrapeConfig?.transactionReviewReminder,
                    },
                    budgetExports: {
                        ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.budgetExports,
                        ...loaded.postScrapeConfig?.budgetExports,
                        firefly: {
                            ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.budgetExports?.firefly,
                            ...loaded.postScrapeConfig?.budgetExports?.firefly,
                            accountMap: {
                                ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.budgetExports?.firefly?.accountMap,
                                ...loaded.postScrapeConfig?.budgetExports?.firefly?.accountMap,
                            },
                        },
                        lunchMoney: {
                            ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.budgetExports?.lunchMoney,
                            ...loaded.postScrapeConfig?.budgetExports?.lunchMoney,
                            accountMap: {
                                ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.budgetExports?.lunchMoney?.accountMap,
                                ...loaded.postScrapeConfig?.budgetExports?.lunchMoney?.accountMap,
                            },
                        },
                        ynab: {
                            ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.budgetExports?.ynab,
                            ...loaded.postScrapeConfig?.budgetExports?.ynab,
                            accountMap: {
                                ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.budgetExports?.ynab?.accountMap,
                                ...loaded.postScrapeConfig?.budgetExports?.ynab?.accountMap,
                            },
                        },
                        actual: {
                            ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.budgetExports?.actual,
                            ...loaded.postScrapeConfig?.budgetExports?.actual,
                            accountMap: {
                                ...DEFAULT_GLOBAL_CONFIG.postScrapeConfig.budgetExports?.actual?.accountMap,
                                ...loaded.postScrapeConfig?.budgetExports?.actual?.accountMap,
                            },
                        },
                    },
                };
                if (loaded.postScrapeConfig?.spendingDigestEnabled === undefined) {
                    try {
                        const telPath = path.join(CONFIG_DIR, 'telegram_config.json');
                        if (await fs.pathExists(telPath)) {
                            const tel = await fs.readJson(telPath) as { spendingDigestEnabled?: boolean };
                            if (typeof tel?.spendingDigestEnabled === 'boolean') {
                                postScrapeMerged = { ...postScrapeMerged, spendingDigestEnabled: tel.spendingDigestEnabled };
                            }
                        }
                    } catch {
                        /* ignore migration read */
                    }
                }
                // Deep merge or at least ensure all fields exist
                return {
                    ...DEFAULT_GLOBAL_CONFIG,
                    ...loaded,
                    scraperOptions: { ...DEFAULT_GLOBAL_CONFIG.scraperOptions, ...loaded.scraperOptions },
                    postScrapeConfig: postScrapeMerged,
                };
            }
        } catch (error) {
            serverLogger.warn('Failed to load global scrape config, using defaults', error);
        }
        return DEFAULT_GLOBAL_CONFIG;
    }

    async updateGlobalScrapeConfig(config: GlobalScrapeConfig): Promise<GlobalScrapeConfig> {
        await fs.ensureDir(CONFIG_DIR);
        await fs.writeJson(SCRAPE_CONFIG_PATH, config, { spaces: 2 });
        return config;
    }

    /**
     * Persist category values from transaction objects onto DB rows and JSON result files (same ids).
     */
    async applyCategoryColumnsFromTransactions(transactions: Transaction[]): Promise<number> {
        let updateCount = 0;
        for (const txn of transactions) {
            if (!txn.id || !txn.category) continue;
            if (this.dbService.transactionCategoryIsUserSet(txn.id)) continue;
            const changed = this.dbService.updateTransactionCategory(txn.id, txn.category, false);
            if (changed) {
                await this.syncTransactionUpdateToFiles(txn.id, (t) => {
                    t.category = txn.category;
                    t.categoryUserSet = false;
                });
                updateCount++;
            }
        }
        return updateCount;
    }

    async categorizeAllWithAi(force: boolean = false): Promise<{ success: boolean; count: number; error?: string }> {
        const transactions = await this.dbService.getAllTransactions(true);
        if (transactions.length === 0) return { success: true, count: 0 };

        serverLogger.info(`Starting bulk AI categorization for ${transactions.length} transactions (force: ${force})`);

        // Group by description to minimize AI calls (skip descriptions the user locked in the UI)
        const uniqueDescriptions = Array.from(new Set(transactions.map((t) => t.description)));
        const notUserLocked = (desc: string) => !this.dbService.descriptionHasUserSetCategory(desc);

        let toCategorize: string[] = [];
        if (force) {
            toCategorize = uniqueDescriptions.filter(notUserLocked);
        } else {
            toCategorize = uniqueDescriptions.filter(
                (desc) => notUserLocked(desc) && !this.dbService.getCategory(desc)
            );
        }

        if (toCategorize.length === 0) {
            serverLogger.info('No new descriptions to categorize');
            return { success: true, count: 0 };
        }

        serverLogger.info(`Sending ${toCategorize.length} unique descriptions to AI service`);

        // We can't use categorizeTransactions directly because it expects full Transaction objects
        // and handles its own filtering. We'll create dummy transactions for it.
        const dummyTransactions: Transaction[] = toCategorize.map(desc => ({
            id: 'dummy',
            date: new Date().toISOString(),
            processedDate: new Date().toISOString(),
            description: desc,
            amount: 0,
            originalAmount: 0,
            originalCurrency: 'ILS',
            chargedAmount: 0,
            chargedCurrency: 'ILS',
            status: 'completed',
            provider: 'dummy',
            accountNumber: 'dummy'
        }));

        const { aiError, descriptionCategories } = await this.aiService.categorizeTransactions(dummyTransactions, {
            skipCache: force,
        });

        if (force && aiError) {
            serverLogger.warn('Force recategorization aborted (AI required; cache not applied)', { error: aiError });
            return { success: false, count: 0, error: aiError };
        }

        const { defaultCategory } = await this.aiService.getSettings();

        // Apply model/cache results to DB rows (never overwrite user-chosen categories)
        let updateCount = 0;
        for (const txn of transactions) {
            if (txn.categoryUserSet) continue;

            const raw =
                force && descriptionCategories
                    ? descriptionCategories[txn.description]
                    : this.dbService.getCategory(txn.description);
            const newCategory = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';
            if (!newCategory) continue;

            if (force) {
                // Only overwrite when the model picked a specific category (not the default bucket)
                if (newCategory === defaultCategory) continue;
            }

            if (newCategory !== txn.category) {
                await this.dbService.updateTransactionCategory(txn.id, newCategory, false);

                await this.syncTransactionUpdateToFiles(txn.id, (t) => {
                    t.category = newCategory;
                    t.categoryUserSet = false;
                });

                updateCount++;
            }
        }

        serverLogger.info(`Bulk categorization complete. Updated ${updateCount} transactions.`);
        return { success: !aiError, count: updateCount, error: aiError };
    }
}
