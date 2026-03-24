import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import { Transaction, Account } from '@app/shared';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { generateTransactionId } from '../utils/idGenerator.js';
import { serverLogger } from '../utils/logger.js';
import { maskSensitiveData } from '../utils/masking.js';
import { logAICall, logAIError, withAILogging, runWithAILoadTracking } from '../utils/aiLogger.js';
import { DbService } from './dbService.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
// const CACHE_FILE = path.join(DATA_DIR, 'config', 'ai_categories_cache.json'); // Legacy
const SETTINGS_FILE = path.join(DATA_DIR, 'config', 'ai_settings.json');

export interface AiSettings {
    categorizationModel: string;
    chatModel: string;
    categories: string[];
    defaultCategory: string;
    /** 0 = disabled. Insights older than this many days are removed periodically and after saving settings. */
    memoryInsightRetentionDays?: number;
    /** 0 = disabled. Alerts older than this many days are removed periodically and after saving settings. */
    memoryAlertRetentionDays?: number;
}

/** One turn in a conversation for multi-turn AI analysis */
export interface ConversationTurn {
    role: 'user' | 'model';
    text: string;
}

/** When set, old vs new transactions are sent separately: old via file attachment; new inline as CSV only if ≤ {@link AI_TXN_INLINE_MAX_ROWS} rows, otherwise as a second file. */
export interface AnalyzeTransactionSplit {
    /** Prior scrapes / DB history (not part of this run). Sent as an attached CSV file when non-empty. */
    oldTransactions: Transaction[];
    /** This scrape run only. */
    newTransactions: Transaction[];
    /** Language for the data-layout instructions in the prompt. */
    locale?: 'en' | 'he';
}

export interface AnalyzeDataOptions {
    /** Previous turns in the conversation; when provided, enables multi-turn and reduces repetition */
    conversationHistory?: ConversationTurn[];
    /** Temperature for generation (0–2). Higher = more variety. Default 0.7 for chat; use ~0.4 for post-scrape. */
    temperature?: number;
    /**
     * Post-scrape style split: historical rows as file, new rows as text (if short) or file (if long).
     * When set, the `transactions` argument to analyzeData should be `[]`.
     */
    transactionSplit?: AnalyzeTransactionSplit;
}

/** Rows above this count are sent as an uploaded file instead of inline CSV. */
export const AI_TXN_INLINE_MAX_ROWS = 100;

/** Returned when categorization cannot call the model; cache-only mapping is still applied. */
export const AI_CATEGORIZATION_NO_API_KEY = 'GEMINI_API_KEY not configured';

export interface CategorizeTransactionsResult {
    transactions: Transaction[];
    /** Set when the model was not used successfully; cached categories are still applied where available. */
    aiError?: string;
}

/** Item with importance 1–100 (100 = most important). */
export interface ScoredMemoryItem {
    text: string;
    /** Clamped 1–100 when persisting */
    score: number;
}

/** Unified AI chat: model returns user-facing text plus facts, scored insights, and scored alerts. */
export interface StructuredChatResult {
    response: string;
    facts: string[];
    insights: ScoredMemoryItem[];
    alerts: ScoredMemoryItem[];
}

function clampScore(n: unknown): number {
    const x = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(x)) return 50;
    return Math.max(1, Math.min(100, Math.round(x)));
}

/** Parses model JSON: supports `{ text, score }[]` or legacy `string[]` (score 50). */
export function normalizeScoredItems(raw: unknown, legacyDefaultScore: number = 50): ScoredMemoryItem[] {
    if (!Array.isArray(raw)) return [];
    const out: ScoredMemoryItem[] = [];
    for (const item of raw) {
        if (typeof item === 'string') {
            const t = item.trim();
            if (t) out.push({ text: t, score: legacyDefaultScore });
            continue;
        }
        if (item && typeof item === 'object' && typeof (item as any).text === 'string') {
            const t = String((item as any).text).trim();
            if (!t) continue;
            const score = clampScore((item as any).score);
            out.push({ text: t, score });
        }
    }
    return out;
}

const DEFAULT_SETTINGS: AiSettings = {
    categorizationModel: 'gemini-flash-latest',
    chatModel: 'gemini-flash-latest',
    categories: ['מזון', 'תחבורה', 'קניות', 'מנויים', 'בריאות', 'מגורים', 'בילויים', 'משכורת', 'העברות', 'חשבונות', 'ביגוד', 'חינוך', 'אחר', 'משכנתא והלוואות'],
    defaultCategory: 'אחר',
    memoryInsightRetentionDays: 0,
    memoryAlertRetentionDays: 0
};

