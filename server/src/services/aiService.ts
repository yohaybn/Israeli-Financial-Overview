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
    formatCategoryLabelsForPrompt,
    formatInsightRulePlaceholdersForPrompt,
    type InsightRuleDefinitionV1,
    assignBatchContentIdsFromTransactions,
    shouldPreserveScrapedTransactionId,
    sliceTransactionsForAnalyst,
    type FinancialReportLocaleMode,
} from '@app/shared';
import { attachGeminiRateLimitToError } from '../utils/geminiRateLimitCapture.js';
import { isGeminiRateLimitOrOverloadError } from '../utils/geminiRetryableError.js';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
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
     * Max transaction rows sent to the AI analyst (unified chat, Telegram).
     * 0 = no limit (all rows). Newest-first lists should pass the first N rows after sort.
     */
    analystMaxTransactionRows?: number;
    /**
     * Optional alternate Gemini model used for one retry when the primary model returns 429 or 503 (quota / overload).
     * Should differ from your primary chat and categorization models (often a smaller or different-tier model).
     */
    fallbackModel?: string;
    /** Appended to the user question for analyst calls (unified analyst chat, Telegram). */
    analyticsPromptExtra?: string;
    /** Appended to the analyst system instruction (plain and structured JSON replies). */
    analyticsSystemInstructionExtra?: string;
    /** Inserted before OUTPUT FORMAT in the categorization prompt. */
    categorizationPromptExtra?: string;
    /** Appended to the categorization system instruction. */
    categorizationSystemInstructionExtra?: string;
    /** Generation temperature for analyst (0–2). Default 0.7 when unset. */
    analyticsTemperature?: number;
    /** Generation temperature for categorization (0–2). Default 0.7 when unset. */
    categorizationTemperature?: number;
    /** Optional Gemini topP for analyst (0–1). */
    analyticsTopP?: number;
    categorizationTopP?: number;
    /** Optional Gemini topK for analyst. */
    analyticsTopK?: number;
    categorizationTopK?: number;
    /** Optional max output tokens for analyst. */
    analyticsMaxOutputTokens?: number;
    categorizationMaxOutputTokens?: number;
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
    'Transaction CSV semantics: `accountNumber` is the bank/card account identifier for that row. ' +
    '`amount` is the charged/posted amount in the account currency (usually ILS), taken from each row\'s charged amount when present (the bank\'s ILS debit/credit). ' +
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
    /** Primary model failed with 429/503; categorization succeeded with {@link AiSettings.fallbackModel}. */
    usedFallbackModel?: string;
    /** AI log entry ids for this categorization attempt (success and/or logged errors), newest-relevant first. */
    aiLogIds?: string[];
}

/** Options for {@link AiService.categorizeTransactions}. */
export interface CategorizeTransactionsOptions {
    /**
     * When true: send every description to the model (ignore DB cache for the request), and do not fall back
     * to cache-only mapping if there is no API key or the model call fails.
     */
    skipCache?: boolean;
    /**
     * When {@link skipCache} is false: still send these descriptions to the model even if they already have a
     * categories_cache row (e.g. bulk "recategorize default bucket" where cache and txn both held the default).
     */
    alwaysCategorizeDescriptions?: ReadonlySet<string> | readonly string[];
}

/** Item with importance 1–100 (100 = most important). */
export interface ScoredMemoryItem {
    text: string;
    /** Clamped 1–100 when persisting */
    score: number;
}

export interface FinancialReportBilingualBlock {
    he: string;
    en: string;
}

export interface FinancialReportInsightNarrative {
    title: FinancialReportBilingualBlock;
    detail: FinancialReportBilingualBlock;
    action: FinancialReportBilingualBlock;
    tags?: string[];
}

/** Gemini JSON output for the financial PDF narrative sections. */
export interface FinancialReportNarrative {
    executiveSummary: FinancialReportBilingualBlock;
    insights: FinancialReportInsightNarrative[];
}

/** Unified AI chat: model returns user-facing text plus facts, scored insights, and scored alerts. */
export interface StructuredChatResult {
    response: string;
    facts: string[];
    insights: ScoredMemoryItem[];
    alerts: ScoredMemoryItem[];
    /** Set when the request succeeded using {@link AiSettings.fallbackModel} after a 429/503 on the primary model. */
    usedFallbackModel?: string;
}

/** Result of {@link AiService.analyzeData} including optional fallback metadata. */
export interface AnalyzeDataResult {
    text: string;
    usedFallbackModel?: string;
    /** AI log entry ids for this request (success and/or logged errors before a thrown failure). */
    aiLogIds?: string[];
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
    categories: [
        'סופרמרקט',
        'מכולות ופיצוציות',
        'פארם וטואלטיקה',
        'מסעדות ובתי קפה',
        'משלוחי מזון',
        'אלכוהול וטבק',
        'דלק וטעינה',
        'תחבורה ציבורית ומוניות',
        'אחזקת רכב',
        'חניה ואגרות',
        'חשבונות בית',
        'תקשורת וסטרימינג',
        'תחזוקת הבית',
        'ריהוט וציוד לבית',
        'ביגוד והנעלה',
        'קניות אונליין',
        'אלקטרוניקה ומחשוב',
        'תוכנה ושירותי ענן',
        'חינוך',
        'חוגים והעשרה',
        'ציוד ילדים',
        'בעלי חיים',
        'טיפוח וקוסמטיקה',
        'ספורט וכושר',
        'פנאי ובידור',
        'חופשות וטיסות',
        'אירועים ושמחות',
        'מתנות',
        'תרומות',
        'בריאות',
        'משכנתא והלוואות',
        'עמלות וריבית',
        'קנסות ואגרות',
        'ביטוחים',
        'חיסכון והשקעות',
        'שכר',
        'קצבאות',
        'משיכת מזומן',
        'העברות',
        'אחר',
    ],
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
        if (next.fallbackModel !== undefined) {
            const t = String(next.fallbackModel).trim();
            next.fallbackModel = t || undefined;
        }
        const optStr = (v: unknown) => {
            if (v === null || v === undefined) return undefined;
            return typeof v === 'string' ? v.trim() || undefined : undefined;
        };
        if ('analyticsPromptExtra' in rest) next.analyticsPromptExtra = optStr(rest.analyticsPromptExtra);
        if ('analyticsSystemInstructionExtra' in rest) next.analyticsSystemInstructionExtra = optStr(rest.analyticsSystemInstructionExtra);
        if ('categorizationPromptExtra' in rest) next.categorizationPromptExtra = optStr(rest.categorizationPromptExtra);
        if ('categorizationSystemInstructionExtra' in rest) next.categorizationSystemInstructionExtra = optStr(rest.categorizationSystemInstructionExtra);

