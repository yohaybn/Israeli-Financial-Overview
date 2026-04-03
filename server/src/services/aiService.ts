import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import {
    Transaction,
    Account,
    mergeCategoryMeta,
    type ExpenseMetaCategory,
    type UserPersonaContext,
    isUserPersonaEmpty,
    mergeUserPersonaContext,
    normalizePersonaExtractFromAi,
    type PersonaExtractFromNarrativeResult,
    parseInsightRuleDefinition,
    type InsightRuleDefinitionV1
} from '@app/shared';
import { attachGeminiRateLimitToError } from '../utils/geminiRateLimitCapture.js';
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
const SETTINGS_FILE = path.join(DATA_DIR, 'config', 'ai_settings.json');

export interface AiSettings {
    categorizationModel: string;
    chatModel: string;
    categories: string[];
    defaultCategory: string;
    /** Per allowed category label: fixed / variable / optimization / excluded (income & transfers). */
    categoryMeta?: Record<string, ExpenseMetaCategory>;
    /** 0 = disabled. Insights older than this many days are removed periodically and after saving settings. */
    memoryInsightRetentionDays?: number;
    /** 0 = disabled. Alerts older than this many days are removed periodically and after saving settings. */
    memoryAlertRetentionDays?: number;
    /** Onboarding / AI tab: persona alignment injected into unified analyst prompts. */
    userContext?: UserPersonaContext;
    /**
     * When false, saved persona data is kept but not sent to the AI (default: true).
     */
    personaInjectionEnabled?: boolean;
    /**
     * Max transaction rows sent to the AI analyst (unified chat, legacy /chat, Telegram).
     * 0 = no limit (all rows). Newest-first lists should pass the first N rows after sort.
     */
    analystMaxTransactionRows?: number;
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

/**
 * Injected into analyst prompts so the model does not misread CSV columns.
 * `originalAmount` often differs from the posted ILS figure for installment totals vs posted slice, or foreign-currency charges.
 */
const ANALYZE_TXN_CSV_COLUMN_HINT =
    'Transaction CSV semantics: `amount` is the charged/posted amount in the account currency (usually ILS), taken from each row\'s charged amount when present (the bank\'s ILS debit/credit). ' +
    '`originalAmount` is the source figure when it differs from that posting: either the total for installment / multi-payment purchases (or the plan total as recorded by the bank), or the charge amount in the original foreign currency; use `originalCurrency` together with these columns.';

/** Prefer model `chargedAmount` over `amount` (some exports omit `amount` but include charged ILS). */
function canonicalAmountFromExtracted(t: { chargedAmount?: unknown; amount?: unknown }): number {
    for (const v of [t.chargedAmount, t.amount]) {
        if (v === null || v === undefined || v === '') continue;
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) return n;
    }
    return 0;
}

/** Returned when categorization cannot call the model; cache-only mapping is still applied. */
export const AI_CATEGORIZATION_NO_API_KEY = 'GEMINI_API_KEY not configured';

export interface CategorizeTransactionsResult {
    transactions: Transaction[];
    /** Set when the model was not used successfully; cached categories are still applied where available (unless {@link CategorizeTransactionsOptions.skipCache}). */
    aiError?: string;
    /**
     * When {@link CategorizeTransactionsOptions.skipCache} was used and the model succeeded: exact description → category from the model response.
     * Use this to apply force recategorization (cache may omit default-bucket answers on purpose).
     */
    descriptionCategories?: Record<string, string>;
}

/** Options for {@link AiService.categorizeTransactions}. */
export interface CategorizeTransactionsOptions {
    /**
     * When true: send every description to the model (ignore DB cache for the request), and do not fall back
     * to cache-only mapping if there is no API key or the model call fails.
     */
    skipCache?: boolean;
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
    memoryAlertRetentionDays: 0,
    userContext: {},
    personaInjectionEnabled: true,
    analystMaxTransactionRows: 0
};

