import { google } from 'googleapis';
import { GoogleAuthService } from './googleAuthService.js';
import { Transaction } from '@app/shared';
import { serverLogger } from '../utils/logger.js';
import * as crypto from 'crypto';
import { generateTransactionId } from '../utils/idGenerator.js';
import path from 'path';
import fs from 'fs-extra';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const FOLDER_CONFIG_PATH = path.join(DATA_DIR, 'config', 'google_folder.json');

export interface FolderConfig {
    folderId: string;
    folderName?: string;
}

export class SheetsService {
    private authService: GoogleAuthService;

    constructor() {
        this.authService = new GoogleAuthService();
    }

    async getFolderConfig(): Promise<FolderConfig | null> {
        // First check if stored config exists
        if (await fs.pathExists(FOLDER_CONFIG_PATH)) {
            return await fs.readJson(FOLDER_CONFIG_PATH);
        }
        // Check environment variable
        const envFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        if (envFolderId) {
            return { folderId: envFolderId, folderName: 'Default (from .env)' };
        }
        return null;
    }

    async setFolderConfig(config: FolderConfig): Promise<void> {
        await fs.ensureDir(path.dirname(FOLDER_CONFIG_PATH));
        await fs.writeJson(FOLDER_CONFIG_PATH, config, { spaces: 2 });
        serverLogger.info(`Google Drive folder configured: ${config.folderId}`);
    }

    async clearFolderConfig(): Promise<void> {
        if (await fs.pathExists(FOLDER_CONFIG_PATH)) {
            await fs.remove(FOLDER_CONFIG_PATH);
            serverLogger.info('Google Drive folder configuration cleared');
        }
    }

    async listSpreadsheets(folderId?: string) {
        const auth = await this.authService.getClient();
        const drive = google.drive({ version: 'v3', auth });

        try {
            let query = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";

            // If a folder ID is provided, filter by that folder
            if (folderId) {
                query = `${query} and '${folderId}' in parents`;
            }

            const response = await drive.files.list({
                q: query,
                fields: 'files(id, name)',
            });

            return response.data.files || [];
        } catch (error: any) {
            serverLogger.error('Failed to list spreadsheets:', error);
            throw error;
        }
    }

    async createSpreadsheet(name: string) {
        const auth = await this.authService.getClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const drive = google.drive({ version: 'v3', auth });

        try {
            const response = await sheets.spreadsheets.create({
                requestBody: {
                    properties: {
                        title: name,
                    },
                },
            });

            const spreadsheetId = response.data.spreadsheetId;
            if (!spreadsheetId) throw new Error('Failed to create spreadsheet');

            // Initialize headers
            await this.initializeHeaders(spreadsheetId);

            // Move to configured folder if set
            const folderConfig = await this.getFolderConfig();
            if (folderConfig?.folderId) {
                try {
                    await drive.files.update({
                        fileId: spreadsheetId,
                        addParents: folderConfig.folderId,
                        fields: 'id, parents',
                    });
                    serverLogger.info(`Spreadsheet moved to folder: ${folderConfig.folderId}`);
                } catch (err: any) {
                    serverLogger.warn(`Could not move spreadsheet to folder: ${err.message}`);
                }
            }

            return response.data;
        } catch (error: any) {
            serverLogger.error('Failed to create spreadsheet:', error);
            throw error;
        }
    }