        const optFloat = (v: unknown, min: number, max: number): number | undefined => {
            if (v === undefined || v === null || v === '') return undefined;
            const n = typeof v === 'number' ? v : Number(v);
            if (!Number.isFinite(n)) return undefined;
            return Math.max(min, Math.min(max, n));
        };
        if ('analyticsTemperature' in rest) next.analyticsTemperature = optFloat(rest.analyticsTemperature, 0, 2);
        if ('categorizationTemperature' in rest) next.categorizationTemperature = optFloat(rest.categorizationTemperature, 0, 2);
        if ('analyticsTopP' in rest) next.analyticsTopP = optFloat(rest.analyticsTopP, 0, 1);
        if ('categorizationTopP' in rest) next.categorizationTopP = optFloat(rest.categorizationTopP, 0, 1);
        if ('analyticsTopK' in rest) next.analyticsTopK = optFloat(rest.analyticsTopK, 1, 500);
        if ('categorizationTopK' in rest) next.categorizationTopK = optFloat(rest.categorizationTopK, 1, 500);
        if ('analyticsMaxOutputTokens' in rest) next.analyticsMaxOutputTokens = optFloat(rest.analyticsMaxOutputTokens, 1, 65536);
        if ('categorizationMaxOutputTokens' in rest) next.categorizationMaxOutputTokens = optFloat(rest.categorizationMaxOutputTokens, 1, 65536);

