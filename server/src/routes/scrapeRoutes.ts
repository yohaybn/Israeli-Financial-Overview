import { Router } from 'express';
import fs from 'fs-extra';
import { ScraperService } from '../services/scraperService.js';
import { StorageService } from '../services/storageService.js';
import { FilterService } from '../services/filterService.js';
import { AiService } from '../services/aiService.js';
import { ImportService } from '../services/importService.js';
import { BackupService, BACKUP_SCOPE_IDS, normalizeBackupScopesParam } from '../services/backupService.js';
import { SchedulerService } from '../services/schedulerService.js';
import { notificationService } from '../services/notifications/notificationService.js';
import { ScrapeRequest, PROVIDERS } from '@app/shared';
import { Server } from 'socket.io';
import multer from 'multer';
import path from 'path';
import { transactionsToCsv, transactionsToJson } from '@app/shared';
import { attachScrapeRunFilename } from '../utils/scrapeRunLogger.js';

export function createScrapeRoutes(
    scraperService: ScraperService,
    storageService: StorageService,
    filterService: FilterService,
    aiService: AiService,
    importService: ImportService,
    io: Server,
    schedulerService: SchedulerService
) {
    const router = Router();
    const backupService = new BackupService();

    const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
    const RESULTS_DIR = path.join(DATA_DIR, 'results');
    const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

    // Configure multer for file uploads
    const storage = multer.diskStorage({
        destination: (req: any, file: any, cb: any) => {
            fs.ensureDirSync(UPLOADS_DIR);
            cb(null, UPLOADS_DIR);
        },
        filename: (req: any, file: any, cb: any) => {
            // Preserve original extension but sanitize filename
            const timestamp = Date.now();
            const ext = path.extname(file.originalname);
            const name = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_');
            cb(null, `${name}_${timestamp}${ext}`);
        }
    });

    const upload = multer({
        storage,
        fileFilter: (req: any, file: any, cb: any) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (['.json', '.xls', '.xlsx', '.pdf'].includes(ext)) {
                cb(null, true);
            } else {
                cb(new Error('File type not supported'), false);
            }
        }
    });

    // Get all provider definitions (for dynamic form rendering)
    router.get('/definitions', (req, res) => {
        res.json({ success: true, data: PROVIDERS });
    });

    // Run a scrape with full options
    router.post('/scrape', async (req, res) => {
        const request: ScrapeRequest = req.body;
        if (!request.options) {
            (request as any).options = {};
        }
        if (!(request as any).options.runSource) {
            (request as any).options.runSource = 'manual';
        }
        if (!(request as any).options.initiatedBy) {
            (request as any).options.initiatedBy = 'manual';
        }

        // Validate required fields
        if (!request.companyId || (!request.credentials && !request.profileId)) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: companyId and either credentials or profileId are required'
            });
        }

        try {
            const result = await scraperService.runScrape(request);

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: result.error || 'Scrape failed',
                    data: result
                });
            }

            try {
                let { filename } = await storageService.saveScrapeResult(result, request.companyId);
                const scrapeLogId = (request as any).__scrapeRunLogId as string | undefined;
                if (scrapeLogId && filename) attachScrapeRunFilename(scrapeLogId, filename);

                // Handle automatic categorization if requested
                if (request.options.autoCategorize && result.transactions && result.transactions.length > 0) {
                    try {
                        console.log(`Auto-categorizing ${result.transactions.length} transactions for ${request.companyId}...`);
                        const { transactions: categorizedTransactions, aiError } = await aiService.categorizeTransactions(result.transactions);

                        // Update the result object and save it again
                        result.transactions = categorizedTransactions;
                        ({ filename } = await storageService.saveScrapeResult(result, request.companyId));
                        if (scrapeLogId && filename) attachScrapeRunFilename(scrapeLogId, filename);
                        await storageService.applyCategoryColumnsFromTransactions(categorizedTransactions);

                        console.log(`Auto-categorization complete for ${filename}`);
                        if (aiError) {
                            res.json({
                                success: true,
                                data: result,
                                filename,
                                warning: `Scrape saved; AI categorization failed but cached categories were applied where possible: ${aiError}`,
                                categorizationError: aiError,
                            });
                            return;
                        }
                    } catch (aiError: any) {
                        console.error('Auto-categorization failed:', aiError.message);
                        res.json({ success: true, data: result, filename, warning: `Scrape success, but auto-categorization failed: ${aiError.message}` });
                        return;
                    }
                }

                res.json({ success: true, data: result, filename });
            } catch (saveError: any) {
                // If save failed due to empty result, still return the result but without filename
                if (saveError.message.includes('empty result')) {
                    res.json({ success: true, data: result, filename: null, warning: saveError.message });
                } else {
                    throw saveError;
                }
            }
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Upload a JSON result file
    router.post('/results/upload', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }

            const targetPath = path.join(RESULTS_DIR, req.file.filename);
            await fs.move(req.file.path, targetPath);

            res.json({ success: true, filename: req.file.filename });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Upload multiple files for import (XLS, XLSX, PDF)
    router.post('/results/import', upload.array('files'), async (req, res) => {
        try {
            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                return res.status(400).json({ success: false, error: 'No files uploaded' });
            }

            const importResults = [];
            const { accountNumberOverride, useAi } = req.body;
            const useAiBool = useAi === 'true' || useAi === true;

            if (useAiBool && files.length > 1) {
                // Batch process multiple files with AI in one call
                try {
                    const results = await importService.importFilesBatchWithAi(files.map(f => f.path), accountNumberOverride);

                    for (const result of results) {
                        if (result.success) {
                            try {
                                const provider = result.transactions?.[0]?.provider || 'imported-batch';
                                const { filename } = await storageService.saveScrapeResult(result, provider);
                                importResults.push({ originalName: 'Batch AI Import', filename, success: true, count: result.transactions?.length || 0 });
                            } catch (saveError: any) {
                                importResults.push({ originalName: 'Batch AI Import', success: false, error: saveError.message });
                            }
                        } else {
                            importResults.push({ originalName: 'Batch AI Import', success: false, error: result.error });
                        }
                    }

                    // Clean up all temporary files
                    for (const file of files) {
                        await fs.remove(file.path).catch(() => { });
                    }

                    // Clean up uploads folder
                    try {
                        if (fs.existsSync(UPLOADS_DIR)) {
                            await fs.emptyDir(UPLOADS_DIR);
                        }
                    } catch (e) { }

                    return res.json({
                        success: importResults.some(r => r.success),
                        results: importResults,
                        allSuccessful: importResults.every(r => r.success)
                    });
                } catch (error: any) {
                    // Clean up all temporary files
                    for (const file of files) {
                        await fs.remove(file.path).catch(() => { });
                    }
                    return res.status(500).json({ success: false, error: error.message });
                }
            }

            for (const file of files) {
                try {
                    const result = await importService.importFile(file.path, accountNumberOverride, useAiBool);
                    if (result.success) {
                        try {
                            const { filename } = await storageService.saveScrapeResult(result, (result.transactions?.[0]?.provider || 'imported'));
                            importResults.push({ originalName: file.originalname, filename, success: true, count: result.transactions?.length || 0 });
                        } catch (saveError: any) {
                            // Skip files with empty results
                            if (saveError.message.includes('empty result')) {
                                importResults.push({ originalName: file.originalname, success: false, error: 'Empty result - no transactions or accounts found' });
                            } else {
                                throw saveError;
                            }
                        }
                    } else {
                        importResults.push({ originalName: file.originalname, success: false, error: result.error });
                    }
                } finally {
                    // Clean up temporary upload file
                    await fs.remove(file.path).catch(() => { });
                }
            }

            const someSuccessful = importResults.some(r => r.success);
            const allSuccessful = importResults.every(r => r.success);

            // Clean up all remaining files from uploads folder after import completes
            try {
                if (fs.existsSync(UPLOADS_DIR)) {
                    await fs.emptyDir(UPLOADS_DIR);
                }
            } catch (error) {
                // Log but don't fail the response
                console.warn('Failed to clean up uploads folder:', error);
            }

            res.json({
                success: someSuccessful,
                results: importResults,
                allSuccessful
            });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // List all scrape results with metadata
    router.get('/results', async (req, res) => {
        try {
            const files = await storageService.listScrapeResults();
            res.json({ success: true, data: files });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Rename a scrape result file
    router.post('/results/rename', async (req, res) => {
        try {
            const { oldFilename, newFilename } = req.body;
            if (!oldFilename || !newFilename) {
                return res.status(400).json({ success: false, error: 'Both oldFilename and newFilename are required' });
            }
            await storageService.renameFile(oldFilename, newFilename);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Get all aggregated transactions (Unified DB view), including ignored so user can unignore
    router.get('/results/all', async (req, res) => {
        try {
            const transactions = await storageService.getAllTransactions(true);
            res.json({ success: true, transactions });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Download unified transactions as CSV or JSON. Optional month=YYYY-MM limits to that calendar month.
    router.get('/results/export', async (req, res) => {
        try {
            const format = String(req.query.format || 'json').toLowerCase();
            const includeIgnored =
                req.query.includeIgnored !== '0' && String(req.query.includeIgnored).toLowerCase() !== 'false';
            const monthRaw = typeof req.query.month === 'string' ? req.query.month.trim() : '';
            if (monthRaw && !/^\d{4}-\d{2}$/.test(monthRaw)) {
                return res.status(400).json({ success: false, error: 'Invalid month. Use YYYY-MM.' });
            }

            if (format !== 'csv' && format !== 'json') {
                return res.status(400).json({ success: false, error: 'Invalid format. Use csv or json.' });
            }

            let transactions = await storageService.getAllTransactions(includeIgnored);
            if (monthRaw) {
                transactions = transactions.filter(
                    (t) => typeof t.date === 'string' && t.date.startsWith(monthRaw)
                );
            }
            const stamp = new Date().toISOString().slice(0, 10);
            const fileBase = monthRaw ? `transactions-${monthRaw}` : `transactions-${stamp}`;

            if (format === 'json') {
                const body = transactionsToJson(transactions);
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.json"`);
                return res.send(body);
            }

            const body = transactionsToCsv(transactions);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.csv"`);
            return res.send(body);
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Get a specific scrape result
    router.get('/results/:filename', async (req, res) => {
        try {
            const result = await storageService.getScrapeResult(req.params.filename);
            if (!result) {
                return res.status(404).json({ success: false, error: 'File not found' });
            }
            res.json({ success: true, data: result });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Delete a scrape result
    router.delete('/results/:filename', async (req, res) => {
        try {
            const { filename } = req.params;
            const success = await storageService.deleteScrapeResult(filename);
            if (!success) {
                return res.status(404).json({ success: false, error: 'File not found' });
            }
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Update a transaction's category in a result file
    router.put('/results/:filename/transactions/:transactionId/category', async (req, res) => {
        try {
            const { filename, transactionId } = req.params;
            const { category } = req.body;

            const success = await storageService.updateTransactionCategory(filename, transactionId, category);

            if (!success) {
                return res.status(404).json({ success: false, error: 'File or transaction not found' });
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Toggle a transaction's ignore status (Unified DB only)
    router.patch('/transactions/:transactionId/ignore', async (req, res) => {
        try {
            const { transactionId } = req.params;
            const { isIgnored } = req.body;

            const success = await storageService.toggleTransactionIgnore(transactionId, isIgnored);

            if (!success) {
                return res.status(404).json({ success: false, error: 'Transaction not found' });
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Update a transaction's type (Unified DB only)
    router.patch('/transactions/:transactionId/type', async (req, res) => {
        try {
            const { transactionId } = req.params;
            const { type } = req.body;

            const success = await storageService.updateTransactionTypeUnified(transactionId, type);

            if (!success) {
                return res.status(404).json({ success: false, error: 'Transaction not found' });
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Update a transaction's category (Unified DB only)
    router.put('/transactions/:transactionId/category', async (req, res) => {
        try {
            const { transactionId } = req.params;
            const { category } = req.body;

            const success = await storageService.updateTransactionCategoryUnified(transactionId, category);

            if (!success) {
                return res.status(404).json({ success: false, error: 'Transaction not found' });
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Update a transaction's memo (Unified DB only)
    router.patch('/transactions/:transactionId/memo', async (req, res) => {
        try {
            const { transactionId } = req.params;
            const { memo } = req.body;

            const success = await storageService.updateTransactionMemoUnified(transactionId, memo);

            if (!success) {
                return res.status(404).json({ success: false, error: 'Transaction not found' });
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Update a transaction's subscription status (Unified DB only)
    router.patch('/transactions/:transactionId/subscription', async (req, res) => {
        try {
            const { transactionId } = req.params;
            const { isSubscription, interval, excludeFromSubscriptions } = req.body;

            const success = await storageService.updateTransactionSubscriptionUnified(transactionId, isSubscription, interval, excludeFromSubscriptions);

            if (!success) {
                return res.status(404).json({ success: false, error: 'Transaction not found' });
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Get all exclusion filters
    router.get('/filters', async (req, res) => {
        try {
            const filters = await filterService.getFilters();
            res.json({ success: true, data: filters });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Add a new exclusion filter
    router.post('/filters', async (req, res) => {
        try {
            const { pattern } = req.body;
            const filter = await filterService.addFilter(pattern);
            res.json({ success: true, data: filter });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Delete a filter
    router.delete('/filters/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await filterService.removeFilter(id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Toggle a filter
    router.patch('/filters/:id/toggle', async (req, res) => {
        try {
            const { id } = req.params;
            await filterService.toggleFilter(id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Merge multiple scrape results into one file
    router.post('/results/merge', async (req, res) => {
        try {
            const { filenames, outputName, deleteOriginals } = req.body;

            if (!filenames || !Array.isArray(filenames) || filenames.length < 2) {
                return res.status(400).json({ success: false, error: 'Must provide at least 2 filenames to merge' });
            }

            if (!outputName || typeof outputName !== 'string') {
                return res.status(400).json({ success: false, error: 'Output name is required' });
            }

            const mergedFilename = await storageService.mergeResults(filenames, outputName, deleteOriginals === true);
            res.json({ success: true, filename: mergedFilename });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Reload database from files
    router.post('/results/reload', async (req, res) => {
        try {
            await storageService.reloadTransactionsFromFiles();
            res.json({ success: true, message: 'Database reloaded from JSON files' });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Factory reset: wipe data directory, clear filters, reload in-memory services
    router.post('/results/reset', async (req, res) => {
        try {
            console.log('[API] Received factory reset request');
            await storageService.wipeEntireDataDirectory();
            await filterService.clearAllFilters();
            await aiService.getSettings();
            schedulerService.reloadAfterDataWipe();
            notificationService.reloadConfigAfterFactoryReset();
            console.log('[API] Factory reset completed successfully');
            res.json({
                success: true,
                message: 'Data directory cleared and defaults restored. Reload the app; browser storage should be cleared client-side.'
            });
        } catch (error: any) {
            console.error('[API] Factory reset failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/backups/scopes', (_req, res) => {
        try {
            res.json({ success: true, data: [...BACKUP_SCOPE_IDS] });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // List local backups
    router.get('/backups/local', async (req, res) => {
        try {
            const backups = await backupService.listLocalBackups();
            res.json({ success: true, data: backups });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/backups/local/:filename/summary', async (req, res) => {
        try {
            const filename = req.params.filename;
            const data = await backupService.summarizeLocalBackupFile(filename);
            res.json({ success: true, data });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Download a local backup file
    router.get('/backups/local/:filename/download', async (req, res) => {
        try {
            const backupPath = backupService.getLocalBackupPath(req.params.filename);
            if (!await fs.pathExists(backupPath)) {
                return res.status(404).json({ success: false, error: 'Backup file not found' });
            }
            return res.download(backupPath, path.basename(backupPath));
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // Create backup (local or Google Drive)
    router.post('/backups/create', async (req, res) => {
        try {
            const destination = req.body?.destination === 'google-drive' ? 'google-drive' : 'local';
            const folderId = typeof req.body?.folderId === 'string' ? req.body.folderId : undefined;
            const scopes = normalizeBackupScopesParam(req.body?.scopes);

            const localBackup = await backupService.createLocalBackup(scopes);
            if (destination === 'local') {
                return res.json({
                    success: true,
                    data: {
                        destination,
                        local: localBackup
                    }
                });
            }

            const driveFile = await backupService.uploadLatestSnapshotToGoogleDrive(localBackup.path, folderId);
            res.json({
                success: true,
                data: {
                    destination,
                    local: localBackup,
                    drive: driveFile
                }
            });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Restore from local backup file
    router.post('/backups/restore/local', async (req, res) => {
        try {
            const filename = req.body?.filename;
            if (!filename || typeof filename !== 'string') {
                return res.status(400).json({ success: false, error: 'filename is required' });
            }

            const scopes = normalizeBackupScopesParam(req.body?.scopes);
            const { dbRestored, needsReloadFromFiles } = await backupService.restoreFromLocalBackup(filename, scopes);
            if (needsReloadFromFiles) {
                await storageService.reloadTransactionsFromFiles();
            } else if (dbRestored) {
                await storageService.reconcileInternalTransferFromRawData();
            }
            res.json({ success: true, message: 'Restore completed from local backup', dbRestored, needsReloadFromFiles });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // List backups in Google Drive
    router.get('/backups/drive', async (req, res) => {
        try {
            const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
            const files = await backupService.listDriveBackups(folderId);
            res.json({ success: true, data: files });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/backups/drive/:fileId/summary', async (req, res) => {
        try {
            const fileId = req.params.fileId;
            const data = await backupService.summarizeDriveBackupFile(fileId);
            res.json({ success: true, data });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Restore from Google Drive backup file
    router.post('/backups/restore/drive', async (req, res) => {
        try {
            const fileId = req.body?.fileId;
            if (!fileId || typeof fileId !== 'string') {
                return res.status(400).json({ success: false, error: 'fileId is required' });
            }

            const scopes = normalizeBackupScopesParam(req.body?.scopes);
            const { dbRestored, needsReloadFromFiles } = await backupService.restoreFromDriveBackup(fileId, scopes);
            if (needsReloadFromFiles) {
                await storageService.reloadTransactionsFromFiles();
            } else if (dbRestored) {
                await storageService.reconcileInternalTransferFromRawData();
            }
            res.json({ success: true, message: 'Restore completed from Google Drive backup', dbRestored, needsReloadFromFiles });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Restore from uploaded backup snapshot JSON
    router.post('/backups/restore/upload', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No backup file uploaded' });
            }

            const scopes = normalizeBackupScopesParam(req.body?.scopes);
            const { dbRestored, needsReloadFromFiles } = await backupService.restoreFromUploadedBackup(req.file.path, scopes);
            if (needsReloadFromFiles) {
                await storageService.reloadTransactionsFromFiles();
            } else if (dbRestored) {
                await storageService.reconcileInternalTransferFromRawData();
            }
            await fs.remove(req.file.path).catch(() => {});
            res.json({ success: true, message: 'Restore completed from uploaded backup', dbRestored, needsReloadFromFiles });
        } catch (error: any) {
            if (req.file?.path) {
                await fs.remove(req.file.path).catch(() => {});
            }
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Get global scrape configuration
    router.get('/config', async (req, res) => {
        try {
            const config = await storageService.getGlobalScrapeConfig();
            res.json({ success: true, data: config });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Update global scrape configuration
    router.put('/config', async (req, res) => {
        try {
            const config = await storageService.updateGlobalScrapeConfig(req.body);
            res.json({ success: true, data: config });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}
