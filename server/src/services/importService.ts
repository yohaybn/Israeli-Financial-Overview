import * as xlsx from 'xlsx';
import { PDFParse } from 'pdf-parse';
import { Transaction, ScrapeResult, Account } from '@app/shared';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { AiService } from './aiService';

export class ImportService {
    constructor(private aiService?: AiService) { }
    async importFiles(filePaths: string[]): Promise<ScrapeResult[]> {
        const results: ScrapeResult[] = [];
        for (const filePath of filePaths) {
            results.push(await this.importFile(filePath));
        }
        return results;
    }

    async importFilesBatchWithAi(filePaths: string[], accountNumberOverride?: string): Promise<ScrapeResult[]> {
        const startTime = Date.now();
        const logs: string[] = [];

        if (!this.aiService) {
            throw new Error('AI Service not configured for batch import');
        }

        logs.push(`Batch importing ${filePaths.length} files with AI...`);
        let combinedText = '';

        for (const filePath of filePaths) {
            const buffer = await fs.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            let text = '';

            logs.push(`Extracting text from: ${path.basename(filePath)}`);
            if (ext === '.pdf') {
                const parser = new PDFParse({ data: buffer });
                try {
                    const data = await parser.getText();
                    text = data.text;
                } finally {
                    await parser.destroy();
                }
            } else if (ext === '.json') {
                text = buffer.toString();
            } else {
                const workbook = xlsx.read(buffer, { type: 'buffer' });
                text = workbook.SheetNames.map(name => {
                    const sheet = workbook.Sheets[name];
                    return `Sheet: ${name}\n${xlsx.utils.sheet_to_csv(sheet)}`;
                }).join('\n\n');
            }

            combinedText += `\n--- START OF FILE: ${path.basename(filePath)} ---\n${text}\n--- END OF FILE: ${path.basename(filePath)} ---\n`;
        }

        logs.push(`Sending combined text (${combinedText.length} chars) to AI...`);
        try {
            const result = await this.aiService.parseDocument(combinedText, 'imported-batch', accountNumberOverride || 'imported');
            logs.push(`Batch AI parsing complete. Found ${result.transactions.length} transactions total.`);

            // For now, we return a single ScrapeResult wrapping everything as it's a batch result
            // but the route expects an array of results. We'll return one main result and empty ones if needed,
            // or modify the route to handle a single batch result.
            // Better: return one result containing all transactions.
            return [{
                success: true,
                accounts: result.accounts,
                transactions: result.transactions,
                logs,
                executionTimeMs: Date.now() - startTime
            }];
        } catch (error: any) {
            logs.push(`Batch AI import failed: ${error.message}`);
            return [{
                success: false,
                error: error.message,
                logs,
                executionTimeMs: Date.now() - startTime
            }];
        }
    }