        next.categoryMeta = mergeCategoryMeta(next.categories, next.categoryMeta);
        this.settings = next;
        const CONFIG_DIR = path.join(DATA_DIR, 'config');
        await fs.ensureDir(CONFIG_DIR);
        await fs.writeJson(SETTINGS_FILE, this.settings, { spaces: 2 });
        serverLogger.info(`Settings updated and saved to ${SETTINGS_FILE} `);
        return this.settings;
    }

    /** Optional shared fallback model name when it differs from the primary model for this call. */
    private effectiveFallbackModel(primaryModel: string): string | undefined {
        const fb = this.settings.fallbackModel?.trim();
        if (!fb || fb === primaryModel) return undefined;
        return fb;
    }

    private appendAnalyticsPromptExtra(query: string): string {
        const extra = this.settings.analyticsPromptExtra?.trim();
        if (!extra) return query;
        return `${query}\n\nAdditional instructions:\n${extra}`;
    }

    private buildAnalyzeDataPlainSystemInstruction(): string {
        const base =
            'You are a professional financial analyst. Provide concise, data-driven answers based on provided transaction history. ' +
            'Do not repeat your previous analysis verbatim; when relevant, refer to prior points briefly and emphasize what is new or changed.';
        const extra = this.settings.analyticsSystemInstructionExtra?.trim();
        return extra ? `${base}\n\n${extra}` : base;
    }

    private analyticsGenerationConfigPlain(options?: AnalyzeDataOptions): Record<string, unknown> {
        const temperature = options?.temperature ?? this.settings.analyticsTemperature ?? 0.7;
        const cfg: Record<string, unknown> = { temperature };
        if (this.settings.analyticsTopP !== undefined) cfg.topP = this.settings.analyticsTopP;
        if (this.settings.analyticsTopK !== undefined) cfg.topK = this.settings.analyticsTopK;
        if (this.settings.analyticsMaxOutputTokens !== undefined) cfg.maxOutputTokens = this.settings.analyticsMaxOutputTokens;
        return cfg;
    }

    private analyticsGenerationConfigStructured(options?: AnalyzeDataOptions): Record<string, unknown> {
        return {
            ...this.analyticsGenerationConfigPlain(options),
            responseMimeType: 'application/json',
        };
    }

    private categorizationGenerationConfig(): Record<string, unknown> {
        const cfg: Record<string, unknown> = {
            temperature: this.settings.categorizationTemperature ?? 0.7,
            responseMimeType: 'application/json',
        };
        if (this.settings.categorizationTopP !== undefined) cfg.topP = this.settings.categorizationTopP;
        if (this.settings.categorizationTopK !== undefined) cfg.topK = this.settings.categorizationTopK;
        if (this.settings.categorizationMaxOutputTokens !== undefined) cfg.maxOutputTokens = this.settings.categorizationMaxOutputTokens;
        return cfg;
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
        const alwaysDesc = options?.alwaysCategorizeDescriptions;
        const alwaysSet =
            alwaysDesc == null
                ? null
                : alwaysDesc instanceof Set
                  ? alwaysDesc
                  : new Set(alwaysDesc);

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

        // Skip descriptions the user locked in the UI; unless skipCache: only uncached descriptions (+ optional always list)
        const uncategorized = skipCache
            ? transactions.filter((t) => !this.dbService.descriptionHasUserSetCategory(t.description))
            : transactions.filter((t) => {
                  if (this.dbService.descriptionHasUserSetCategory(t.description)) return false;
                  if (!this.dbService.getCategory(t.description)) return true;
                  return alwaysSet != null && alwaysSet.has(t.description);
              });
        if (skipCache) {
            serverLogger.info(`skipCache: sending all ${uncategorized.length} rows to model (cache ignored for this request)`);
        } else {
            serverLogger.info(`${transactions.length - uncategorized.length} already in cache, ${uncategorized.length} to categorize`);
        }

        if (uncategorized.length === 0) {
            return { transactions: this.mapTransactionsWithCategoryCache(transactions) };
        }

        // Prepare prompt — list descriptions as a JSON array so the model never has to put raw descriptions
        // (which may contain " e.g. עו"ש, בע"מ) inside JSON keys, which breaks parsing.
        const descriptions = Array.from(new Set(uncategorized.map((t) => t.description)));
        const descriptionsJson = JSON.stringify(descriptions);
        const catExtra = this.settings.categorizationPromptExtra?.trim();
        const prompt = `
            Analyze the Objective: You are a professional financial assistant specializing in Israeli banking. 
            Your core task is to categorize the following transaction descriptions into the most appropriate category.

            ${skipCache ? 'Re-evaluate every description below from scratch; do not rely on any prior categorization.\n\n' : ''}
            TRANSACTION DESCRIPTIONS (JSON array; index 0 is the first element, then 1, 2, ...):
            ${descriptionsJson}

            Constraints & Output Format:
            AVAILABLE CATEGORIES:
            ${this.settings.categories.join(', ')}

            DEFAULT CATEGORY:
            Use "${this.settings.defaultCategory}" if you are unsure or if the description doesn't fit any other category.

            ${catExtra ? `Additional instructions:\n${catExtra}\n\n` : ''}
            OUTPUT FORMAT:
            You MUST return a single VALID JSON object mapping each array index to a category.
            - Keys are string indices only: "0", "1", "2", ... matching the JSON array above (inclusive, every index).
            - Values are the selected category string from AVAILABLE CATEGORIES.
            - Do NOT put the original Hebrew/English description text in JSON keys or values except as the category name.

            Example (if there were exactly 2 descriptions in the array):
            {"0":"General","1":"Transport"}
            
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;

        const primary = this.settings.categorizationModel;
        const categorizationSystemPrompt =
            `Categorize Israeli bank transactions. Output JSON object with string keys "0","1",... mapping to category. Categories: ${this.settings.categories.join(', ')}` +
            (this.settings.categorizationSystemInstructionExtra?.trim()
                ? `\n\n${this.settings.categorizationSystemInstructionExtra.trim()}`
                : '');

        const runCategorizeWithModel = async (modelName: string) => {
            serverLogger.info(`Sending request to Gemini model: ${modelName}`, {
                categoryCount: this.settings.categories.length,
                descriptionCount: descriptions.length
            });
            const genStart = Date.now();
            const m = this.genAI!.getGenerativeModel({
                model: modelName,
                systemInstruction: categorizationSystemPrompt
            });
            const result = await runWithAILoadTracking(() =>
                m.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: this.categorizationGenerationConfig()
                })
            );
            const response = await result.response;
            const text = response.text();
            const latencyMs = Date.now() - genStart;

            serverLogger.debug(`Gemini raw response: ${text}`);

            let categoriesMap: Record<string, string> = {};
            try {
                const parsed = this.extractJson(text);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('Expected a JSON object mapping index strings to categories');
                }
                categoriesMap = this.indexMapToDescriptionCategories(parsed as Record<string, unknown>, descriptions);
                serverLogger.info(`Received ${Object.keys(categoriesMap).length} categories from AI`);
            } catch (parseError: any) {
                serverLogger.error(`Failed to parse AI response as JSON: ${parseError.message}`, {
                    rawText: text.substring(0, 500)
                });
                throw new Error(`AI categorization returned malformed data: ${parseError.message}`);
            }

            return { categoriesMap, response, latencyMs, modelName };
        };

        let startTime = Date.now();
        const aiLogIds: string[] = [];
        try {
            let outcome: Awaited<ReturnType<typeof runCategorizeWithModel>>;
            let usedFallbackModel: string | undefined;

            try {
                startTime = Date.now();
                outcome = await runCategorizeWithModel(primary);
            } catch (e1: any) {
                const fb = this.effectiveFallbackModel(primary);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                    const latencyMs = Date.now() - startTime;
                    const errId = await logAIError(primary, 'gemini', `Categorize ${descriptions.length} descriptions`, e1, {
                        latencyMs,
                        systemPrompt: categorizationSystemPrompt
                    });
                    if (errId) aiLogIds.push(errId);
                    serverLogger.error(`Categorization failed: ${e1.message}`);
                    return {
                        transactions: skipCache
                            ? transactions.map((t) => ({ ...t }))
                            : this.mapTransactionsWithCategoryCache(transactions),
                        aiError: e1.message || String(e1),
                        ...(aiLogIds.length ? { aiLogIds } : {})
                    };
                }
                const latencyMsPrimary = Date.now() - startTime;
                const primaryErrId = await logAIError(primary, 'gemini', `Categorize ${descriptions.length} descriptions`, e1, {
                    latencyMs: latencyMsPrimary,
                    systemPrompt: categorizationSystemPrompt
                });
                if (primaryErrId) aiLogIds.push(primaryErrId);
                serverLogger.warn(`Categorization: retrying with fallback model ${fb} after ${primary} was rate limited or overloaded`);
                startTime = Date.now();
                try {
                    outcome = await runCategorizeWithModel(fb);
                    usedFallbackModel = fb;
                } catch (e2: any) {
                    const latencyMs = Date.now() - startTime;
                    const fbErrId = await logAIError(fb, 'gemini', `Categorize ${descriptions.length} descriptions`, e2, {
                        latencyMs,
                        systemPrompt: categorizationSystemPrompt
                    });
                    if (fbErrId) aiLogIds.push(fbErrId);
                    serverLogger.error(`Categorization failed (fallback): ${e2.message}`);
                    return {
                        transactions: skipCache
                            ? transactions.map((t) => ({ ...t }))
                            : this.mapTransactionsWithCategoryCache(transactions),
                        aiError: e2.message || String(e2),
                        ...(aiLogIds.length ? { aiLogIds } : {})
                    };
                }
            }

            const { categoriesMap, response, latencyMs, modelName } = outcome;

            const descriptionsStr = descriptions.join(', ');
            const successId = await logAICall({
                model: modelName,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: categorizationSystemPrompt,
                    userInput: descriptionsStr,
                    inputLength: descriptions.length
                },
                responseInfo: {
                    rawOutput: `Successfully categorized ${Object.keys(categoriesMap).length} descriptions`,
                    finishReason: response.candidates?.[0]?.finishReason?.toString() || 'STOP',
                    success: true
                },
                metadata: {
                    promptTokens: response.usageMetadata?.promptTokenCount,
                    completionTokens: response.usageMetadata?.candidatesTokenCount,
                    totalTokens: response.usageMetadata?.totalTokenCount,
                    latencyMs
                }
            });
            if (successId) aiLogIds.push(successId);

            for (const [desc, cat] of Object.entries(categoriesMap)) {
                const c = String(cat);
                if (this.dbService.descriptionHasUserSetCategory(desc)) continue;
                if (skipCache && c === this.settings.defaultCategory) continue;
                this.dbService.setCategory(desc, c);
            }

            return {
                transactions: this.mapTransactionsWithCategoryCache(transactions),
                ...(skipCache ? { descriptionCategories: categoriesMap } : {}),
                ...(usedFallbackModel ? { usedFallbackModel } : {}),
                ...(aiLogIds.length ? { aiLogIds } : {})
            };
        } catch (error: any) {
            const latencyMs = Date.now() - (startTime || Date.now());
            const outerErrId = await logAIError(primary, 'gemini', `Categorize ${descriptions.length} descriptions`, error, {
                latencyMs,
                systemPrompt: categorizationSystemPrompt
            });
            if (outerErrId) aiLogIds.push(outerErrId);
            serverLogger.error(`Categorization failed: ${error.message}`);
            return {
                transactions: skipCache
                    ? transactions.map((t) => ({ ...t }))
                    : this.mapTransactionsWithCategoryCache(transactions),
                aiError: error.message || String(error),
                ...(aiLogIds.length ? { aiLogIds } : {})
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

    async analyzeData(query: string, transactions: Transaction[], options?: AnalyzeDataOptions): Promise<AnalyzeDataResult> {
        if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.loadSettings();
        const effectiveQuery = this.appendAnalyticsPromptExtra(query);
        const systemInstruction = this.buildAnalyzeDataPlainSystemInstruction();
        const primaryChat = this.settings.chatModel;

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

            Question: ${effectiveQuery}
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
                currentPrompt = buildSplitPromptCombinedFile(locale, oldTx.length, newTx.length, totalRows, effectiveQuery);
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

            Question: ${effectiveQuery}

            Constraints & Output Format:
            Unless otherwise specified, provide a concise response. Ensure all technical nuances are preserved while maintaining natural flow.
        `;
                    userParts = [{ fileData: { mimeType: up.mimeType, fileUri: up.uri } }, { text: currentPrompt }];
                } else {
                    currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.

            [Note: CSV is inline because upload to the AI file service failed (e.g. network/DNS/firewall/proxy).]\n\n
            ${ANALYZE_TXN_CSV_COLUMN_HINT}

            Question: ${effectiveQuery}

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
            
            Question: ${effectiveQuery}

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

        const generationConfig = this.analyticsGenerationConfigPlain(options);

        let startTime = Date.now();
        try {
            const aiLogIds: string[] = [];
            const runGeneration = async (chatModelName: string) => {
                const m = this.genAI!.getGenerativeModel({
                    model: chatModelName,
                    systemInstruction
                });
                const genStart = Date.now();
                const result = await runWithAILoadTracking(() =>
                    m.generateContent({
                        contents,
                        generationConfig
                    })
                );
                const response = await result.response;
                const text = response.text();
                const latencyMs = Date.now() - genStart;
                return { text, response, latencyMs, chatModelName };
            };

            let usedFallbackModel: string | undefined;
            let outcome: Awaited<ReturnType<typeof runGeneration>>;
            try {
                startTime = Date.now();
                outcome = await runGeneration(primaryChat);
            } catch (e1: any) {
                const fb = this.effectiveFallbackModel(primaryChat);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                    const latencyMs = Date.now() - startTime;
                    const errId = await logAIError(primaryChat, 'gemini', effectiveQuery, e1, {
                        latencyMs,
                        systemPrompt: systemInstruction
                    });
                    if (errId) aiLogIds.push(errId);
                    attachGeminiRateLimitToError(e1);
                    throw e1;
                }
                const latencyMsPrimary = Date.now() - startTime;
                const primaryErrId = await logAIError(primaryChat, 'gemini', effectiveQuery, e1, {
                    latencyMs: latencyMsPrimary,
                    systemPrompt: systemInstruction
                });
                if (primaryErrId) aiLogIds.push(primaryErrId);
                serverLogger.warn(`analyzeData: retrying with fallback model ${fb} after ${primaryChat} was rate limited or overloaded`);
                startTime = Date.now();
                try {
                    outcome = await runGeneration(fb);
                    usedFallbackModel = fb;
                } catch (e2: any) {
                    const latencyMs = Date.now() - startTime;
                    const fbErrId = await logAIError(fb, 'gemini', effectiveQuery, e2, {
                        latencyMs,
                        systemPrompt: systemInstruction
                    });
                    if (fbErrId) aiLogIds.push(fbErrId);
                    attachGeminiRateLimitToError(e2);
                    throw e2;
                }
            }

            const { text, response, latencyMs, chatModelName } = outcome;

            const logInputSummary = this.buildAnalyzeDataLogUserInput(currentPrompt, uploadedFileLog);

            const usageMetadata = response.usageMetadata;
            const successId = await logAICall({
                model: chatModelName,
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
            if (successId) aiLogIds.push(successId);

            return {
                text,
                ...(usedFallbackModel ? { usedFallbackModel } : {}),
                ...(aiLogIds.length ? { aiLogIds } : {})
            };
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
        const effectiveQuery = this.appendAnalyticsPromptExtra(query);
        const personaHint =
            this.settings.personaInjectionEnabled !== false &&
            this.settings.userContext &&
            !isUserPersonaEmpty(this.settings.userContext)
                ? ' Adapt tone, depth, and priorities to the User persona alignment JSON in the user message when present; if it conflicts with stored facts, prefer stored facts.'
                : '';
        const systemInstructionBase =
            'You are a professional financial analyst. Reply with a single JSON object exactly as specified in the user message. ' +
            'Do not wrap JSON in markdown fences. Do not repeat prior insights verbatim; facts are long-term memory, insights are one-time analytical notes.' +
            personaHint;
        const sysExtra = this.settings.analyticsSystemInstructionExtra?.trim();
        const systemInstruction = sysExtra ? `${systemInstructionBase}\n\n${sysExtra}` : systemInstructionBase;

        const primaryChat = this.settings.chatModel;

        const jsonSpec = `

---
OUTPUT FORMAT
Respond with one JSON object only (no markdown code fences, no text before or after). Schema:
{"response": string, "facts": string[], "insights": {"text": string, "score": number}[], "alerts": {"text": string, "score": number}[]}

- "response": Your main answer to the user (you may use markdown inside this string).
- "facts": Durable context worth remembering across sessions (life situation, goals, standing preferences). Do not duplicate items already listed under "Stored facts" in the prompt. Do not put raw one-off numbers here unless the user asked to remember them. Use an empty array if nothing new.
- "insights": Analytical observations (trends, comparisons, patterns). Each item MUST include "score" 1–100. Score bands: 1–35 = minor; 36–65 = notable; 66–100 = high-signal. Do not duplicate items under "Recent insights" in the prompt. Use an empty array if nothing new.
- "alerts": ONLY for items that genuinely need attention soon: clear overspend vs plan, missed or imminent payment deadline, fraud-like or highly unusual activity, or another time-critical risk. Put general tips, education, and non-urgent observations in "response" or "insights" instead—NOT here. Prefer at most 1–2 alerts per reply; use [] when there is nothing truly alert-worthy. Each item MUST include "score" 1–100. Alert score bands: 1–50 = watchlist (rarely needed); 51–74 = address soon; 75–84 = important; 85–100 = urgent/critical only—do not inflate scores. Do not duplicate "Recent alerts" below.

Facts are user-editable persistent memory. Insights and alerts are stored with scores for prioritization.`;

        const fullQuery = effectiveQuery + jsonSpec;

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

        const generationConfig = this.analyticsGenerationConfigStructured(options);

        let startTime = Date.now();
        try {
            const runGeneration = async (chatModelName: string) => {
                const m = this.genAI!.getGenerativeModel({
                    model: chatModelName,
                    systemInstruction
                });
                const genStart = Date.now();
                const result = await runWithAILoadTracking(() =>
                    m.generateContent({
                        contents,
                        generationConfig
                    })
                );
                const response = await result.response;
                const text = response.text();
                const latencyMs = Date.now() - genStart;
                return { text, response, latencyMs, chatModelName };
            };

            let usedFallbackModel: string | undefined;
            let outcome: Awaited<ReturnType<typeof runGeneration>>;
            try {
                startTime = Date.now();
                outcome = await runGeneration(primaryChat);
            } catch (e1: any) {
                const fb = this.effectiveFallbackModel(primaryChat);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                    const latencyMs = Date.now() - startTime;
                    await logAIError(primaryChat, 'gemini', effectiveQuery, e1, {
                        latencyMs,
                        systemPrompt: systemInstruction
                    });
                    attachGeminiRateLimitToError(e1);
                    throw e1;
                }
                const latencyMsPrimary = Date.now() - startTime;
                await logAIError(primaryChat, 'gemini', effectiveQuery, e1, {
                    latencyMs: latencyMsPrimary,
                    systemPrompt: systemInstruction
                });
                serverLogger.warn(`analyzeDataStructured: retrying with fallback model ${fb} after ${primaryChat} was rate limited or overloaded`);
                startTime = Date.now();
                try {
                    outcome = await runGeneration(fb);
                    usedFallbackModel = fb;
                } catch (e2: any) {
                    const latencyMs = Date.now() - startTime;
                    await logAIError(fb, 'gemini', effectiveQuery, e2, {
                        latencyMs,
                        systemPrompt: systemInstruction
                    });
                    attachGeminiRateLimitToError(e2);
                    throw e2;
                }
            }

            const { text, response, latencyMs, chatModelName } = outcome;

            const logInputSummary = this.buildAnalyzeDataLogUserInput(currentPrompt, uploadedFileLog);

            const usageMetadata = response.usageMetadata;
            await logAICall({
                model: chatModelName,
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
                    alerts: [],
                    ...(usedFallbackModel ? { usedFallbackModel } : {})
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
                alerts,
                ...(usedFallbackModel ? { usedFallbackModel } : {})
            };
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

    private personaContextForFinancialReport(): string {
        if (this.settings.personaInjectionEnabled === false) return '';
        const ctx = this.settings.userContext;
        if (!ctx || isUserPersonaEmpty(ctx)) return '';
        try {
            return `\nHousehold context (respect privacy; do not contradict; use only to tune tone and priorities):\n${JSON.stringify(ctx).slice(0, 4000)}\n`;
        } catch {
            return '';
        }
    }

    private normalizeBilingualBlock(raw: unknown): FinancialReportBilingualBlock {
        if (raw && typeof raw === 'object') {
            const o = raw as Record<string, unknown>;
            const he = typeof o.he === 'string' ? o.he : typeof o.textHe === 'string' ? o.textHe : '';
            const en = typeof o.en === 'string' ? o.en : typeof o.textEn === 'string' ? o.textEn : '';
            return { he: he.trim(), en: en.trim() };
        }
        if (typeof raw === 'string') {
            return { he: raw.trim(), en: raw.trim() };
        }
        return { he: '', en: '' };
    }

    /**
     * JSON narrative for financial PDF (executive summary + 3–5 insights). Returns null if no API key or on failure.
     */
    async generateFinancialReportNarrative(params: {
        monthYm: string;
        /** Overrides the default "Reporting month: YYYY-MM" line (e.g. all-time PDF). */
        reportPeriodDescription?: string;
        localeMode: FinancialReportLocaleMode;
        aggregatesSummary: string;
        transactions: Transaction[];
    }): Promise<FinancialReportNarrative | null> {
        if (!this.genAI) return null;
        await this.loadSettings();
        const maxRows = this.settings.analystMaxTransactionRows ?? 0;
        let txns = sliceTransactionsForAnalyst(params.transactions, maxRows);
        const primaryChat = this.settings.chatModel;
        const langRule =
            params.localeMode === 'he'
                ? 'All user-visible strings in JSON must be Hebrew only (use he field; en may be empty string).'
                : params.localeMode === 'en'
                  ? 'All user-visible strings in JSON must be English only (use en field; he may be empty string).'
                  : 'Provide both he and en for every text field (bilingual report).';

        const systemInstruction =
            'You are a financial analyst for Israeli household bank and card transactions (ILS). ' +
            'Output ONLY valid JSON matching the schema. Do not invent merchants or amounts. ' +
            'Use only the provided aggregates and transaction sample. Not professional investment advice. ' +
            'Produce 3–5 actionable insights (subscriptions, spikes, savings tips, anomalies). ' +
            'Executive summary: 2–4 sentences. No markdown in strings. ' +
            langRule;

        const periodLine = params.reportPeriodDescription ?? `Reporting month: ${params.monthYm}`;
        const userText =
            `${periodLine}\n` +
            `${this.categoryMetaContextForPrompt()}` +
            `${this.personaContextForFinancialReport()}` +
            `Aggregates and tables (trusted):\n${params.aggregatesSummary}\n\n` +
            `Transaction sample (newest first, CSV columns per app):\n${this.formatTransactionsForAI(txns)}\n\n` +
            'Respond with JSON exactly in this shape:\n' +
            '{"executiveSummary":{"he":"...","en":"..."},"insights":[' +
            '{"title":{"he":"...","en":"..."},"detail":{"he":"...","en":"..."},"action":{"he":"...","en":"..."},"tags":["saving_tip"]}' +
            ']}\n';

        const generationConfig = {
            ...this.analyticsGenerationConfigStructured({ temperature: 0.35 }),
        };

        const runGeneration = async (chatModelName: string) => {
            const m = this.genAI!.getGenerativeModel({ model: chatModelName, systemInstruction });
            const genStart = Date.now();
            const result = await runWithAILoadTracking(() =>
                m.generateContent({
                    contents: [{ role: 'user', parts: [{ text: userText }] }],
                    generationConfig,
                })
            );
            const response = await result.response;
            const text = response.text();
            const latencyMs = Date.now() - genStart;
            return { text, response, latencyMs, chatModelName };
        };

        try {
            let outcome: Awaited<ReturnType<typeof runGeneration>>;
            try {
                outcome = await runGeneration(primaryChat);
            } catch (e1: any) {
                const fb = this.effectiveFallbackModel(primaryChat);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) throw e1;
                outcome = await runGeneration(fb);
            }

            const { text, response, latencyMs, chatModelName } = outcome;
            const usageMetadata = response.usageMetadata;
            await logAICall({
                model: chatModelName,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: systemInstruction,
                    userInput: userText.slice(0, 8000),
                    inputLength: userText.length,
                },
                responseInfo: {
                    rawOutput: text,
                    finishReason: response.candidates?.[0]?.finishReason?.toString() || 'STOP',
                    success: true,
                },
                metadata: {
                    promptTokens: usageMetadata?.promptTokenCount,
                    completionTokens: usageMetadata?.candidatesTokenCount,
                    totalTokens: usageMetadata?.totalTokenCount,
                    latencyMs,
                },
            });

            let parsed: any;
            try {
                parsed = this.extractJson(text);
            } catch {
                return null;
            }
            const executiveSummary = this.normalizeBilingualBlock(parsed?.executiveSummary);
            const rawInsights = Array.isArray(parsed?.insights) ? parsed.insights : [];
            const insights: FinancialReportInsightNarrative[] = rawInsights.slice(0, 6).map((row: unknown) => {
                const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
                return {
                    title: this.normalizeBilingualBlock(r.title),
                    detail: this.normalizeBilingualBlock(r.detail),
                    action: this.normalizeBilingualBlock(r.action),
                    tags: Array.isArray(r.tags) ? r.tags.filter((x: unknown) => typeof x === 'string') : undefined,
                };
            });
            return { executiveSummary, insights };
        } catch (e: any) {
            serverLogger.warn('generateFinancialReportNarrative failed', { error: e?.message || String(e) });
            await logAIError(primaryChat, 'gemini', 'financial-report-narrative', e, {
                latencyMs: 0,
                systemPrompt: systemInstruction,
            });
            return null;
        }
    }

    /**
     * Bilingual short narrative comparing the report month to prior / YoY periods (trusted multi-month aggregates only).
     */
    async generateFinancialMonthComparisonNarrative(params: {
        reportMonthYm: string;
        localeMode: FinancialReportLocaleMode;
        comparisonContextSummary: string;
    }): Promise<FinancialReportBilingualBlock | null> {
        if (!this.genAI) return null;
        await this.loadSettings();
        const primaryChat = this.settings.chatModel;
        const langRule =
            params.localeMode === 'he'
                ? 'All user-visible strings in JSON must be Hebrew only (use he field; en may be empty string).'
                : params.localeMode === 'en'
                  ? 'All user-visible strings in JSON must be English only (use en field; he may be empty string).'
                  : 'Provide both he and en for every text field (bilingual report).';

        const systemInstruction =
            'You are a financial analyst for Israeli household cashflow (ILS). ' +
            'Output ONLY valid JSON: {"narrative":{"he":"...","en":"..."}}. ' +
            'Compare the report month to the other months in the data using ONLY the provided totals and category lists. ' +
            'Focus on 2–4 concrete shifts in leading expense categories, income, expenses, or net. Not professional investment advice. ' +
            'No markdown in strings. Do not invent merchants or months. ' +
            langRule;

        const userText =
            `Report month (treat as "current" in comparisons): ${params.reportMonthYm}\n\n` +
            `${this.categoryMetaContextForPrompt()}` +
            `${this.personaContextForFinancialReport()}` +
            `Multi-month aggregates (trusted):\n${params.comparisonContextSummary}\n\n` +
            'Respond with JSON exactly: {"narrative":{"he":"...","en":"..."}}\n';

        const generationConfig = {
            ...this.analyticsGenerationConfigStructured({ temperature: 0.35 }),
        };

        const runGeneration = async (chatModelName: string) => {
            const m = this.genAI!.getGenerativeModel({ model: chatModelName, systemInstruction });
            const genStart = Date.now();
            const result = await runWithAILoadTracking(() =>
                m.generateContent({
                    contents: [{ role: 'user', parts: [{ text: userText }] }],
                    generationConfig,
                })
            );
            const response = await result.response;
            const text = response.text();
            const latencyMs = Date.now() - genStart;
            return { text, response, latencyMs, chatModelName };
        };

        try {
            let outcome: Awaited<ReturnType<typeof runGeneration>>;
            try {
                outcome = await runGeneration(primaryChat);
            } catch (e1: any) {
                const fb = this.effectiveFallbackModel(primaryChat);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) throw e1;
                outcome = await runGeneration(fb);
            }

            const { text, response, latencyMs, chatModelName } = outcome;
            const usageMetadata = response.usageMetadata;
            await logAICall({
                model: chatModelName,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: systemInstruction,
                    userInput: userText.slice(0, 8000),
                    inputLength: userText.length,
                },
                responseInfo: {
                    rawOutput: text,
                    finishReason: response.candidates?.[0]?.finishReason?.toString() || 'STOP',
                    success: true,
                },
                metadata: {
                    promptTokens: usageMetadata?.promptTokenCount,
                    completionTokens: usageMetadata?.candidatesTokenCount,
                    totalTokens: usageMetadata?.totalTokenCount,
                    latencyMs,
                },
            });

            let parsed: any;
            try {
                parsed = this.extractJson(text);
            } catch {
                return null;
            }
            return this.normalizeBilingualBlock(parsed?.narrative);
        } catch (e: any) {
            serverLogger.warn('generateFinancialMonthComparisonNarrative failed', { error: e?.message || String(e) });
            await logAIError(primaryChat, 'gemini', 'financial-report-month-comparison', e, {
                latencyMs: 0,
                systemPrompt:
                    'You are a financial analyst for Israeli household cashflow (ILS). Output ONLY valid JSON: {"narrative":{"he":"...","en":"..."}}.',
            });
            return null;
        }
    }

    async parseDocument(text: string, provider: string = 'imported', accountNumber: string = 'unknown'): Promise<{ transactions: Transaction[], accounts: Account[] }> {
        if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.loadSettings();
        const primaryCat = this.settings.categorizationModel;

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
            const runParseWithModel = async (modelName: string) => {
                serverLogger.info(`AI Parsing document text (${text.length} chars) using ${modelName}`);
                const m = this.genAI!.getGenerativeModel({ model: modelName });
                const result = await runWithAILoadTracking(() =>
                    m.generateContent({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: 'application/json'
                        }
                    })
                );
                const response = await result.response;
                return response.text();
            };

            let resText: string;
            try {
                resText = await runParseWithModel(primaryCat);
            } catch (e1: any) {
                const fb = this.effectiveFallbackModel(primaryCat);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                    attachGeminiRateLimitToError(e1);
                    throw e1;
                }
                serverLogger.warn(`parseDocument: retrying with fallback model ${fb} after ${primaryCat} was rate limited or overloaded`);
                resText = await runParseWithModel(fb);
            }

            const extracted = this.extractJson(resText);

            const transactions: Transaction[] = (extracted.transactions || []).map((t: any) => {
                const txnAcc = t.accountNumber || extracted.accountNumber || accountNumber;
                const canonical = canonicalAmountFromExtracted(t);
                let id = '';
                let externalId: string | undefined;
                if (t.identifier && shouldPreserveScrapedTransactionId(String(t.identifier))) {
                    id = String(t.identifier);
                    externalId = String(t.identifier);
                } else if (t.identifier) {
                    externalId = String(t.identifier);
                }

                return {
                    id,
                    externalId,
                    sourceRef: 'import:ai-document',
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

            assignBatchContentIdsFromTransactions(transactions, {
                providerFallback: provider,
                accountFallback: accountNumber,
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
     * Turns `{"0":"Cat",...}` from categorizeTransactions into description -> category for DB/cache updates.
     */
    private indexMapToDescriptionCategories(
        parsed: Record<string, unknown>,
        descriptions: string[]
    ): Record<string, string> {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (!/^\d+$/.test(k)) continue;
            const i = Number(k);
            if (!Number.isFinite(i) || i < 0 || i >= descriptions.length) continue;
            out[descriptions[i]] = String(v);
        }
        return out;
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
        const headers = [
            'date',
            'accountNumber',
            'description',
            'amount',
            'originalAmount',
            'originalCurrency',
            'category',
            'memo',
            'txnType'
        ];

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
        const headers = [
            'scope',
            'date',
            'accountNumber',
            'description',
            'amount',
            'originalAmount',
            'originalCurrency',
            'category',
            'memo',
            'txnType'
        ];
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

        const primaryChat = this.settings.chatModel;

        const startTime = Date.now();
        const runPersonaGen = async (chatModelName: string) => {
                const m = this.genAI!.getGenerativeModel({
                    model: chatModelName,
                    systemInstruction
                });
                const genResult = await runWithAILoadTracking(() =>
                    m.generateContent({
                        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 4096,
                            responseMimeType: 'application/json'
                        }
                    } as Parameters<typeof m.generateContent>[0])
                );
                const response = await genResult.response;
                const text = response.text();
                return { response, text, chatModelName };
        };

        let outcome: Awaited<ReturnType<typeof runPersonaGen>>;
        try {
            outcome = await runPersonaGen(primaryChat);
        } catch (e1: any) {
            const fb = this.effectiveFallbackModel(primaryChat);
            if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                const err = e1 instanceof Error ? e1 : new Error(String(e1));
                await logAIError(primaryChat, 'gemini', '[persona extract]', err, {
                    latencyMs: Date.now() - startTime,
                    systemPrompt: systemInstruction
                });
                attachGeminiRateLimitToError(err);
                throw err;
            }
            await logAIError(primaryChat, 'gemini', '[persona extract]', e1 instanceof Error ? e1 : new Error(String(e1)), {
                latencyMs: Date.now() - startTime,
                systemPrompt: systemInstruction
            });
            serverLogger.warn(`extractPersonaFromNarrative: retrying with fallback model ${fb}`);
            try {
                outcome = await runPersonaGen(fb);
            } catch (e2: any) {
                const err = e2 instanceof Error ? e2 : new Error(String(e2));
                await logAIError(fb, 'gemini', '[persona extract]', err, {
                    latencyMs: Date.now() - startTime,
                    systemPrompt: systemInstruction
                });
                attachGeminiRateLimitToError(err);
                throw err;
            }
        }

        const { response, text, chatModelName } = outcome;
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
            model: chatModelName,
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
    }

    /**
     * Turn a natural-language description into a v1 insight rule definition (Gemini JSON).
     */
    async suggestInsightRuleDraft(userDescription: string): Promise<{ name: string; definition: InsightRuleDefinitionV1 }> {
        if (!this.genAI) {
            throw new Error(AI_CATEGORIZATION_NO_API_KEY);
        }
        await this.loadSettings();
        const trimmed = userDescription.trim();
        if (!trimmed) {
            throw new Error('Description required');
        }
        const placeholdersBlock = formatInsightRulePlaceholdersForPrompt();
        const categoriesBlock = formatCategoryLabelsForPrompt(this.settings.categories);
        const defaultCategory = this.settings.defaultCategory.trim() || 'אחר';

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
- { "op": "sumExpensesBetween", "minAmount": number, "maxAmount": number, "category": optional }
- { "op": "txnCountGte", "min": number, "category": optional }
- { "op": "txnCountBetween", "min": number, "max": number, "category": optional }
- { "op": "sumIncomeGte", "amount": number, "category": optional }
- { "op": "sumIncomeLte", "amount": number, "category": optional }
- { "op": "maxSingleExpenseGte", "amount": number, "category": optional }
- { "op": "shareOfCategoryGte", "category": string (required), "share": number between 0 and 1 (e.g. 0.35 = 35% of all expenses) }
- { "op": "netSavingsLte", "amount": number }  // fires when (sum income − sum expenses) ≤ amount

TxnCondition:
- { "op": "and", "items": [ TxnCondition, ... ] } | { "op": "or", "items": [...] } | { "op": "not", "item": TxnCondition }
- { "op": "categoryEquals", "value": string }
- { "op": "categoryIn", "values": string[] }
- { "op": "memoOrDescriptionContains", "value": string }
- { "op": "accountEquals", "value": string }
- { "op": "ignored", "value": boolean }
- { "op": "amountAbsGte", "value": number }
- { "op": "amountAbsLte", "value": number }
- { "op": "amountAbsBetween", "min": number, "max": number }
- { "op": "dayOfWeekIn", "days": number[] }  // each 0–6, 0=Sunday
- { "op": "isExpense" }
- { "op": "isIncome" }

Message template placeholders: use ONLY the following names inside double braces in output.message.en and output.message.he (the engine substitutes them when the rule matches; any other {{name}} is left empty):
${placeholdersBlock}

Category strings in JSON (optional category on aggregates, categoryEquals.value, shareOfCategoryGte.category, categoryIn.values, etc.) MUST use EXACT labels from this canonical list — same strings as the app’s AI categorization and transaction data:
${categoriesBlock}

If the user names something not in the list, pick the closest label from the list or use the default category: "${defaultCategory}".

Prefer bilingual message.en and message.he.

The top-level "name" string must be a short human-readable rule title in the same natural language as the user's request (e.g. Hebrew in → Hebrew title, English in → English title, mixed → follow the dominant language of the request).`;

        const userPrompt = `User request:\n---\n${trimmed}\n---`;

        const primaryChat = this.settings.chatModel;

        const startTime = Date.now();
        const runDraftGen = async (chatModelName: string) => {
            const m = this.genAI!.getGenerativeModel({
                model: chatModelName,
                systemInstruction,
            });
            const genResult = await runWithAILoadTracking(() =>
                m.generateContent({
                    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 2048,
                        responseMimeType: 'application/json',
                    },
                } as Parameters<typeof m.generateContent>[0])
            );
            const response = await genResult.response;
            const text = response.text();
            return { response, text, chatModelName };
        };

        let outcome: Awaited<ReturnType<typeof runDraftGen>>;
        try {
            outcome = await runDraftGen(primaryChat);
        } catch (e1: any) {
            const fb = this.effectiveFallbackModel(primaryChat);
            if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                const err = e1 instanceof Error ? e1 : new Error(String(e1));
                await logAIError(primaryChat, 'gemini', '[insight rule draft]', err, {
                    latencyMs: Date.now() - startTime,
                    systemPrompt: systemInstruction,
                });
                attachGeminiRateLimitToError(err);
                throw err;
            }
            await logAIError(primaryChat, 'gemini', '[insight rule draft]', e1 instanceof Error ? e1 : new Error(String(e1)), {
                latencyMs: Date.now() - startTime,
                systemPrompt: systemInstruction,
            });
            serverLogger.warn(`suggestInsightRuleDraft: retrying with fallback model ${fb}`);
            try {
                outcome = await runDraftGen(fb);
            } catch (e2: any) {
                const err = e2 instanceof Error ? e2 : new Error(String(e2));
                await logAIError(fb, 'gemini', '[insight rule draft]', err, {
                    latencyMs: Date.now() - startTime,
                    systemPrompt: systemInstruction,
                });
                attachGeminiRateLimitToError(err);
                throw err;
            }
        }

        const { response, text, chatModelName } = outcome;
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
            model: chatModelName,
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
    }
}
