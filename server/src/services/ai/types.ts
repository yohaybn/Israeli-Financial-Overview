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
    sanitizeSqlAnalyticCard,
    type SqlAnalyticCardDefinition,
    type UserChartDefinition,
    type UserChartDataScope,
    type UserChartGroupBy,
    type UserChartKind,
    type UserChartMeasure,
} from '@app/shared';
import { attachGeminiRateLimitToError } from '../../utils/geminiRateLimitCapture.js';
import { isGeminiRateLimitOrOverloadError } from '../../utils/geminiRetryableError.js';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { serverLogger } from '../../utils/logger.js';
import { maskSensitiveData } from '../../utils/masking.js';
import {
    logAICall,
    logAIError,
    withAILogging,
    runWithAILoadTracking,
    serializeGeminiContentsForLog,
} from '../../utils/aiLogger.js';
import { DbService } from '../dbService.js';
import { buildAnalystSqlSchemaDoc } from '../analystSqlSchema.js';
import { executeAnalystQueries, type AnalystQueryResult } from '../analystSqlExecutor.js';
import type { AnalystPrivacyMode } from '../analystPrivacyMode.js';
import { ANALYST_CHAT_TEMPLATE_FORMAT_RULES, fillAnalystResponseTemplate } from '../analystSqlTemplate.js';

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
    /**
     * Analyst chat privacy: super_privacy (SQL only), full_ai (transaction rows), hybrid (SQL first, full AI on failure).
     * @default hybrid
     */
    analystPrivacyMode?: AnalystPrivacyMode;
    /** @deprecated Migrated to analystPrivacyMode on load */
    superPrivacyMode?: boolean;
    /** Super privacy: send persona JSON to the model (default false). Requires personaInjectionEnabled. */
    superPrivacySharePersona?: boolean;
    /** Super privacy: send stored AI memory facts (default false). */
    superPrivacyShareFacts?: boolean;
    /** Super privacy: send stored insights (default false). */
    superPrivacyShareInsights?: boolean;
    /** Super privacy: send stored alerts (default false). */
    superPrivacyShareAlerts?: boolean;
    /** Super privacy: send dashboard month/scope note from the client (default false). */
    superPrivacyShareDashboardContext?: boolean;
    /** Super privacy: send prior chat turns to the model (default false). */
    superPrivacyShareChatHistory?: boolean;
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

/** Options for {@link AiService.analyzeDataSuperPrivacy}. */
export interface SuperPrivacyChatOptions {
    conversationHistory?: ConversationTurn[];
    /** When set, queries must filter transactions to these ids (temp table _analyst_scope_ids). */
    scopeTransactionIds?: string[];
    scopeNote?: string;
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

/** Replace one stored fact line when life/finance context changed (oldText should match Stored facts). */
export type FactReplacement = { oldText: string; newText: string };

/** Unified AI chat: model returns user-facing text plus facts, scored insights, and scored alerts. */
export interface StructuredChatResult {
    response: string;
    facts: string[];
    factsReplace: FactReplacement[];
    insights: ScoredMemoryItem[];
    alerts: ScoredMemoryItem[];
    /** Set when the request succeeded using {@link AiSettings.fallbackModel} after a 429/503 on the primary model. */
    usedFallbackModel?: string;
}

/** Super-privacy SQL step (includes execution metadata for hybrid routing). */
export interface SuperPrivacyChatResult extends StructuredChatResult {
    parsedRaw?: Record<string, unknown>;
    queries?: { key: string; sql: string }[];
    sqlResults?: Record<string, AnalystQueryResult>;
    jsonParseFailed?: boolean;
}

export type { AnalystPrivacyMode } from '../analystPrivacyMode.js';

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

/** Parses model JSON `factsReplace`: `{ oldText, newText }[]` (aliases `old`/`new` accepted). */
export function normalizeFactReplacements(raw: unknown): FactReplacement[] {
    if (!Array.isArray(raw)) return [];
    const out: FactReplacement[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const oldText =
            (typeof o.oldText === 'string' ? o.oldText : typeof o.old === 'string' ? o.old : '').trim();
        const newText =
            (typeof o.newText === 'string' ? o.newText : typeof o.new === 'string' ? o.new : '').trim();
        if (!oldText || !newText) continue;
        if (oldText.toLowerCase() === newText.toLowerCase()) continue;
        out.push({ oldText, newText });
    }
    return out;
}

export const DEFAULT_SETTINGS: AiSettings = {
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
    analystMaxTransactionRows: 0,
    analystPrivacyMode: 'hybrid',
    superPrivacySharePersona: false,
    superPrivacyShareFacts: false,
    superPrivacyShareInsights: false,
    superPrivacyShareAlerts: false,
    superPrivacyShareDashboardContext: false,
    superPrivacyShareChatHistory: false,
};