    async importFile(filePath: string, accountNumberOverride?: string, useAi: boolean = false): Promise<ScrapeResult> {
        const startTime = Date.now();
        const logs: string[] = [];
        const ext = path.extname(filePath).toLowerCase();

        try {
            const buffer = await fs.readFile(filePath);
            logs.push(`Importing file: ${path.basename(filePath)} (${ext})`);

            let result: { transactions: Transaction[], accounts: Account[] };

            if (useAi && this.aiService) {
                logs.push(`Using AI to parse file: ${path.basename(filePath)}`);
                let text = '';
                if (ext === '.pdf') {
                    const parser = new PDFParse({ data: buffer });
                    try {
                        const data = await parser.getText();
                        text = data.text;
                    } finally {
                        await parser.destroy();
                    }
                } else if (ext === '.json') {
                    text = buffer.toString();
                } else {
                    // Excel
                    const workbook = xlsx.read(buffer, { type: 'buffer' });
                    text = workbook.SheetNames.map(name => {
                        const sheet = workbook.Sheets[name];
                        return `Sheet: ${name}\n${xlsx.utils.sheet_to_csv(sheet)}`;
                    }).join('\n\n');
                }

                result = await this.aiService.parseDocument(text, 'imported', accountNumberOverride || 'imported');
                logs.push(`AI parsing complete. Found ${result.transactions.length} transactions.`);
            } else if (ext === '.pdf') {
                result = await this.parsePdf(buffer, logs);
                // Apply override if provided
                if (accountNumberOverride && result.transactions.length > 0) {
                    result.transactions.forEach(t => t.accountNumber = accountNumberOverride);
                    result.accounts.forEach(a => a.accountNumber = accountNumberOverride);
                }
            } else if (ext === '.json') {
                const data = JSON.parse(buffer.toString());
                // Basic validation that it looks like a ScrapeResult
                if (data && (data.transactions || data.accounts)) {
                    result = {
                        transactions: data.transactions || [],
                        accounts: data.accounts || []
                    };
                    logs.push(`Loaded JSON result with ${result.transactions.length} transactions`);
                } else {
                    throw new Error('Invalid JSON format for scrape result');
                }
            } else {
                // xls, xlsx, or other spreadsheet formats supported by xlsx
                const workbook = xlsx.read(buffer, { type: 'buffer' });

                let allTransactions: Transaction[] = [];
                let allAccounts: Account[] = [];

                logs.push(`Parsing workbook with ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`);

                // First pass: Detect account number across all sheets
                let detectedAccountNumber = accountNumberOverride || 'imported';
                if (!accountNumberOverride) {
                    for (const sheetName of workbook.SheetNames) {
                        const sheet = workbook.Sheets[sheetName];
                        const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                        const acc = this.detectAccountNumber(rows);
                        if (acc) {
                            detectedAccountNumber = acc;
                            logs.push(`Detected account number in sheet "${sheetName}": ${detectedAccountNumber}`);
                            break;
                        }
                    }
                } else {
                    logs.push(`Using manual account number override: ${accountNumberOverride}`);
                }

                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });

                    if (rows.length === 0) continue;

                    logs.push(`Checking sheet "${sheetName}" with ${rows.length} rows`);

                    // Detect format
                    let sheetResult: { transactions: Transaction[], accounts: Account[] };
                    if (this.isMizrahiTefahot(rows)) {
                        sheetResult = this.parseMizrahiTefahot(rows, logs);
                        // Apply detected/override account number to Mizrahi if it found one
                        if (detectedAccountNumber !== 'imported') {
                            sheetResult.transactions.forEach(t => t.accountNumber = detectedAccountNumber);
                            sheetResult.accounts.forEach(a => a.accountNumber = detectedAccountNumber);
                        }
                    } else {
                        sheetResult = this.parseGenericSpreadsheet(rows, logs, detectedAccountNumber);
                    }

                    if (sheetResult.transactions.length > 0) {
                        logs.push(`Found ${sheetResult.transactions.length} transactions in sheet "${sheetName}"`);
                        allTransactions = [...allTransactions, ...sheetResult.transactions];
                        allAccounts = [...allAccounts, ...sheetResult.accounts];
                    }
                }

