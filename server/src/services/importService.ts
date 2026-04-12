import * as xlsx from '@e965/xlsx';
import { PDFParse } from 'pdf-parse';
import {
    Transaction,
    ScrapeResult,
    Account,
    assignTransactionId,
    type AssignTransactionIdInput,
    type AssignTransactionIdResult,
} from '@app/shared';
import type { TabularImportProfileV1 } from '@app/shared';
import fs from 'fs-extra';
import path from 'path';
import { AiService } from './aiService.js';
import { parseTabularSpreadsheet } from './tabularImportParse.js';

export class ImportService {
    constructor(private aiService?: AiService) { }

    private assignImportId(args: Omit<AssignTransactionIdInput, 'existingId'>): AssignTransactionIdResult {
        return assignTransactionId({ ...args, existingId: undefined });
    }
    async importFiles(filePaths: string[]): Promise<ScrapeResult[]> {
        const results: ScrapeResult[] = [];
        for (const filePath of filePaths) {
            results.push(await this.importFile(filePath));
        }
        return results;
    }

    async importFilesBatchWithAi(
        filePaths: string[],
        accountNumberOverride?: string,
        providerTarget?: string
    ): Promise<ScrapeResult[]> {
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
            const provider = providerTarget || 'imported-batch';
            const account = accountNumberOverride || 'imported';
            const result = await this.aiService.parseDocument(combinedText, provider, account);
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

    async importFile(
        filePath: string,
        accountNumberOverride?: string,
        useAi: boolean = false,
        providerTarget?: string,
        tabularProfile?: TabularImportProfileV1 | null
    ): Promise<ScrapeResult> {
        const startTime = Date.now();
        const logs: string[] = [];
        const ext = path.extname(filePath).toLowerCase();
        const spreadsheetExt = ext === '.xls' || ext === '.xlsx';
        const useAiEffective =
            Boolean(useAi && this.aiService) && !(tabularProfile && spreadsheetExt);

        try {
            const buffer = await fs.readFile(filePath);
            logs.push(`Importing file: ${path.basename(filePath)} (${ext})`);
            if (tabularProfile && spreadsheetExt) {
                logs.push(`Using custom tabular import profile: ${tabularProfile.name || tabularProfile.id || 'unnamed'}`);
            }

            let result: { transactions: Transaction[], accounts: Account[] };

            if (useAiEffective) {
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

                const provider = providerTarget || 'imported';
                const account = accountNumberOverride || 'imported';
                result = await this.aiService!.parseDocument(text, provider, account);
                logs.push(`AI parsing complete. Found ${result.transactions.length} transactions.`);
            } else if (ext === '.pdf') {
                const pdfText = await this.extractPdfText(buffer);
                logs.push(`Extracted ${pdfText.length} characters from PDF`);

                let detectedAccountPdf = accountNumberOverride || 'imported';
                if (!accountNumberOverride) {
                    const fromFile = this.detectIsracardAccountFromFilename(path.basename(filePath));
                    if (fromFile) {
                        detectedAccountPdf = fromFile;
                        logs.push(`Detected account from filename pattern (Isracard): ${detectedAccountPdf}`);
                    }
                    const fromPdfLine = this.detectIsracardLastFourFromPdfText(pdfText);
                    if (fromPdfLine && detectedAccountPdf === 'imported') {
                        detectedAccountPdf = fromPdfLine;
                        logs.push(`Detected account from Isracard PDF card line: ${detectedAccountPdf}`);
                    }
                } else {
                    logs.push(`Using manual account number override: ${accountNumberOverride}`);
                }

                if (this.isIsracardPdfText(pdfText, providerTarget)) {
                    result = this.parseIsracardPdfText(pdfText, logs, detectedAccountPdf);
                    if (result.transactions.length === 0) {
                        logs.push('Isracard PDF parser found no rows; falling back to generic PDF parser');
                        result = this.parseGenericPdfText(pdfText, logs);
                    }
                } else {
                    result = this.parseGenericPdfText(pdfText, logs);
                }

                if (accountNumberOverride && result.transactions.length > 0) {
                    result.transactions.forEach(t => { t.accountNumber = accountNumberOverride; });
                    result.accounts.forEach(a => { a.accountNumber = accountNumberOverride; });
                } else if (!accountNumberOverride && detectedAccountPdf !== 'imported' && result.transactions.length > 0) {
                    const needs = result.transactions.some(
                        t => t.accountNumber === 'unknown' || t.accountNumber === 'imported'
                    );
                    if (needs) {
                        result.transactions.forEach(t => { t.accountNumber = detectedAccountPdf; });
                        result.accounts.forEach(a => { a.accountNumber = detectedAccountPdf; });
                    }
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

                let detectedAccountNumber = accountNumberOverride || 'imported';
                if (!accountNumberOverride) {
                    for (const sheetName of workbook.SheetNames) {
                        const sheet = workbook.Sheets[sheetName];
                        const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                        const ir = this.detectIsracardLastFourFromRows(rows);
                        if (ir) {
                            detectedAccountNumber = ir;
                            logs.push(`Detected account from Isracard card line in sheet "${sheetName}": ${detectedAccountNumber}`);
                            break;
                        }
                        const acc = this.detectAccountNumber(rows);
                        if (acc) {
                            detectedAccountNumber = acc;
                            logs.push(`Detected account number in sheet "${sheetName}": ${detectedAccountNumber}`);
                            break;
                        }
                    }
                    if (detectedAccountNumber === 'imported') {
                        const fromFile = this.detectIsracardAccountFromFilename(path.basename(filePath));
                        if (fromFile) {
                            detectedAccountNumber = fromFile;
                            logs.push(`Detected account from filename pattern (Isracard): ${detectedAccountNumber}`);
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

                    let sheetResult: { transactions: Transaction[], accounts: Account[] };
                    if (tabularProfile) {
                        const names = tabularProfile.sheetNames;
                        if (names && names.length > 0 && !names.includes(sheetName)) {
                            logs.push(`Sheet "${sheetName}" skipped (not listed in import profile)`);
                            continue;
                        }
                        sheetResult = parseTabularSpreadsheet(rows, tabularProfile, logs, detectedAccountNumber);
                    } else if (this.isMizrahiTefahot(rows)) {
                        sheetResult = this.parseMizrahiTefahot(rows, logs);
                        if (detectedAccountNumber !== 'imported') {
                            sheetResult.transactions.forEach(t => t.accountNumber = detectedAccountNumber);
                            sheetResult.accounts.forEach(a => a.accountNumber = detectedAccountNumber);
                        }
                    } else if (this.isIsracardStatementExport(rows, sheetName, providerTarget)) {
                        sheetResult = this.parseIsracardStatement(rows, logs, detectedAccountNumber);
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

    private detectIsracardLastFourFromRows(rows: any[][]): string | null {
        for (let i = 0; i < Math.min(rows.length, 40); i++) {
            const row = rows[i];
            if (!row) continue;
            for (const cell of row) {
                const s = String(cell);
                const m = s.match(/-\s*(\d{4})\s*$/);
                if (m && /^[0-9]{4}$/.test(m[1])) {
                    return m[1];
                }
            }
        }
        return null;
    }

    private detectIsracardAccountFromFilename(basename: string): string | null {
        const m = basename.match(/^(\d{4})_\d{2}_\d{4}\.(xlsx|pdf)$/i);
        return m ? m[1] : null;
    }

    private detectIsracardLastFourFromPdfText(text: string): string | null {
        for (const line of text.split(/\r?\n/)) {
            const s = this.normalizeCellText(line);
            const pipe = s.match(/^(\d{4})\s*\|/);
            if (pipe) return pipe[1];
            const dash = s.match(/-\s*(\d{4})\s*$/);
            if (dash && /^[0-9]{4}$/.test(dash[1])) return dash[1];
        }
        return null;
    }

    private isIsracardPdfText(text: string, providerTarget?: string): boolean {
        if (providerTarget === 'isracard') return true;
        const t = text.replace(/[\u200e\u200f\u202a-\u202e]/g, '');
        if (!(t.includes('ישראכרט') || t.includes('Isracard'))) return false;
        return (
            t.includes('שובר') ||
            t.includes('פירוט עסקאות') ||
            /תאריך\s*רכישה|רכישה.*תאריך/.test(t) ||
            /\d{8,12}\s+₪/.test(t)
        );
    }

    private parseIsracardPdfAmountToken(tok: string): number {
        const clean = tok.replace(/[₪$\s]/g, '').replace(/,/g, '');
        const n = parseFloat(clean);
        return Number.isFinite(n) ? Math.abs(n) : 0;
    }

    private tryParseIsracardPdfTransactionLine(line: string, accountNumber: string): Transaction | null {
        let s = line.trim();
        const tags: string[] = [];
        for (;;) {
            const m = /^(קבע הוראת|חו"ל אתר)\s+/.exec(s);
            if (!m) break;
            tags.push(m[1]);
            s = s.slice(m[0].length).trim();
        }

        const instRe =
            /^(\d{1,2})\s+מתוך\s+(\d{1,2})\s+תשלום\s+(\d{8,12})\s+(₪[^\s]+)\s+(₪[^\s]+)\s+(.+?)\s+(\d{2}\.\d{2}\.\d{2})\s*$/;
        const inst = instRe.exec(s);
        if (inst) {
            let nPay = parseInt(inst[1], 10);
            let nTot = parseInt(inst[2], 10);
            if (nPay > nTot && nTot > 0 && nPay <= 36) [nPay, nTot] = [nTot, nPay];
            const voucher = inst[3];
            const chgAbs = this.parseIsracardPdfAmountToken(inst[4]);
            const origAbs = this.parseIsracardPdfAmountToken(inst[5]);
            const desc = inst[6].trim();
            const date = this.parseDate(inst[7]);
            if (!date || chgAbs === 0) return null;
            const memoExtra = `תשלום ${nPay} מתוך ${nTot}`;
            const memo = [...tags, memoExtra].filter(Boolean).join(' · ');
            const chargedSigned = -chgAbs;
            const originalSigned = -origAbs;
            const ids = this.assignImportId({
                provider: 'isracard',
                accountNumber,
                date: date.toISOString(),
                amount: chargedSigned,
                chargedAmount: chargedSigned,
                description: desc,
                externalId: voucher,
                sourceRef: 'import:isracard-pdf',
            });
            return {
                ...ids,
                date: date.toISOString(),
                processedDate: date.toISOString(),
                description: desc,
                memo,
                amount: chargedSigned,
                chargedAmount: chargedSigned,
                originalAmount: originalSigned,
                originalCurrency: 'ILS',
                chargedCurrency: 'ILS',
                status: 'completed',
                provider: 'isracard',
                accountNumber,
                txnType: 'expense',
                type: 'installments',
                installments: { number: nPay, total: nTot },
            };
        }

        const foreignRe =
            /^(\d{8,12})\s+(₪[^\s]+)\s+(\$[^\s]+)\s+(.+?)\s+(\d{2}\.\d{2}\.\d{2})\s*$/;
        const fr = foreignRe.exec(s);
        if (fr) {
            const voucher = fr[1];
            const chgAbs = this.parseIsracardPdfAmountToken(fr[2]);
            const origAbs = this.parseIsracardPdfAmountToken(fr[3]);
            const desc = fr[4].trim();
            const date = this.parseDate(fr[5]);
            if (!date || chgAbs === 0) return null;
            const memo = tags.length ? tags.join(' · ') : undefined;
            const ids = this.assignImportId({
                provider: 'isracard',
                accountNumber,
                date: date.toISOString(),
                amount: -chgAbs,
                chargedAmount: -chgAbs,
                description: desc,
                externalId: voucher,
                sourceRef: 'import:isracard-pdf',
            });
            return {
                ...ids,
                date: date.toISOString(),
                processedDate: date.toISOString(),
                description: desc,
                memo,
                amount: -chgAbs,
                chargedAmount: -chgAbs,
                originalAmount: -origAbs,
                originalCurrency: 'USD',
                chargedCurrency: 'ILS',
                status: 'completed',
                provider: 'isracard',
                accountNumber,
                txnType: 'expense',
                type: 'normal',
            };
        }

        const ilsRe =
            /^(\d{8,12})\s+(₪[^\s]+)\s+(₪[^\s]+)\s+(.+?)\s+(\d{2}\.\d{2}\.\d{2})\s*$/;
        const il = ilsRe.exec(s);
        if (il) {
            const voucher = il[1];
            const a1 = this.parseIsracardPdfAmountToken(il[2]);
            const a2 = this.parseIsracardPdfAmountToken(il[3]);
            const chgAbs = a2;
            const origAbs = a1;
            const desc = il[4].trim();
            const date = this.parseDate(il[5]);
            if (!date || chgAbs === 0) return null;
            const memo = tags.length ? tags.join(' · ') : undefined;
            const chargedSigned = -chgAbs;
            const originalSigned = -origAbs;
            const ids = this.assignImportId({
                provider: 'isracard',
                accountNumber,
                date: date.toISOString(),
                amount: chargedSigned,
                chargedAmount: chargedSigned,
                description: desc,
                externalId: voucher,
                sourceRef: 'import:isracard-pdf',
            });
            return {
                ...ids,
                date: date.toISOString(),
                processedDate: date.toISOString(),
                description: desc,
                memo,
                amount: chargedSigned,
                chargedAmount: chargedSigned,
                originalAmount: originalSigned,
                originalCurrency: 'ILS',
                chargedCurrency: 'ILS',
                status: 'completed',
                provider: 'isracard',
                accountNumber,
                txnType: 'expense',
                type: 'normal',
            };
        }

        return null;
    }

    private parseIsracardPdfText(
        text: string,
        logs: string[],
        defaultAccountNumber: string
    ): { transactions: Transaction[]; accounts: Account[] } {
        const accountNumber = defaultAccountNumber !== 'imported' ? defaultAccountNumber : 'imported';
        const transactions: Transaction[] = [];
        const lines = text.split(/\r?\n/);
        let pending = '';

        for (const raw of lines) {
            const line = this.normalizeCellText(raw);
            if (!line) continue;

            if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) continue;

            if (line.includes('עסקאות בחיוב עתידי') || line.includes('עתידי בחיוב עסקאות')) {
                break;
            }
            if (/בכרטיס\s+החודש\s+לחיוב/i.test(line) && /סה["״]כ/.test(line)) {
                break;
            }

            if (line.includes('תאריך') && line.includes('שובר') && line.includes('רכישה') && line.length > 35) {
                continue;
            }

            if (/^(חו"ל אתר|קבע הוראת)$/i.test(line)) {
                pending = pending ? `${pending} ${line}` : line;
                continue;
            }

            const combined = pending ? `${pending} ${line}` : line;
            pending = '';

            const txn = this.tryParseIsracardPdfTransactionLine(combined, accountNumber);
            if (txn) {
                transactions.push(txn);
            }
        }

        logs.push(`Isracard PDF: imported ${transactions.length} transactions`);
        const accounts: Account[] = transactions.length > 0
            ? [{ accountNumber, provider: 'isracard', currency: 'ILS' }]
            : [];
        return { transactions, accounts };
    }

    private async extractPdfText(buffer: Buffer): Promise<string> {
        const parser = new PDFParse({ data: buffer });
        try {
            const data = await parser.getText();
            return data.text;
        } finally {
            await parser.destroy();
        }
    }

    private parseGenericPdfText(text: string, logs: string[]): { transactions: Transaction[]; accounts: Account[] } {
        const transactions: Transaction[] = [];
        let provider = 'unknown';
        let accountNumber = 'unknown';

        if (text.includes('ישראכרט') || text.includes('Isracard')) {
            provider = 'isracard';
        } else if (text.includes('MAX') || text.includes('מקס')) {
            provider = 'max';
        } else if (text.includes('מזרחי') || text.includes('Mizrahi')) {
            provider = 'mizrahi';
        }

        logs.push(`Detected provider from PDF: ${provider}`);

        const lines = text.split('\n');
        for (const line of lines) {
            const dateSlash = line.match(/(\d{2}\/\d{2}\/\d{2,4})/);
            const dateDot = line.match(/(\d{2}\.\d{2}\.\d{2,4})/);
            const dateMatch = dateSlash || dateDot;
            if (dateMatch) {
                const dateStr = dateMatch[1];
                const date = this.parseDate(dateStr);
                if (!date) continue;

                const amountMatches = line.match(/-?\d{1,3}(,\d{3})*(\.\d{2})?/g);
                if (amountMatches) {
                    const lastAmount = amountMatches[amountMatches.length - 1];
                    const amount = this.parseNumber(lastAmount);

                    if (amount !== 0) {
                        const description = line.replace(dateStr, '').replace(lastAmount, '').trim();
                        const dateIso = date.toISOString();
                        const ids = this.assignImportId({
                            provider,
                            accountNumber,
                            date: dateIso,
                            amount,
                            chargedAmount: amount,
                            description,
                            sourceRef: 'import:generic-pdf-text',
                        });
                        transactions.push({
                            ...ids,
                            date: dateIso,
                            processedDate: dateIso,
                            description,
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

    private normalizeCellText(val: any): string {
        return String(val ?? '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    }

    private findIsracardHeaderRowIndex(rows: any[][]): number {
        for (let i = 0; i < Math.min(rows.length, 80); i++) {
            const row = rows[i];
            if (!row || row.length < 5) continue;
            const cells = row.map(c => this.normalizeCellText(c));
            if (cells.some(c => c.includes('תאריך רכישה')) &&
                cells.some(c => c.includes('שם בית עסק')) &&
                cells.some(c => c.includes('סכום חיוב'))) {
                return i;
            }
        }
        return -1;
    }

    private findRelaxedIsracardHeaderRowIndex(rows: any[][]): number {
        for (let i = 0; i < Math.min(rows.length, 80); i++) {
            const row = rows[i];
            if (!row || row.length < 4) continue;
            const cells = row.map(c => this.normalizeCellText(c));
            if (cells.some(c => c.includes('תאריך רכישה')) &&
                cells.some(c => c.includes('שם בית עסק'))) {
                return i;
            }
        }
        return -1;
    }

    private isIsracardStatementExport(rows: any[][], sheetName: string, providerTarget?: string): boolean {
        if (this.findIsracardHeaderRowIndex(rows) !== -1) {
            return true;
        }
        const relaxed = this.findRelaxedIsracardHeaderRowIndex(rows) !== -1;
        if (sheetName.includes('פירוט עסקאות') && relaxed) {
            return true;
        }
        if (providerTarget === 'isracard' && relaxed) {
            return true;
        }
        return false;
    }

    private parseIsracardStatement(
        rows: any[][],
        logs: string[],
        defaultAccountNumber: string
    ): { transactions: Transaction[]; accounts: Account[] } {
        let headerIdx = this.findIsracardHeaderRowIndex(rows);
        if (headerIdx === -1) {
            headerIdx = this.findRelaxedIsracardHeaderRowIndex(rows);
        }
        if (headerIdx === -1) {
            return { transactions: [], accounts: [] };
        }

        const headers = rows[headerIdx].map(h => this.normalizeCellText(h));
        const col = (predicate: (h: string) => boolean) => headers.findIndex(predicate);

        const dateCol = col(h => h.includes('תאריך רכישה'));
        const descCol = col(h => h.includes('שם בית עסק'));
        const origAmtCol = col(h => h.includes('סכום עסקה'));
        const origCurCol = col(h => h.includes('מטבע עסקה'));
        let chgAmtCol = col(h => h.includes('סכום חיוב'));
        if (chgAmtCol === -1) {
            chgAmtCol = col(h => h.includes('חיוב בשקלים'));
        }
        const chgCurCol = col(h => h.includes('מטבע חיוב'));
        const vouchCol = col(h => h.includes('שובר'));
        const extraCol = col(h => h.includes('פירוט נוסף'));

        if (dateCol === -1 || descCol === -1 || chgAmtCol === -1) {
            logs.push('Isracard sheet: missing required columns');
            return { transactions: [], accounts: [] };
        }

        const accountNumber = defaultAccountNumber !== 'imported' ? defaultAccountNumber : 'imported';
        const transactions: Transaction[] = [];

        for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const first = this.normalizeCellText(row[0]);
            if (first.includes('עסקאות בחיוב עתידי')) {
                break;
            }
            if (first.includes('סה"כ לחיוב החודש') || first.includes('סה״כ לחיוב החודש')) {
                break;
            }

            const dateStr = this.normalizeCellText(row[dateCol]);
            const date = this.parseDate(dateStr);
            if (!date) {
                if (first.includes('סה"כ') || first.includes('סה״כ')) {
                    break;
                }
                continue;
            }

            const description = this.normalizeCellText(row[descCol]);
            if (!description) continue;

            const chargedAbs = Math.abs(this.parseNumber(row[chgAmtCol]));
            if (chargedAbs === 0) {
                continue;
            }

            const origCur = origCurCol !== -1
                ? this.currencySymbolToIso(this.normalizeCellText(row[origCurCol]))
                : 'ILS';
            const chgCur = chgCurCol !== -1
                ? this.currencySymbolToIso(this.normalizeCellText(row[chgCurCol]))
                : 'ILS';

            let originalAbs = origAmtCol !== -1 ? Math.abs(this.parseNumber(row[origAmtCol])) : chargedAbs;
            if (originalAbs === 0) {
                originalAbs = chargedAbs;
            }

            const voucher = vouchCol !== -1 ? this.normalizeCellText(row[vouchCol]) : '';
            const extra = extraCol !== -1 ? this.normalizeCellText(row[extraCol]) : '';
            const memoParts = [voucher ? `שובר ${voucher}` : '', extra].filter(Boolean);
            const memo = memoParts.join(' · ');

            const chargedSigned = -chargedAbs;
            const originalSigned = -originalAbs;

            const instMatch = extra.match(/תשלום\s*(\d+)\s*מתוך\s*(\d+)/);
            const installments = instMatch
                ? { number: parseInt(instMatch[1], 10), total: parseInt(instMatch[2], 10) }
                : undefined;

            const ids = this.assignImportId({
                provider: 'isracard',
                accountNumber,
                date: date.toISOString(),
                amount: chargedSigned,
                chargedAmount: chargedSigned,
                description,
                externalId: voucher || undefined,
                sourceRef: 'import:isracard-xlsx',
            });

            transactions.push({
                ...ids,
                date: date.toISOString(),
                processedDate: date.toISOString(),
                description,
                memo: memo || undefined,
                amount: chargedSigned,
                chargedAmount: chargedSigned,
                originalAmount: originalSigned,
                originalCurrency: origCur,
                chargedCurrency: chgCur,
                status: 'completed',
                provider: 'isracard',
                accountNumber,
                txnType: 'expense',
                type: installments ? 'installments' : 'normal',
                installments,
            });
        }

        logs.push(`Isracard: imported ${transactions.length} transactions`);
        const accounts: Account[] = transactions.length > 0
            ? [{ accountNumber, provider: 'isracard', currency: 'ILS' }]
            : [];
        return { transactions, accounts };
    }

    private currencySymbolToIso(raw: string): string {
        const s = raw.trim();
        if (!s) return 'ILS';
        if (s.includes('₪') || s === 'ש"ח' || /^ils$/i.test(s)) return 'ILS';
        if (s.includes('$') || /^usd$/i.test(s)) return 'USD';
        if (s.includes('€') || /^eur$/i.test(s)) return 'EUR';
        if (s.includes('£') || /^gbp$/i.test(s)) return 'GBP';
        if (s.includes('ლ')) return 'GEL';
        return s.length <= 3 ? s.toUpperCase() : 'ILS';
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

                const refRaw = getCell(COL_REFERENCE);
                const refStr =
                    refRaw != null && String(refRaw).trim() ? String(refRaw).trim() : undefined;
                const desc = String(description).trim();
                const dateIso = date.toISOString();
                const ids = this.assignImportId({
                    provider: 'mizrahi',
                    accountNumber,
                    date: dateIso,
                    amount,
                    chargedAmount: amount,
                    description: desc,
                    externalId: refStr,
                    sourceRef: 'import:mizrahi-xlsx',
                });
                transactions.push({
                    ...ids,
                    date: dateIso,
                    processedDate: dateIso,
                    description: desc,
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

            const desc = String(row[descIdx] || 'No description').trim();
            const dateIso = date.toISOString();
            const ids = this.assignImportId({
                provider: 'imported',
                accountNumber: defaultAccountNumber,
                date: dateIso,
                amount,
                chargedAmount: amount,
                description: desc,
                sourceRef: 'import:generic-spreadsheet',
            });
            transactions.push({
                ...ids,
                date: dateIso,
                processedDate: dateIso,
                description: desc,
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