    private async initializeHeaders(spreadsheetId: string) {
        const auth = await this.authService.getClient();
        const sheets = google.sheets({ version: 'v4', auth });

        const headers = [['ID', 'Date', 'Processed Date', 'Description', 'Memo', 'Amount', 'Original Amount', 'Original Currency', 'Charged Amount', 'Status', 'Category', 'Provider', 'Account Number']];

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Sheet1!A1',
            valueInputOption: 'RAW',
            requestBody: {
                values: headers,
            },
        });
    }


    private async getExistingData(spreadsheetId: string) {
        const auth = await this.authService.getClient();
        const sheets = google.sheets({ version: 'v4', auth });

        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Sheet1!A1:M',
            });

            return response.data.values || [];
        } catch (error: any) {
            serverLogger.error('Failed to get existing data from sheet:', error);
            throw error;
        }
    }

    private validateSheetStructure(headers: string[]): boolean {
        const expectedHeaders = ['ID', 'Date', 'Processed Date', 'Description', 'Memo', 'Amount', 'Original Amount', 'Original Currency', 'Charged Amount', 'Status', 'Category', 'Provider', 'Account Number'];
        return JSON.stringify(headers) === JSON.stringify(expectedHeaders);
    }

    async appendTransactions(spreadsheetId: string, transactions: Transaction[]) {
        const auth = await this.authService.getClient();
        const sheets = google.sheets({ version: 'v4', auth });

        try {
            // Get existing data
            const existingData = await this.getExistingData(spreadsheetId);

            if (existingData.length === 0) {
                // Sheet is empty, initialize headers and add transactions
                await this.initializeHeaders(spreadsheetId);
                existingData.push(['ID', 'Date', 'Processed Date', 'Description', 'Memo', 'Amount', 'Original Amount', 'Original Currency', 'Charged Amount', 'Status', 'Category', 'Provider', 'Account Number']);
            }

            // Validate structure
            const headers = existingData[0] as string[];
            if (!this.validateSheetStructure(headers)) {
                serverLogger.warn('Sheet structure does not match expected format. Creating new headers.');
                await this.initializeHeaders(spreadsheetId);
                existingData[0] = headers; // Keep existing but log warning
            }

            // Build a map of existing transactions by ID and their row numbers
            const existingIdMap = new Map<string, number>();
            for (let i = 1; i < existingData.length; i++) {
                const row = existingData[i] as any[];
                if (row[0]) {
                    existingIdMap.set(row[0], i + 1); // Row numbers are 1-based
                }
            }

            // Process transactions
            const newTransactions: Transaction[] = [];
            const updates: Array<{ rowIndex: number; category: string }> = [];

            for (const transaction of transactions) {
                // Generate ID if missing
                let txnId = transaction.id;
                if (!txnId) {
                    txnId = generateTransactionId(transaction);
                    transaction.id = txnId;
                }

                // Check if transaction exists
                const existingRowNumber = existingIdMap.get(txnId);
                if (existingRowNumber !== undefined) {
                    // Transaction exists, queue category update if different
                    const existingRow = existingData[existingRowNumber - 1] as any[];
                    const existingCategory = existingRow[10] || ''; // Category is at index 10
                    const newCategory = transaction.category || '';

                    if (existingCategory !== newCategory) {
                        updates.push({
                            rowIndex: existingRowNumber,
                            category: newCategory
                        });
                        serverLogger.info(`Will update category for transaction ID ${txnId} from "${existingCategory}" to "${newCategory}"`);
                    }
                } else {
                    // New transaction
                    newTransactions.push(transaction);
                }
            }

            // Apply category updates
            for (const update of updates) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `Sheet1!K${update.rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: [[update.category]],
                    },
                });
            }

            // Add new transactions
            if (newTransactions.length > 0) {
                const newValues = newTransactions.map(t => [
                    t.id,
                    t.date,
                    t.processedDate,
                    t.description,
                    t.memo || '',
                    t.amount,
                    t.originalAmount,
                    t.originalCurrency,
                    t.chargedAmount,
                    t.status,
                    t.category || '',
                    t.provider,
                    t.accountNumber
                ]);

                await sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range: 'Sheet1!A2',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: newValues,
                    },
                });

                serverLogger.info(`Successfully added ${newTransactions.length} new transactions to spreadsheet ${spreadsheetId}`);
            }

            serverLogger.info(`Sync complete: ${updates.length} updated, ${newTransactions.length} new, ${transactions.length - newTransactions.length - updates.length} duplicates (no changes)`);
        } catch (error: any) {
            serverLogger.error('Failed to sync transactions to sheet:', error);
            throw error;
        }
    }
}