                result = {
                    transactions: allTransactions,
                    accounts: allAccounts
                };
            }

            const executionTimeMs = Date.now() - startTime;
            const success = result.transactions.length > 0;

            return {
                success,
                error: success ? undefined : 'No transactions were found in the file.',
                accounts: result.accounts,
                transactions: result.transactions,
                logs,
                executionTimeMs,
            };

        } catch (error: any) {
            logs.push(`Error importing file ${path.basename(filePath)}: ${error.message}`);
            return {
                success: false,
                error: error.message,
                logs,
                executionTimeMs: Date.now() - startTime,
            };
        }
    }

    private isMizrahiTefahot(rows: any[][]): boolean {
        const rowStr = rows.slice(0, 10).map(r => r.join(' ')).join(' ');
        return rowStr.includes('מספר חשבון:') && (rowStr.includes('תאריך') || rowStr.includes('סוג תנועה'));
    }

    private detectAccountNumber(rows: any[][]): string | null {
        for (let i = 0; i < Math.min(rows.length, 50); i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const rowStr = row.join(' ');

            // Match Patterns: "מספר חשבון: 123-456", "חשבון מס: 123", "כרטיס מס: 1234"
            const accMatch = rowStr.match(/(?:מספר חשבון|חשבון מס|חשבון|כרטיס|מספר)\s*[:\-]*\s*([\d-]+)/);
            if (accMatch && accMatch[1]) {
                return accMatch[1];
            }
        }
        return null;
    }

    private async parsePdf(buffer: Buffer, logs: string[]): Promise<{ transactions: Transaction[], accounts: Account[] }> {
        const parser = new PDFParse({ data: buffer });
        let text = '';
        try {
            const data = await parser.getText();
            text = data.text;
        } finally {
            await parser.destroy();
        }
        logs.push(`Extracted ${text.length} characters from PDF`);

        const transactions: Transaction[] = [];
        let provider = 'unknown';
        let accountNumber = 'unknown';

        // Detect provider
        if (text.includes('ישראכרט') || text.includes('Isracard')) {
            provider = 'isracard';
        } else if (text.includes('MAX') || text.includes('מקס')) {
            provider = 'max';
        } else if (text.includes('מזרחי') || text.includes('Mizrahi')) {
            provider = 'mizrahi';
        }

        logs.push(`Detected provider from PDF: ${provider}`);

        // Very basic generic regex-based parsing for dates and amounts
        const lines = text.split('\n');
        for (const line of lines) {
            const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{2,4})/);
            if (dateMatch) {
                const dateStr = dateMatch[1];
                const date = this.parseDate(dateStr);
                if (!date) continue;

                const amountMatches = line.match(/-?\d{1,3}(,\d{3})*(\.\d{2})?/g);
                if (amountMatches) {
                    const lastAmount = amountMatches[amountMatches.length - 1];
                    const amount = this.parseNumber(lastAmount);

                    if (amount !== 0) {
                        transactions.push({
                            id: uuidv4(),
                            date: date.toISOString(),
                            processedDate: date.toISOString(),
                            description: line.replace(dateStr, '').replace(lastAmount, '').trim(),
                            amount: amount,
                            chargedAmount: amount,
                            originalAmount: amount,
                            originalCurrency: 'ILS',
                            status: 'completed',
                            provider,
                            accountNumber,
                        });
                    }
                }
            }
        }

        logs.push(`Parsed ${transactions.length} transactions from PDF`);
        const accounts: Account[] = transactions.length > 0 ? [{ accountNumber, provider }] : [];
        return { transactions, accounts };
    }

    private parseMizrahiTefahot(rows: any[][], logs: string[]): { transactions: Transaction[], accounts: Account[] } {
        const transactions: Transaction[] = [];
        let accountNumber = 'unknown';
        let headerRowIndex = -1;

        const COL_DATE = 'תאריך';
        const COL_DESCRIPTION = 'סוג תנועה';
        const COL_CREDIT = 'זכות';
        const COL_DEBIT = 'חובה';
        const COL_REFERENCE = 'אסמכתא';

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const rowStr = row.join(' ');

            if (rowStr.includes('מספר חשבון:')) {
                const accMatch = rowStr.match(/מספר חשבון:\s*([\d-]+)/);
                if (accMatch) {
                    accountNumber = accMatch[1];
                }
                continue;
            }

            if (headerRowIndex === -1) {
                const hasDate = row.some(cell => typeof cell === 'string' && cell.includes(COL_DATE));
                if (hasDate) {
                    headerRowIndex = i;
                }
                continue;
            }

            if (headerRowIndex !== -1 && i > headerRowIndex) {
                const headers = rows[headerRowIndex].map(h => String(h).trim());
                const getCell = (name: string) => {
                    const idx = headers.findIndex(h => h.includes(name));
                    return idx !== -1 ? row[idx] : undefined;
                };

                const dateStr = getCell(COL_DATE);
                const description = getCell(COL_DESCRIPTION);

                if (!dateStr || !description) continue;

                const date = this.parseDate(String(dateStr));
                if (!date) continue;

                const credit = this.parseNumber(getCell(COL_CREDIT));
                const debit = this.parseNumber(getCell(COL_DEBIT));
                const amount = credit > 0 ? credit : -debit;

                if (amount === 0) continue;

                transactions.push({
                    id: uuidv4(),
                    date: date.toISOString(),
                    processedDate: date.toISOString(),
                    description: String(description).trim(),
                    amount: amount,
                    chargedAmount: amount,
                    originalAmount: amount,
                    originalCurrency: 'ILS',
                    status: 'completed',
                    provider: 'mizrahi',
                    accountNumber: accountNumber,
                    memo: `Ref: ${getCell(COL_REFERENCE) || ''}`.trim()
                });
            }
        }

        return { transactions, accounts: accountNumber !== 'unknown' ? [{ accountNumber, provider: 'mizrahi' }] : [] };
    }

    private parseGenericSpreadsheet(rows: any[][], logs: string[], defaultAccountNumber: string = 'imported'): { transactions: Transaction[], accounts: Account[] } {
        const transactions: Transaction[] = [];
        let headerRowIndex = -1;

        for (let i = 0; i < Math.min(rows.length, 100); i++) {
            const row = rows[i];
            if (!row || row.length < 2) continue;

            const rowStr = row.join(' ').toLowerCase();
            if ((rowStr.includes('date') || rowStr.includes('תאריך') || rowStr.includes('ת.ערך') || rowStr.includes('רכישה')) &&
                (rowStr.includes('desc') || rowStr.includes('תיאור') || rowStr.includes('תנועה') || rowStr.includes('פרטים')) &&
                (rowStr.includes('amount') || rowStr.includes('סכום') || rowStr.includes('חובה') || rowStr.includes('זכות') || rowStr.includes('חיוב') || rowStr.includes('יתרה'))) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            return { transactions: [], accounts: [] };
        }

        const headers = rows[headerRowIndex].map(h => String(h).toLowerCase());
        const findCol = (terms: string[]) => headers.findIndex(h => terms.some(t => h.includes(t)));

        const dateIdx = findCol(['date', 'תאריך', 'ת.ערך', 'יום', 'רכישה']);
        const descIdx = findCol(['desc', 'תיאור', 'תנועה', 'בית עסק', 'פרטים', 'שם בית העסק']);
        const amountIdx = findCol(['amount', 'סכום', 'חיוב', 'בש"ח', 'סה"כ']);
        const creditIdx = findCol(['credit', 'זכות', 'בוצע', 'הפקדה']);
        const debitIdx = findCol(['debit', 'חובה', 'משיכה']);

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const dateStr = String(row[dateIdx]);
            const date = this.parseDate(dateStr);
            if (!date) continue;

            let amount = 0;
            if (amountIdx !== -1) {
                amount = this.parseNumber(row[amountIdx]);
            } else if (creditIdx !== -1 || debitIdx !== -1) {
                const credit = this.parseNumber(row[creditIdx]);
                const debit = this.parseNumber(row[debitIdx]);
                amount = credit > 0 ? credit : -debit;
            }

            if (amount === 0) continue;

            transactions.push({
                id: uuidv4(),
                date: date.toISOString(),
                processedDate: date.toISOString(),
                description: String(row[descIdx] || 'No description').trim(),
                amount: amount,
                chargedAmount: amount,
                originalAmount: amount,
                originalCurrency: 'ILS',
                status: 'completed',
                provider: 'imported',
                accountNumber: defaultAccountNumber,
            });
        }

        const accounts: Account[] = transactions.length > 0 ? [{ accountNumber: defaultAccountNumber, provider: 'imported', balance: 0, currency: 'ILS' }] : [];
        return { transactions, accounts };
    }

    private parseDate(dateStr: string): Date | null {
        if (!dateStr) return null;
        const cleanDate = String(dateStr).trim();
        const parts = cleanDate.split(/[\/\.]/);
        if (parts.length !== 3) return null;

        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);

        if (year < 100) year += 2000;
        if (year < 1900 || year > 2100) return null;

        const date = new Date(year, month, day, 12, 0, 0);
        return isNaN(date.getTime()) ? null : date;
    }

    private parseNumber(val: any): number {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return val;
        const clean = String(val).replace(/[^\d.-]/g, '');
        const parsed = parseFloat(clean);
        return isNaN(parsed) ? 0 : parsed;
    }
}