export class AiService {
    private genAI: GoogleGenerativeAI | null = null;
    // private cache: Record<string, string> = {}; // Legacy
    private dbService: DbService;
    private settings: AiSettings = DEFAULT_SETTINGS;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }
        this.dbService = new DbService();
        this.initialize();
    }

    /**
     * Returns true when AI provider API key is configured and client initialized
     */
    hasApiKey(): boolean {
        return !!this.genAI;
    }

    private async initialize() {
        // await this.loadCache(); // Legacy
        await this.loadSettings();
        await this.migrateCacheToDb();
    }

    private async migrateCacheToDb() {
        const CACHE_FILE = path.join(DATA_DIR, 'config', 'ai_categories_cache.json');
        if (await fs.pathExists(CACHE_FILE)) {
            try {
                const cache = await fs.readJson(CACHE_FILE);
                serverLogger.info(`Migrating ${Object.keys(cache).length} categories to DB...`);
                for (const [desc, cat] of Object.entries(cache)) {
                    this.dbService.setCategory(desc, cat as string);
                }
                // Optional: Rename or delete legacy file after migration? 
                // Keeping it for safety for now.
            } catch (error) {
                serverLogger.warn('Failed to migrate categories cache:', error);
            }
        }
    }

    /*
    private async loadCache() {
        if (await fs.pathExists(CACHE_FILE)) {
            this.cache = await fs.readJson(CACHE_FILE);
        }
    }

    private async saveCache() {
        await fs.writeJson(CACHE_FILE, this.cache, { spaces: 2 });
    }
    */

    private async loadSettings() {
        if (await fs.pathExists(SETTINGS_FILE)) {
            const raw = { ...DEFAULT_SETTINGS, ...((await fs.readJson(SETTINGS_FILE)) as Partial<AiSettings>) };
            raw.memoryInsightRetentionDays = Math.max(
                0,
                Math.min(3650, Math.floor(Number(raw.memoryInsightRetentionDays ?? DEFAULT_SETTINGS.memoryInsightRetentionDays) || 0))
            );
            raw.memoryAlertRetentionDays = Math.max(
                0,
                Math.min(3650, Math.floor(Number(raw.memoryAlertRetentionDays ?? DEFAULT_SETTINGS.memoryAlertRetentionDays) || 0))
            );
            this.settings = raw;
        }
    }

    async getSettings(): Promise<AiSettings> {
        await this.loadSettings();
        return this.settings;
    }

    async updateSettings(newSettings: Partial<AiSettings>): Promise<AiSettings> {
        const next = { ...this.settings, ...newSettings };
        if (next.memoryInsightRetentionDays !== undefined) {
            next.memoryInsightRetentionDays = Math.max(0, Math.min(3650, Math.floor(Number(next.memoryInsightRetentionDays) || 0)));
        }
        if (next.memoryAlertRetentionDays !== undefined) {
            next.memoryAlertRetentionDays = Math.max(0, Math.min(3650, Math.floor(Number(next.memoryAlertRetentionDays) || 0)));
        }
        this.settings = next;
        const CONFIG_DIR = path.join(DATA_DIR, 'config');
        await fs.ensureDir(CONFIG_DIR);
        await fs.writeJson(SETTINGS_FILE, this.settings, { spaces: 2 });
        serverLogger.info(`Settings updated and saved to ${SETTINGS_FILE} `);
        return this.settings;
    }

    async getAvailableModels(): Promise<string[]> {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            serverLogger.warn('No GEMINI_API_KEY found, using fallback models');
            return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        }

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            serverLogger.info('Fetching models from API...');
            const { data } = await axios.get(url);

            // Filter for gemini models that support generateContent
            const models = data.models
                .filter((m: any) =>
                    m.name.startsWith('models/gemini') &&
                    m.supportedGenerationMethods.includes('generateContent') &&
                    !m.name.includes('vision') // Skip vision models as they are not relevant here
                )
                .map((m: any) => m.name.replace('models/', ''))
                .sort();

            serverLogger.info(`Successfully fetched ${models.length} models`, { models });
            return models.length > 0 ? models : ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        } catch (error: any) {
            serverLogger.error(`Failed to fetch Gemini models: ${error.message}`);
            return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        }
    }

    private mapTransactionsWithCategoryCache(transactions: Transaction[]): Transaction[] {
        return transactions.map((t) => ({
            ...t,
            category: this.dbService.getCategory(t.description) || t.category || this.settings.defaultCategory,
        }));
    }

    async categorizeTransactions(transactions: Transaction[]): Promise<CategorizeTransactionsResult> {
        await this.loadSettings();

        if (!this.genAI) {
            serverLogger.info('Categorization: no GEMINI_API_KEY; applying category cache only');
            return {
                transactions: this.mapTransactionsWithCategoryCache(transactions),
                aiError: AI_CATEGORIZATION_NO_API_KEY,
            };
        }

        serverLogger.info(`Categorizing ${transactions.length} transactions using ${this.settings.categorizationModel}`);

        const model = this.genAI.getGenerativeModel({ model: this.settings.categorizationModel });

        // Filter out transactions that already have a cached category
        // Use DB cache now
        const uncategorized = transactions.filter(t => !this.dbService.getCategory(t.description));
        serverLogger.info(`${transactions.length - uncategorized.length} already in cache, ${uncategorized.length} to categorize`);

        if (uncategorized.length === 0) {
            return { transactions: this.mapTransactionsWithCategoryCache(transactions) };
        }

        // Prepare prompt
        const descriptions = Array.from(new Set(uncategorized.map(t => t.description)));
        const prompt = `
            Analyze the Objective: You are a professional financial assistant specializing in Israeli banking. 
            Your core task is to categorize the following transaction descriptions into the most appropriate category.

            ---
            ${descriptions.join('\n')}
            ---

            Constraints & Output Format:
            AVAILABLE CATEGORIES:
            ${this.settings.categories.join(', ')}

            DEFAULT CATEGORY:
            Use "${this.settings.defaultCategory}" if you are unsure or if the description doesn't fit any other category.

            OUTPUT FORMAT:
            You MUST return the result as a VALID JSON object where:
            - The key is the EXACT transaction description. If the description contains quotes or special characters, you MUST properly escape them in the JSON.
            - The value is the selected category string.

            Example:
            {
                "AMAZON MKT PLC": "General",
                "YELLOW": "Transport"
            }
            
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;

        let startTime = Date.now();
        try {
            serverLogger.info(`Sending request to Gemini model: ${this.settings.categorizationModel}`, {
                categoryCount: this.settings.categories.length,
                descriptionCount: descriptions.length
            });

            startTime = Date.now();
            const result = await runWithAILoadTracking(() =>
                model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            );
            const response = await result.response;
            const text = response.text();
            const latencyMs = Date.now() - startTime;

            serverLogger.debug(`Gemini raw response: ${text}`);

            let categoriesMap: Record<string, string> = {};
            try {
                categoriesMap = this.extractJson(text);
                serverLogger.info(`Received ${Object.keys(categoriesMap).length} categories from AI`);
            } catch (parseError: any) {
                serverLogger.error(`Failed to parse AI response as JSON: ${parseError.message}`, {
                    rawText: text.substring(0, 500) // Log part of the response for debugging
                });
                throw new Error(`AI categorization returned malformed data: ${parseError.message}`);
            }

            // Log the AI call
            const usageMetadata = response.usageMetadata;
            const descriptionsStr = descriptions.join(', ');
            await logAICall({
                model: this.settings.categorizationModel,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: `Categorize Israeli bank transactions. Categories: ${this.settings.categories.join(', ')}`,
                    userInput: descriptionsStr,  // Log full descriptions
                    inputLength: descriptions.length
                },
                responseInfo: {
                    rawOutput: `Successfully categorized ${Object.keys(categoriesMap).length} descriptions`,
                    finishReason: response.candidates?.[0]?.finishReason?.toString() || 'STOP',
                    success: true
                },
                metadata: {
                    promptTokens: usageMetadata?.promptTokenCount,
                    completionTokens: usageMetadata?.candidatesTokenCount,
                    totalTokens: usageMetadata?.totalTokenCount,
                    latencyMs
                }
            });

            // Save to DB
            for (const [desc, cat] of Object.entries(categoriesMap)) {
                this.dbService.setCategory(desc, cat as string);
            }
            // Object.assign(this.cache, categoriesMap);
            // await this.saveCache();
            // serverLogger.info(`Cache saved to ${CACHE_FILE}`);

            return { transactions: this.mapTransactionsWithCategoryCache(transactions) };
        } catch (error: any) {
            const latencyMs = Date.now() - (startTime || Date.now());

            // Log the error
            await logAIError(
                this.settings.categorizationModel,
                'gemini',
                `Categorize ${descriptions.length} descriptions`,
                error,
                { latencyMs }
            );

            serverLogger.error(`Categorization failed: ${error.message}`);
            return {
                transactions: this.mapTransactionsWithCategoryCache(transactions),
                aiError: error.message || String(error),
            };
        }
    }

    private async waitForFileActive(fileManager: GoogleAIFileManager, fileResourceName: string): Promise<void> {
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
            const meta = await fileManager.getFile(fileResourceName);
            if (meta.state === FileState.ACTIVE) return;
            if (meta.state === FileState.FAILED) {
                const msg = meta.error?.message || 'Uploaded file processing failed';
                throw new Error(msg);
            }
            await new Promise((r) => setTimeout(r, 1500));
        }
        throw new Error('Timeout waiting for uploaded file to become ACTIVE');
    }

    private async uploadTransactionsCsv(
        fileManager: GoogleAIFileManager,
        csv: string,
        displayName: string
    ): Promise<{ resourceName: string; uri: string; mimeType: string }> {
        const buf = Buffer.from(csv, 'utf-8');
        const upload = await fileManager.uploadFile(buf, {
            mimeType: 'text/csv',
            displayName,
        });
        const { name, uri, mimeType } = upload.file;
        await this.waitForFileActive(fileManager, name);
        return { resourceName: name, uri, mimeType };
    }

    /**
     * Upload CSV to Gemini Files API. On network/transport failure (common: DNS, firewall, corporate proxy),
     * returns null so callers can attach the same CSV inline instead of failing the request.
     */
    private async tryUploadTransactionsCsv(
        fileManager: GoogleAIFileManager,
        csv: string,
        displayName: string,
        uploadedResourceNames: string[],
        uploadedFileLog: { displayName: string; utf8Bytes: number; rows: number }[],
        rows: number
    ): Promise<{ resourceName: string; uri: string; mimeType: string } | null> {
        try {
            const up = await this.uploadTransactionsCsv(fileManager, csv, displayName);
            uploadedResourceNames.push(up.resourceName);
            uploadedFileLog.push({
                displayName,
                utf8Bytes: Buffer.byteLength(csv, 'utf8'),
                rows,
            });
            return up;
        } catch (err) {
            serverLogger.warn('Gemini file upload failed; will use inline CSV if the caller supports fallback', {
                displayName,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    /** Log: prompt text first; when files were uploaded, append their UTF-8 size and row counts (no section headers). */
    private buildAnalyzeDataLogUserInput(
        promptText: string,
        uploadedFiles: { displayName: string; utf8Bytes: number; rows: number }[]
    ): string {
        if (uploadedFiles.length === 0) {
            return promptText;
        }
        const fileLines = uploadedFiles
            .map(
                (f, i) =>
                    `${i + 1}. ${f.displayName} — UTF-8 bytes: ${f.utf8Bytes}, rows: ${f.rows}`
            )
            .join('\n');
        const totalRows = uploadedFiles.reduce((sum, f) => sum + f.rows, 0);
        return `${promptText}\n\n${fileLines}\n\nTotal rows (all attachments): ${totalRows}`;
    }

    async analyzeData(query: string, transactions: Transaction[], options?: AnalyzeDataOptions): Promise<string> {
        if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.loadSettings();
        const temperature = options?.temperature ?? 0.7;
        const systemInstruction =
            'You are a professional financial analyst. Provide concise, data-driven answers based on provided transaction history. ' +
            'Do not repeat your previous analysis verbatim; when relevant, refer to prior points briefly and emphasize what is new or changed.';
        const model = this.genAI.getGenerativeModel({
            model: this.settings.chatModel,
            systemInstruction
        });

        const apiKey = process.env.GEMINI_API_KEY || '';
        const fileManager = new GoogleAIFileManager(apiKey);
        const uploadedResourceNames: string[] = [];
        const uploadedFileLog: { displayName: string; utf8Bytes: number; rows: number }[] = [];

        type UserPart = { text: string } | { fileData: { mimeType: string; fileUri: string } };

        /** Single CSV with `scope` column: historical vs current_scrape (post-scrape split). */
        const buildSplitPromptCombinedFile = (
            locale: 'en' | 'he',
            oldRows: number,
            newRows: number,
            totalRows: number,
            q: string
        ): string => {
            const layoutEn =
                `The attached CSV has a \`scope\` column: \`historical\` = from previous scrapes (not this run); \`current_scrape\` = this run only.\n` +
                `Row counts: ${oldRows} historical + ${newRows} from this scrape = ${totalRows} data rows (plus header).\n` +
                `Use historical rows only for baseline/context; prioritize \`current_scrape\` when the question is about recent activity.\n`;
            const layoutHe =
                `לקובץ ה־CSV המצורף יש עמודת \`scope\`: \`historical\` = מסריקות קודמות (לא מהריצה הזו); \`current_scrape\` = רק מהריצה הנוכחית.\n` +
                `מספר שורות: ${oldRows} היסטוריה + ${newRows} מהסריקה הזו = ${totalRows} שורות נתונים (בלי כותרת).\n` +
                `השתמש ב־historical רק כהקשר; עדיף להתמקד ב־\`current_scrape\` כשהשאלה נוגעת לפעילות אחרונה.\n`;

            const layout = locale === 'he' ? layoutHe : layoutEn;
            return `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.

            ${layout}
            Question: ${q}

            Constraints & Output Format:
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;
        };

        const buildSplitPrompt = (
            locale: 'en' | 'he',
            oldRows: number,
            newRows: number,
            oldAsFile: boolean,
            newAsFile: boolean,
            newInlineCsv: string
        ): string => {
            const layoutEn =
                (oldRows > 0
                    ? `OLD transactions (historical): ${oldRows} row(s) already on file from previous scrapes — not from this run. ` +
                      `They are in the first attached CSV file.\n`
                    : '') +
                (newRows > 0
                    ? newAsFile
                        ? `NEW transactions (this scrape only): ${newRows} row(s) in the attached CSV file${
                              oldRows > 0 ? ' (after the historical file)' : ''
                          } (same column layout).\n`
                        : `NEW transactions (this scrape only): ${newRows} row(s) — included below as CSV text (not historical).\n`
                    : `No new transactions in this run; only historical data may be attached.\n`) +
                `\nUse OLD only for baseline/context; prioritize analyzing NEW when the question is about recent activity.\n`;
            const layoutHe =
                (oldRows > 0
                    ? `עסקאות ישנות (היסטוריה): ${oldRows} שורות שכבר היו במערכת מסריקות קודמות — לא מהריצה הנוכחית. ` +
                      `הן בקובץ ה־CSV המצורף הראשון.\n`
                    : '') +
                (newRows > 0
                    ? newAsFile
                        ? `עסקאות חדשות (רק מהסריקה הזו): ${newRows} שורות בקובץ ה־CSV המצורף${
                              oldRows > 0 ? ' (אחרי קובץ ההיסטוריה)' : ''
                          } (אותה מבנה עמודות).\n`
                        : `עסקאות חדשות (רק מהסריקה הזו): ${newRows} שורות — מופיעות למטה כטקסט CSV (לא היסטוריה).\n`
                    : `אין עסקאות חדשות בריצה זו; ייתכן שמצורף רק נתון היסטורי.\n`) +
                `\nהשתמש בישן רק כהקשר; עדיף להתמקד בחדש כשהשאלה נוגעת לפעילות אחרונה.\n`;

            const layout = locale === 'he' ? layoutHe : layoutEn;
            const newBlock =
                newRows > 0 && !newAsFile && newInlineCsv
                    ? locale === 'he'
                        ? `\n---\nעסקאות חדשות CSV (רק מהסריקה הזו):\n${newInlineCsv}\n---\n`
                        : `\n---\nNEW TRANSACTIONS CSV (this scrape only):\n${newInlineCsv}\n---\n`
                    : '';

            return `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.

            ${layout}
            Question: ${query}
            ${newBlock}
            Constraints & Output Format:
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;
        };

        let currentPrompt: string;
        let userParts: UserPart[];

        const split = options?.transactionSplit;
        if (split) {
            const oldTx = split.oldTransactions || [];
            const newTx = split.newTransactions || [];
            const locale = split.locale === 'he' ? 'he' : 'en';

            if (oldTx.length > 0 && newTx.length > 0) {
                // One CSV with a `scope` column so logs show total rows (two separate files made it easy to read only the "new" row count).
                const combinedCsv = this.formatSplitTransactionsForAI(oldTx, newTx);
                const totalRows = oldTx.length + newTx.length;
                const up = await this.tryUploadTransactionsCsv(
                    fileManager,
                    combinedCsv,
                    'transactions_historical_and_current.csv',
                    uploadedResourceNames,
                    uploadedFileLog,
                    totalRows
                );
                currentPrompt = buildSplitPromptCombinedFile(locale, oldTx.length, newTx.length, totalRows, query);
                if (up) {
                    userParts = [{ fileData: { mimeType: up.mimeType, fileUri: up.uri } }, { text: currentPrompt }];
                } else {
                    userParts = [
                        {
                            text: `${currentPrompt}\n\n[Note: CSV is inline because upload to the AI file service failed (network/DNS/firewall/proxy).]\n\n--- CSV ---\n${combinedCsv}`,
                        },
                    ];
                }
            } else {
                const oldAsFile = oldTx.length > 0;
                const newAsFile = newTx.length > AI_TXN_INLINE_MAX_ROWS;
                const newInlineCsv =
                    newTx.length > 0 && !newAsFile ? this.formatTransactionsForAI(newTx) : '';

                currentPrompt = buildSplitPrompt(
                    locale,
                    oldTx.length,
                    newTx.length,
                    oldAsFile,
                    newAsFile,
                    newInlineCsv
                );

                userParts = [];
                let inlinePrefix = '';
                if (oldAsFile) {
                    const oldCsv = this.formatTransactionsForAI(oldTx);
                    const up = await this.tryUploadTransactionsCsv(
                        fileManager,
                        oldCsv,
                        'historical_transactions.csv',
                        uploadedResourceNames,
                        uploadedFileLog,
                        oldTx.length
                    );
                    if (up) {
                        userParts.push({ fileData: { mimeType: up.mimeType, fileUri: up.uri } });
                    } else {
                        inlinePrefix += `--- HISTORICAL TRANSACTIONS (${oldTx.length} rows) ---\n${oldCsv}\n\n`;
                    }
                }
                if (newAsFile) {
                    const newCsv = this.formatTransactionsForAI(newTx);
                    const up = await this.tryUploadTransactionsCsv(
                        fileManager,
                        newCsv,
                        'new_transactions_this_scrape.csv',
                        uploadedResourceNames,
                        uploadedFileLog,
                        newTx.length
                    );
                    if (up) {
                        userParts.push({ fileData: { mimeType: up.mimeType, fileUri: up.uri } });
                    } else {
                        inlinePrefix += `--- NEW SCRAPE TRANSACTIONS (${newTx.length} rows) ---\n${newCsv}\n\n`;
                    }
                }
                const uploadFallbackNote =
                    inlinePrefix.length > 0
                        ? '[Note: Transaction CSV is included inline below because file upload to the AI service failed (e.g. network/DNS/firewall/proxy).]\n\n'
                        : '';
                userParts.push({ text: uploadFallbackNote + inlinePrefix + currentPrompt });
            }
        } else {
            const useFile = transactions.length > AI_TXN_INLINE_MAX_ROWS;
            if (useFile && transactions.length > 0) {
                const csv = this.formatTransactionsForAI(transactions);
                const up = await this.tryUploadTransactionsCsv(
                    fileManager,
                    csv,
                    'transactions.csv',
                    uploadedResourceNames,
                    uploadedFileLog,
                    transactions.length
                );
                if (up) {
                    currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.

            The attached CSV file contains all ${transactions.length} transactions (${transactions.length} rows). Use it for the question below.

            Question: ${query}

            Constraints & Output Format:
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;
                    userParts = [{ fileData: { mimeType: up.mimeType, fileUri: up.uri } }, { text: currentPrompt }];
                } else {
                    currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.

            [Note: CSV is inline because upload to the AI file service failed (e.g. network/DNS/firewall/proxy).]\n\n
            Question: ${query}

            ---
            CSV:
            ${csv}
            ---

            Constraints & Output Format:
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;
                    userParts = [{ text: currentPrompt }];
                }
            } else {
                currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.
            
            Question: ${query}

            ---
            CSV:
            ${this.formatTransactionsForAI(transactions)}
            ---
            
            Constraints & Output Format:
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;
                userParts = [{ text: currentPrompt }];
            }
        }

        const contents: { role: 'user' | 'model'; parts: UserPart[] }[] = [];
        if (options?.conversationHistory?.length) {
            for (const turn of options.conversationHistory) {
                contents.push({ role: turn.role, parts: [{ text: turn.text }] });
            }
        }
        contents.push({ role: 'user', parts: userParts });

        const generationConfig: { temperature?: number } = { temperature };

        let startTime = Date.now();
        try {
            startTime = Date.now();
            const result = await runWithAILoadTracking(() =>
                model.generateContent({
                    contents,
                    generationConfig
                })
            );
            const response = await result.response;
            const text = response.text();
            const latencyMs = Date.now() - startTime;

            const logInputSummary = this.buildAnalyzeDataLogUserInput(currentPrompt, uploadedFileLog);

            // Log the AI call
            const usageMetadata = response.usageMetadata;
            await logAICall({
                model: this.settings.chatModel,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: systemInstruction,
                    userInput: logInputSummary,
                    inputLength: logInputSummary.length
                },
                responseInfo: {
                    rawOutput: text,
                    finishReason: response.candidates?.[0]?.finishReason?.toString() || 'STOP',
                    success: true
                },
                metadata: {
                    promptTokens: usageMetadata?.promptTokenCount,
                    completionTokens: usageMetadata?.candidatesTokenCount,
                    totalTokens: usageMetadata?.totalTokenCount,
                    latencyMs
                }
            });

            return text;
        } catch (error: any) {
            const latencyMs = Date.now() - startTime;

            // Log the error
            await logAIError(
                this.settings.chatModel,
                'gemini',
                query,
                error,
                { latencyMs }
            );

            throw error;
        } finally {
            for (const name of uploadedResourceNames) {
                try {
                    await fileManager.deleteFile(name);
                } catch (delErr) {
                    serverLogger.warn('Failed to delete uploaded Gemini file', { name, error: (delErr as Error).message });
                }
            }
        }
    }

    /**
     * Same transaction attachment behavior as {@link analyzeData} for the non-split path only,
     * but the model must return JSON with `response`, `facts`, and `insights`.
     */
    async analyzeDataStructured(query: string, transactions: Transaction[], options?: AnalyzeDataOptions): Promise<StructuredChatResult> {
        if (options?.transactionSplit) {
            throw new Error('Structured chat does not support transactionSplit; use analyzeData instead.');
        }
        if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.loadSettings();
        const temperature = options?.temperature ?? 0.7;
        const systemInstruction =
            'You are a professional financial analyst. Reply with a single JSON object exactly as specified in the user message. ' +
            'Do not wrap JSON in markdown fences. Do not repeat prior insights verbatim; facts are long-term memory, insights are one-time analytical notes.';

        const model = this.genAI.getGenerativeModel({
            model: this.settings.chatModel,
            systemInstruction
        });

        const jsonSpec = `

---
OUTPUT FORMAT
Respond with one JSON object only (no markdown code fences, no text before or after). Schema:
{"response": string, "facts": string[], "insights": {"text": string, "score": number}[], "alerts": {"text": string, "score": number}[]}

- "response": Your main answer to the user (you may use markdown inside this string).
- "facts": Durable context worth remembering across sessions (life situation, goals, standing preferences). Do not duplicate items already listed under "Stored facts" in the prompt. Do not put raw one-off numbers here unless the user asked to remember them. Use an empty array if nothing new.
- "insights": Analytical observations (trends, comparisons, patterns). Each item MUST include "score" from 1 to 100 where 100 is the most important insight. Do not duplicate items under "Recent insights" in the prompt. Use an empty array if nothing new.
- "alerts": urgent or time-sensitive items the user should act on or notice (overspending risk, missed payment, unusual jump). Each item MUST include "score" 1–100 (100 = most critical). Do not duplicate "Recent alerts" below. Use an empty array if none.

Facts are user-editable persistent memory. Insights and alerts are stored with scores for prioritization.`;

        const fullQuery = query + jsonSpec;

        const apiKey = process.env.GEMINI_API_KEY || '';
        const fileManager = new GoogleAIFileManager(apiKey);
        const uploadedResourceNames: string[] = [];
        const uploadedFileLog: { displayName: string; utf8Bytes: number; rows: number }[] = [];

        type UserPart = { text: string } | { fileData: { mimeType: string; fileUri: string } };

        let currentPrompt: string;
        let userParts: UserPart[];

        const useFilePreferred = transactions.length > AI_TXN_INLINE_MAX_ROWS;
        if (useFilePreferred && transactions.length > 0) {
            const csv = this.formatTransactionsForAI(transactions);
            const up = await this.tryUploadTransactionsCsv(
                fileManager,
                csv,
                'transactions.csv',
                uploadedResourceNames,
                uploadedFileLog,
                transactions.length
            );
            if (up) {
                currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.

            The attached CSV file contains all ${transactions.length} transactions (${transactions.length} rows). Use it for the question below.

            Question and instructions:
            ${fullQuery}
        `;
                userParts = [{ fileData: { mimeType: up.mimeType, fileUri: up.uri } }, { text: currentPrompt }];
            } else {
                currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.

            [Note: CSV is inline because upload to the AI file service failed (e.g. network/DNS/firewall/proxy).]

            Question and instructions:
            ${fullQuery}

            ---
            CSV:
            ${csv}
            ---
        `;
                userParts = [{ text: currentPrompt }];
            }
        } else {
            currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.
            
            Question and instructions:
            ${fullQuery}

            ---
            CSV:
            ${this.formatTransactionsForAI(transactions)}
            ---
        `;
            userParts = [{ text: currentPrompt }];
        }

        const contents: { role: 'user' | 'model'; parts: UserPart[] }[] = [];
        if (options?.conversationHistory?.length) {
            for (const turn of options.conversationHistory) {
                contents.push({ role: turn.role, parts: [{ text: turn.text }] });
            }
        }
        contents.push({ role: 'user', parts: userParts });

        const generationConfig: {
            temperature: number;
            responseMimeType: string;
        } = { temperature, responseMimeType: 'application/json' };

        let startTime = Date.now();
        try {
            startTime = Date.now();
            const result = await runWithAILoadTracking(() =>
                model.generateContent({
                    contents,
                    generationConfig
                })
            );
            const response = await result.response;
            const text = response.text();
            const latencyMs = Date.now() - startTime;

            const logInputSummary = this.buildAnalyzeDataLogUserInput(currentPrompt, uploadedFileLog);

            const usageMetadata = response.usageMetadata;
            await logAICall({
                model: this.settings.chatModel,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: systemInstruction,
                    userInput: logInputSummary,
                    inputLength: logInputSummary.length
                },
                responseInfo: {
                    rawOutput: text,
                    finishReason: response.candidates?.[0]?.finishReason?.toString() || 'STOP',
                    success: true
                },
                metadata: {
                    promptTokens: usageMetadata?.promptTokenCount,
                    completionTokens: usageMetadata?.candidatesTokenCount,
                    totalTokens: usageMetadata?.totalTokenCount,
                    latencyMs
                }
            });

            let parsed: any;
            try {
                parsed = this.extractJson(text);
            } catch {
                return {
                    response: text,
                    facts: [],
                    insights: [],
                    alerts: []
                };
            }
            const resText = typeof parsed.response === 'string' ? parsed.response : '';
            const facts = Array.isArray(parsed.facts) ? parsed.facts.filter((x: unknown) => typeof x === 'string' && x.trim()) : [];
            const insights = normalizeScoredItems(parsed.insights, 50);
            const alerts = normalizeScoredItems(parsed.alerts, 70);
            return {
                response: resText || text,
                facts,
                insights,
                alerts
            };
        } catch (error: any) {
            const latencyMs = Date.now() - startTime;
            await logAIError(this.settings.chatModel, 'gemini', query, error, { latencyMs });
            throw error;
        } finally {
            for (const name of uploadedResourceNames) {
                try {
                    await fileManager.deleteFile(name);
                } catch (delErr) {
                    serverLogger.warn('Failed to delete uploaded Gemini file', { name, error: (delErr as Error).message });
                }
            }
        }
    }

    async parseDocument(text: string, provider: string = 'imported', accountNumber: string = 'unknown'): Promise<{ transactions: Transaction[], accounts: Account[] }> {
        if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.loadSettings();
        const model = this.genAI.getGenerativeModel({ model: this.settings.categorizationModel });

        const prompt = `
            Analyze the Objective: You are a financial data extraction expert. Your core task is to extract all bank/credit card transactions from the provided text.
            The text might contain multiple files or accounts. Please extract all of them.
            
            ---
            <data>
            ${text.substring(0, 100000)}
            </data>
            ---

            Constraints & Output Format:
            IMPORTANT RULES FOR AMOUNTS:
            - For EXPENSES, CHARGES, or MONEY GOING OUT: Use NEGATIVE numbers (e.g., -150.50).
            - For INCOME, REFUNDS, PAYMENTS RECEIVED, or MONEY COMING IN: Use POSITIVE numbers (e.g., 2000.00).
            - Do not include currency symbols in the amount field.
            - Ensure the 'originalAmount' follows the same polarity rules.

            Output the result ONLY as a JSON object with the following structure:
            {
              "transactions": [
                {
                  "date": "YYYY-MM-DDTHH:mm:ss.SSSZ",
                  "processedDate": "YYYY-MM-DDTHH:mm:ss.SSSZ",
                  "description": "merchant or transaction name",
                  "amount": number (MUST be negative for expenses),
                  "originalAmount": number (MUST be negative for expenses),
                  "originalCurrency": "ILS",
                  "chargedAmount": number (MUST be negative for expenses),
                  "chargedCurrency": "ILS",
                  "status": "completed",
                  "type": "normal",
                  "memo": "extra information if any",
                  "identifier": "unique transaction ID if visible in the text",
                  "accountNumber": "detected account number for this specific transaction"
                }
              ],
              "accounts": [
                 { "accountNumber": "123", "provider": "bank name" }
              ]
            }
            
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;

        try {
            serverLogger.info(`AI Parsing document text (${text.length} chars) using ${this.settings.categorizationModel}`);
            const result = await runWithAILoadTracking(() =>
                model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            );
            const response = await result.response;
            const resText = response.text();

            const extracted = this.extractJson(resText);

            const transactions: Transaction[] = (extracted.transactions || []).map((t: any) => {
                const txnAcc = t.accountNumber || extracted.accountNumber || accountNumber;
                const baseTxn = {
                    accountNumber: txnAcc,
                    date: t.date,
                    originalAmount: t.originalAmount || t.amount,
                    description: t.description,
                };

                return {
                    id: t.identifier || generateTransactionId(baseTxn),
                    date: t.date,
                    processedDate: t.processedDate || t.date,
                    description: t.description,
                    amount: t.amount,
                    chargedAmount: t.chargedAmount || t.amount,
                    chargedCurrency: t.chargedCurrency || t.originalCurrency || 'ILS',
                    originalAmount: t.originalAmount || t.amount,
                    originalCurrency: t.originalCurrency || 'ILS',
                    status: t.status || 'completed',
                    type: t.type || 'normal',
                    memo: t.memo || '',
                    provider: t.provider || provider,
                    accountNumber: txnAcc
                };
            });

            let accounts: Account[] = extracted.accounts || [];
            if (accounts.length === 0 && (extracted.accountNumber || accountNumber !== 'unknown' || transactions.length > 0)) {
                // Try to build accounts list from transactions if not provided
                const accNums = new Set(transactions.map(t => t.accountNumber));
                if (accNums.size > 0) {
                    accounts = Array.from(accNums).map(acc => ({
                        accountNumber: acc,
                        provider: transactions.find(t => t.accountNumber === acc)?.provider || provider
                    }));
                } else {
                    accounts = [{ accountNumber: extracted.accountNumber || accountNumber, provider }];
                }
            }

            return {
                transactions,
                accounts
            };
        } catch (error: any) {
            serverLogger.error(`AI Document parsing failed: ${error.message}`);
            throw error;
        }
    }

    async updateCategoryInCache(description: string, category: string): Promise<void> {
        // await this.loadCache();
        // this.cache[description] = category;
        // await this.saveCache();
        this.dbService.setCategory(description, category);
        serverLogger.info(`Category updated in cache for description: "${description}" -> "${category}"`);
    }

    /**
     * Robustly extracts JSON from an AI response string, handling markdown and preamble.
     */
    private extractJson(text: string): any {
        // Try direct parse first
        try {
            return JSON.parse(text.trim());
        } catch (directErr) {
            // Continue to sanitization attempts
        }

        // Remove common markdown fences and extract inner content if present
        const jsonMatch = text.match(/```json\s?([\s\S]*?)\s?```/) || text.match(/```\s?([\s\S]*?)\s?```/);
        let candidate = jsonMatch && jsonMatch[1] ? jsonMatch[1].trim() : text;

        // Fuzzy extract between first { and last }
        const startIdx = candidate.indexOf('{');
        const endIdx = candidate.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            candidate = candidate.substring(startIdx, endIdx + 1);
        }

        // Sanitization heuristics
        const sanitize = (input: string) => {
            let s = input;

            // Normalize smart quotes to straight
            s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

            // Remove extraneous backticks
            s = s.replace(/`/g, '');

            // Replace single quotes around property names/strings with double quotes
            // This is a best-effort transform; may not be perfect for all edge cases.
            s = s.replace(/'([^']*)'/g, function (_m, p1) {
                return '"' + p1.replace(/"/g, '\\"') + '"';
            });

            // Ensure property names are quoted: { key: -> { "key":
            s = s.replace(/([,{\s])([A-Za-z0-9_\- ]+)\s*:/g, function (_m, p1, p2) {
                // If already quoted, leave as-is
                if (/^\s*"/.test(p2)) return _m;
                return `${p1}\"${p2.replace(/\"/g, '\\\"')}\":`;
            });

            // Remove trailing commas before } or ]
            s = s.replace(/,\s*(?=[}\]])/g, '');

            return s;
        };

        const sanitized = sanitize(candidate);

        try {
            return JSON.parse(sanitized);
        } catch (sanitizedErr: any) {
            // As a last resort, provide helpful error including original and sanitized snippets
            const sample = (candidate && candidate.length > 500) ? candidate.substring(0, 500) : candidate;
            throw new Error(`JSON parsing failed: ${sanitizedErr.message}. Candidate excerpt: ${sample}`);
        }
    }

    private escapeCsvCell(value: unknown): string {
        if (value === undefined || value === null) return '';
        let strValue = String(value);
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
            strValue = `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
    }

    /**
     * Converts transactions to a compact CSV format to save tokens.
     * Removes irrelevant fields like 'id' and 'processedDate'.
     */
    private formatTransactionsForAI(transactions: Transaction[]): string {
        if (!transactions || transactions.length === 0) return '';

        // Define relevant fields to include in the CSV
        // id, processedDate, chargedAmount, status, type, provider, accountNumber, etc. are usually less relevant for high-level analysis
        const headers = ['date', 'description', 'amount', 'originalAmount', 'originalCurrency', 'category', 'memo', 'txnType'];

        const csvRows = transactions.map((t) =>
            headers.map((header) => this.escapeCsvCell((t as any)[header])).join(',')
        );

        return [headers.join(','), ...csvRows].join('\n');
    }

    /**
     * Historical + current scrape in one CSV; `scope` is `historical` or `current_scrape`.
     */
    private formatSplitTransactionsForAI(oldTx: Transaction[], newTx: Transaction[]): string {
        const headers = ['scope', 'date', 'description', 'amount', 'originalAmount', 'originalCurrency', 'category', 'memo', 'txnType'];
        const dataHeaders = headers.slice(1);
        const rows: string[] = [];
        for (const t of oldTx) {
            rows.push(
                [this.escapeCsvCell('historical'), ...dataHeaders.map((h) => this.escapeCsvCell((t as any)[h]))].join(',')
            );
        }
        for (const t of newTx) {
            rows.push(
                [this.escapeCsvCell('current_scrape'), ...dataHeaders.map((h) => this.escapeCsvCell((t as any)[h]))].join(',')
            );
        }
        return [headers.join(','), ...rows].join('\n');
    }
}