export class AiService {
    private genAI: GoogleGenerativeAI | null = null;
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
            const maxRows = Math.floor(Number(raw.analystMaxTransactionRows ?? DEFAULT_SETTINGS.analystMaxTransactionRows) || 0);
            raw.analystMaxTransactionRows = Math.max(0, Math.min(500_000, maxRows));
            this.settings = raw;
        } else {
            this.settings = { ...DEFAULT_SETTINGS };
        }
        this.settings = {
            ...this.settings,
            categoryMeta: mergeCategoryMeta(this.settings.categories, this.settings.categoryMeta),
        };
    }

    async getSettings(): Promise<AiSettings> {
        await this.loadSettings();
        return this.settings;
    }

    async updateSettings(newSettings: Partial<AiSettings>): Promise<AiSettings> {
        const { userContext: incomingPersona, ...rest } = newSettings;
        const next = { ...this.settings, ...rest };
        if (incomingPersona !== undefined) {
            next.userContext = mergeUserPersonaContext(this.settings.userContext, incomingPersona);
        }
        if (next.memoryInsightRetentionDays !== undefined) {
            next.memoryInsightRetentionDays = Math.max(0, Math.min(3650, Math.floor(Number(next.memoryInsightRetentionDays) || 0)));
        }
        if (next.memoryAlertRetentionDays !== undefined) {
            next.memoryAlertRetentionDays = Math.max(0, Math.min(3650, Math.floor(Number(next.memoryAlertRetentionDays) || 0)));
        }
        if (next.analystMaxTransactionRows !== undefined) {
            next.analystMaxTransactionRows = Math.max(0, Math.min(500_000, Math.floor(Number(next.analystMaxTransactionRows) || 0)));
        }
        next.categoryMeta = mergeCategoryMeta(next.categories, next.categoryMeta);
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

    async categorizeTransactions(
        transactions: Transaction[],
        options?: CategorizeTransactionsOptions
    ): Promise<CategorizeTransactionsResult> {
        await this.loadSettings();
        const skipCache = options?.skipCache === true;

        if (!this.genAI) {
            if (skipCache) {
                serverLogger.info('Categorization: no GEMINI_API_KEY; skipCache requires AI (no cache fallback)');
                return {
                    transactions: transactions.map((t) => ({ ...t })),
                    aiError: AI_CATEGORIZATION_NO_API_KEY,
                };
            }
            serverLogger.info('Categorization: no GEMINI_API_KEY; applying category cache only');
            return {
                transactions: this.mapTransactionsWithCategoryCache(transactions),
                aiError: AI_CATEGORIZATION_NO_API_KEY,
            };
        }

        serverLogger.info(`Categorizing ${transactions.length} transactions using ${this.settings.categorizationModel}`);

        const model = this.genAI.getGenerativeModel({ model: this.settings.categorizationModel });

        // Skip descriptions the user locked in the UI; unless skipCache: only uncached descriptions
        const uncategorized = skipCache
            ? transactions.filter((t) => !this.dbService.descriptionHasUserSetCategory(t.description))
            : transactions.filter(
                  (t) =>
                      !this.dbService.getCategory(t.description) &&
                      !this.dbService.descriptionHasUserSetCategory(t.description)
              );
        if (skipCache) {
            serverLogger.info(`skipCache: sending all ${uncategorized.length} rows to model (cache ignored for this request)`);
        } else {
            serverLogger.info(`${transactions.length - uncategorized.length} already in cache, ${uncategorized.length} to categorize`);
        }

        if (uncategorized.length === 0) {
            return { transactions: this.mapTransactionsWithCategoryCache(transactions) };
        }

        // Prepare prompt
        const descriptions = Array.from(new Set(uncategorized.map((t) => t.description)));
        const prompt = `
            Analyze the Objective: You are a professional financial assistant specializing in Israeli banking. 
            Your core task is to categorize the following transaction descriptions into the most appropriate category.

            ${skipCache ? 'Re-evaluate every description below from scratch; do not rely on any prior categorization.\n\n' : ''}
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

            // Save to DB (when forcing re-categorization, do not store the default bucket — keeps prior cache when the model is unsure)
            for (const [desc, cat] of Object.entries(categoriesMap)) {
                const c = String(cat);
                if (this.dbService.descriptionHasUserSetCategory(desc)) continue;
                if (skipCache && c === this.settings.defaultCategory) continue;
                this.dbService.setCategory(desc, c);
            }
            // Object.assign(this.cache, categoriesMap);
            // await this.saveCache();
            // serverLogger.info(`Cache saved to ${CACHE_FILE}`);

            return {
                transactions: this.mapTransactionsWithCategoryCache(transactions),
                ...(skipCache ? { descriptionCategories: categoriesMap } : {}),
            };
        } catch (error: any) {
            const latencyMs = Date.now() - (startTime || Date.now());

            // Log the error
            await logAIError(
                this.settings.categorizationModel,
                'gemini',
                `Categorize ${descriptions.length} descriptions`,
                error,
                {
                    latencyMs,
                    systemPrompt: `Categorize Israeli bank transactions. Categories: ${this.settings.categories.join(', ')}`
                }
            );

            serverLogger.error(`Categorization failed: ${error.message}`);
            return {
                transactions: skipCache
                    ? transactions.map((t) => ({ ...t }))
                    : this.mapTransactionsWithCategoryCache(transactions),
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
            ${ANALYZE_TXN_CSV_COLUMN_HINT}

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
            ${ANALYZE_TXN_CSV_COLUMN_HINT}

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
            ${ANALYZE_TXN_CSV_COLUMN_HINT}

            Question: ${query}

            Constraints & Output Format:
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;
                    userParts = [{ fileData: { mimeType: up.mimeType, fileUri: up.uri } }, { text: currentPrompt }];
                } else {
                    currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.

            [Note: CSV is inline because upload to the AI file service failed (e.g. network/DNS/firewall/proxy).]\n\n
            ${ANALYZE_TXN_CSV_COLUMN_HINT}

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

            ${ANALYZE_TXN_CSV_COLUMN_HINT}
            
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
            await logAIError(this.settings.chatModel, 'gemini', query, error, {
                latencyMs,
                systemPrompt: systemInstruction
            });

            attachGeminiRateLimitToError(error);
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
    /** Groups user category labels by meta bucket for unified-chat context. */
    private categoryMetaContextForPrompt(): string {
        const meta = this.settings.categoryMeta;
        if (!meta || Object.keys(meta).length === 0) return '';
        const by: Record<ExpenseMetaCategory, string[]> = {
            fixed: [],
            variable: [],
            optimization: [],
            excluded: [],
        };
        for (const [cat, bucket] of Object.entries(meta)) {
            if (bucket && by[bucket as ExpenseMetaCategory]) {
                by[bucket as ExpenseMetaCategory].push(cat);
            }
        }
        return (
            '\nUser expense meta-categories (fixed = obligations-style, variable = fluctuating spend, optimization = discretionary levers, excluded = income/transfers/out of this lens):\n' +
            `- fixed: ${by.fixed.join(', ') || '—'}\n` +
            `- variable: ${by.variable.join(', ') || '—'}\n` +
            `- optimization: ${by.optimization.join(', ') || '—'}\n` +
            `- excluded_from_expense_meta: ${by.excluded.join(', ') || '—'}\n`
        );
    }

    async analyzeDataStructured(query: string, transactions: Transaction[], options?: AnalyzeDataOptions): Promise<StructuredChatResult> {
        if (options?.transactionSplit) {
            throw new Error('Structured chat does not support transactionSplit; use analyzeData instead.');
        }
        if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.loadSettings();
        const temperature = options?.temperature ?? 0.7;
        const personaHint =
            this.settings.personaInjectionEnabled !== false &&
            this.settings.userContext &&
            !isUserPersonaEmpty(this.settings.userContext)
                ? ' Adapt tone, depth, and priorities to the User persona alignment JSON in the user message when present; if it conflicts with stored facts, prefer stored facts.'
                : '';
        const systemInstruction =
            'You are a professional financial analyst. Reply with a single JSON object exactly as specified in the user message. ' +
            'Do not wrap JSON in markdown fences. Do not repeat prior insights verbatim; facts are long-term memory, insights are one-time analytical notes.' +
            personaHint;

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
            ${this.categoryMetaContextForPrompt()}
            The attached CSV file contains all ${transactions.length} transactions (${transactions.length} rows). Use it for the question below.
            ${ANALYZE_TXN_CSV_COLUMN_HINT}

            Question and instructions:
            ${fullQuery}
        `;
                userParts = [{ fileData: { mimeType: up.mimeType, fileUri: up.uri } }, { text: currentPrompt }];
            } else {
                currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.
            ${this.categoryMetaContextForPrompt()}
            [Note: CSV is inline because upload to the AI file service failed (e.g. network/DNS/firewall/proxy).]
            ${ANALYZE_TXN_CSV_COLUMN_HINT}

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
            ${this.categoryMetaContextForPrompt()}
            ${ANALYZE_TXN_CSV_COLUMN_HINT}
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
            await logAIError(this.settings.chatModel, 'gemini', query, error, {
                latencyMs,
                systemPrompt: systemInstruction
            });
            attachGeminiRateLimitToError(error);
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
            - The ILS posted/charged figure MUST appear in chargedAmount (primary). Also set amount to the same value when both are present.
            - Do not include currency symbols in numeric fields.
            - Ensure the 'originalAmount' follows the same polarity rules.

            Output the result ONLY as a JSON object with the following structure:
            {
              "transactions": [
                {
                  "date": "YYYY-MM-DDTHH:mm:ss.SSSZ",
                  "processedDate": "YYYY-MM-DDTHH:mm:ss.SSSZ",
                  "description": "merchant or transaction name",
                  "amount": number (same as chargedAmount when both present; MUST be negative for expenses),
                  "originalAmount": number (MUST be negative for expenses),
                  "originalCurrency": "ILS",
                  "chargedAmount": number (primary ILS posted amount; MUST be negative for expenses),
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
                const canonical = canonicalAmountFromExtracted(t);
                const baseTxn = {
                    accountNumber: txnAcc,
                    date: t.date,
                    originalAmount: t.originalAmount ?? t.amount ?? t.chargedAmount ?? canonical,
                    description: t.description,
                };

                return {
                    id: t.identifier || generateTransactionId(baseTxn),
                    date: t.date,
                    processedDate: t.processedDate || t.date,
                    description: t.description,
                    amount: canonical,
                    chargedAmount: canonical,
                    chargedCurrency: t.chargedCurrency || t.originalCurrency || 'ILS',
                    originalAmount: t.originalAmount ?? t.amount ?? t.chargedAmount ?? canonical,
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
            attachGeminiRateLimitToError(error);
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

    /** ILS posted figure for analyst CSV: prefer charged amount (some rows omit `amount`). */
    private amountForAnalystCsv(t: Transaction): number {
        for (const v of [t.chargedAmount, t.amount]) {
            if (v === null || v === undefined) continue;
            const n = typeof v === 'number' ? v : Number(v);
            if (Number.isFinite(n)) return n;
        }
        return 0;
    }

    /**
     * Converts transactions to a compact CSV format to save tokens.
     * Removes irrelevant fields like 'id' and 'processedDate'.
     */
    private formatTransactionsForAI(transactions: Transaction[]): string {
        if (!transactions || transactions.length === 0) return '';

        // Define relevant fields to include in the CSV
        // `amount` column uses chargedAmount first so rows with empty `amount` still analyze correctly
        const headers = ['date', 'description', 'amount', 'originalAmount', 'originalCurrency', 'category', 'memo', 'txnType'];

        const csvRows = transactions.map((t) =>
            headers
                .map((header) =>
                    header === 'amount'
                        ? this.escapeCsvCell(this.amountForAnalystCsv(t))
                        : this.escapeCsvCell((t as any)[header])
                )
                .join(',')
        );

        return [headers.join(','), ...csvRows].join('\n');
    }

    /**
     * Historical + current scrape in one CSV; `scope` is `historical` or `current_scrape`.
     */
    private formatSplitTransactionsForAI(oldTx: Transaction[], newTx: Transaction[]): string {
        const headers = ['scope', 'date', 'description', 'amount', 'originalAmount', 'originalCurrency', 'category', 'memo', 'txnType'];
        const dataHeaders = headers.slice(1);
        const cell = (t: Transaction, h: string) =>
            h === 'amount' ? this.escapeCsvCell(this.amountForAnalystCsv(t)) : this.escapeCsvCell((t as any)[h]);
        const rows: string[] = [];
        for (const t of oldTx) {
            rows.push(
                [this.escapeCsvCell('historical'), ...dataHeaders.map((h) => cell(t, h))].join(',')
            );
        }
        for (const t of newTx) {
            rows.push(
                [this.escapeCsvCell('current_scrape'), ...dataHeaders.map((h) => cell(t, h))].join(',')
            );
        }
        return [headers.join(','), ...rows].join('\n');
    }

    /**
     * Turn free-text household / finance notes into structured persona fields + short fact bullets (onboarding / AI settings).
     */
    async extractPersonaFromNarrative(narrative: string): Promise<PersonaExtractFromNarrativeResult> {
        await this.loadSettings();
        if (!this.genAI) {
            throw new Error('GEMINI_API_KEY not configured');
        }
        const trimmed = narrative?.trim() ?? '';
        if (!trimmed) {
            return { persona: {}, facts: [] };
        }

        const systemInstruction =
            'You are a careful assistant for a personal finance app. Extract only what the user clearly implied. ' +
            'Use the allowed enum values exactly when filling structured fields. If unsure, omit the field. ' +
            'Output must be a single JSON object matching the schema in the user message.';

        const userPrompt = `The user described their situation in natural language (may be Hebrew or English).

Return JSON with this exact shape:
{
  "facts": string[],
  "persona": {
    "profile": {
      "householdStatus": string | null,
      "residenceType": string | null,
      "technicalSkill": string | null,
      "cards": [ { "label": string | null, "cardType": string | null, "chargePaymentDay": number | null } ]
    },
    "financialGoals": {
      "primaryObjective": string | null,
      "topPriorities": string[],
      "monthlySavingsTarget": number | null,
      "incomes": [ { "label": string | null, "paymentDays": number[], "notes": string | null } ]
    },
    "aiPreferences": {
      "communicationStyle": string | null,
      "reportingDepth": string | null
    }
  }
}

Allowed values (use these strings only, or null):
- profile.householdStatus: single | couple_no_children | family_with_children | other
- profile.residenceType: rent | owned_no_mortgage | owned_mortgage | other
- profile.technicalSkill: beginner | intermediate | advanced | expert
- cards[].cardType: debit | charge_card | both | none
- financialGoals.primaryObjective: reduce_debt | identify_wasteful_spending | track_subscriptions | save_for_goal | general_visibility | other
- topPriorities items: saving_for_vacation | reducing_commissions | building_emergency_fund | investing | lowering_fixed_costs | other
- aiPreferences.communicationStyle: supportive_coach | neutral_analyst | critical_realist | brief_bullets
- aiPreferences.reportingDepth: low | high_level | standard | detailed_analysis

Rules:
- "facts": 3–8 short bullet strings in the user's language summarizing what you inferred (no JSON inside bullets).
- Add one cards[] row per distinct card product; add incomes[] rows for each salary, allowance, pension, or child benefit mentioned.
- paymentDays: calendar days 1–31 when mentioned (e.g. salary on the 1st and 15th → [1, 15]).
- chargePaymentDay: day of month for charge/credit card statement if mentioned.
- monthlySavingsTarget: number in local currency only if a clear monthly savings amount is stated.
- Omit persona.profile / persona.financialGoals / persona.aiPreferences keys entirely if nothing applies (or use empty objects where required by your JSON).
- Reply with JSON only, no markdown fences.

User text:
---
${trimmed}
---`;

        const model = this.genAI.getGenerativeModel({
            model: this.settings.chatModel,
            systemInstruction
        });

        const startTime = Date.now();
        try {
            const genResult = await runWithAILoadTracking(() =>
                model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 4096,
                        responseMimeType: 'application/json'
                    }
                } as Parameters<typeof model.generateContent>[0])
            );
            const response = await genResult.response;
            const text = response.text();
            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
                parsed = JSON.parse(fence ? fence[1].trim() : text.trim());
            }
            const normalized = normalizePersonaExtractFromAi(parsed);
            const usageMetadata = response.usageMetadata;
            await logAICall({
                model: this.settings.chatModel,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: systemInstruction,
                    userInput: `[persona extract] ${trimmed.length} chars`,
                    inputLength: trimmed.length
                },
                responseInfo: {
                    rawOutput: JSON.stringify(normalized),
                    finishReason: response.candidates?.[0]?.finishReason?.toString() || 'STOP',
                    success: true
                },
                metadata: {
                    promptTokens: usageMetadata?.promptTokenCount,
                    completionTokens: usageMetadata?.candidatesTokenCount,
                    totalTokens: usageMetadata?.totalTokenCount,
                    latencyMs: Date.now() - startTime
                }
            });
            return normalized;
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            await logAIError(this.settings.chatModel, 'gemini', '[persona extract]', err, {
                latencyMs: Date.now() - startTime,
                systemPrompt: systemInstruction
            });
            attachGeminiRateLimitToError(err);
            throw err;
        }
    }

    /**
     * Turn a natural-language description into a v1 insight rule definition (Gemini JSON).
     */
    async suggestInsightRuleDraft(userDescription: string): Promise<{ name: string; definition: InsightRuleDefinitionV1 }> {
        if (!this.genAI) {
            throw new Error(AI_CATEGORIZATION_NO_API_KEY);
        }
        const trimmed = userDescription.trim();
        if (!trimmed) {
            throw new Error('Description required');
        }
        const systemInstruction = `You output JSON only for an "insight rule" used by a personal finance app (Israeli bank data).
Schema of the JSON you return:
{
  "name": string,
  "definition": {
    "version": 1,
    "scope": "current_month" | "all" | "last_n_days",
    "lastNDays": number | omitted (required only when scope is last_n_days, 1-366),
    "condition": InsightRuleCondition,
    "output": {
      "kind": "insight" | "alert",
      "score": number (1-100),
      "message": { "en": string, "he": string }
    }
  }
}

InsightRuleCondition (recursive):
- { "op": "and", "items": [ InsightRuleCondition, ... ] }
- { "op": "or", "items": [ ... ] }
- { "op": "not", "item": InsightRuleCondition }
- { "op": "existsTxn", "where": TxnCondition }
- { "op": "sumExpensesGte", "amount": number, "category": optional string (Hebrew category label e.g. מזון) }
- { "op": "sumExpensesLte", "amount": number, "category": optional }
- { "op": "txnCountGte", "min": number, "category": optional }

TxnCondition:
- { "op": "and", "items": [ TxnCondition, ... ] } | { "op": "or", "items": [...] } | { "op": "not", "item": TxnCondition }
- { "op": "categoryEquals", "value": string }
- { "op": "categoryIn", "values": string[] }
- { "op": "memoOrDescriptionContains", "value": string }
- { "op": "accountEquals", "value": string }
- { "op": "ignored", "value": boolean }
- { "op": "amountAbsGte", "value": number }
- { "op": "amountAbsLte", "value": number }
- { "op": "isExpense" }

Message strings may use placeholders {{sum}}, {{count}}, {{category}}.
Prefer bilingual message.en and message.he.`;

        const userPrompt = `User request:\n---\n${trimmed}\n---`;

        const model = this.genAI.getGenerativeModel({
            model: this.settings.chatModel,
            systemInstruction,
        });

        const startTime = Date.now();
        try {
            const genResult = await runWithAILoadTracking(() =>
                model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 2048,
                        responseMimeType: 'application/json',
                    },
                } as Parameters<typeof model.generateContent>[0])
            );
            const response = await genResult.response;
            const text = response.text();
            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
                parsed = JSON.parse(fence ? fence[1].trim() : text.trim());
            }
            const obj = parsed as { name?: string; definition?: unknown };
            if (typeof obj.name !== 'string' || !obj.name.trim()) {
                throw new Error('Model did not return a valid name');
            }
            const defParsed = parseInsightRuleDefinition(obj.definition);
            if (!defParsed.ok) {
                throw new Error(defParsed.error);
            }
            const usageMetadata = response.usageMetadata;
            await logAICall({
                model: this.settings.chatModel,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: systemInstruction,
                    userInput: `[insight rule draft] ${trimmed.length} chars`,
                    inputLength: trimmed.length,
                },
                responseInfo: {
                    rawOutput: JSON.stringify({ name: obj.name, definition: defParsed.value }),
                    finishReason: response.candidates?.[0]?.finishReason?.toString() || 'STOP',
                    success: true,
                },
                metadata: {
                    promptTokens: usageMetadata?.promptTokenCount,
                    completionTokens: usageMetadata?.candidatesTokenCount,
                    totalTokens: usageMetadata?.totalTokenCount,
                    latencyMs: Date.now() - startTime,
                },
            });
            return { name: obj.name.trim(), definition: defParsed.value };
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            await logAIError(this.settings.chatModel, 'gemini', '[insight rule draft]', err, {
                latencyMs: Date.now() - startTime,
                systemPrompt: systemInstruction,
            });
            attachGeminiRateLimitToError(err);
            throw err;
        }
    }
}
