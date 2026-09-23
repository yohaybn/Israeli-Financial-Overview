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

import { AiSettings, DEFAULT_SETTINGS } from './types.js';

/**
 * Shared AI infrastructure: Gemini client, AI settings lifecycle and prompt/format
 * helpers used by every AI domain module. Extracted from aiService.ts.
 */
export class AiServiceCore {
    genAI: GoogleGenerativeAI | null = null;
    dbService: DbService;
    settings: AiSettings = DEFAULT_SETTINGS;


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



    async loadSettings() {
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
            if (
                !raw.analystPrivacyMode ||
                !['super_privacy', 'full_ai', 'hybrid'].includes(raw.analystPrivacyMode)
            ) {
                raw.analystPrivacyMode = raw.superPrivacyMode === true ? 'super_privacy' : 'hybrid';
            }
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

    /** Optional shared fallback model name when it differs from the primary model for this call. */
    effectiveFallbackModel(primaryModel: string): string | undefined {
        const fb = this.settings.fallbackModel?.trim();
        if (!fb || fb === primaryModel) return undefined;
        return fb;
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


    analyticsGenerationConfigPlain(options?: AnalyzeDataOptions): Record<string, unknown> {
        const temperature = options?.temperature ?? this.settings.analyticsTemperature ?? 0.7;
        const cfg: Record<string, unknown> = { temperature };
        if (this.settings.analyticsTopP !== undefined) cfg.topP = this.settings.analyticsTopP;
        if (this.settings.analyticsTopK !== undefined) cfg.topK = this.settings.analyticsTopK;
        if (this.settings.analyticsMaxOutputTokens !== undefined) cfg.maxOutputTokens = this.settings.analyticsMaxOutputTokens;
        return cfg;
    }


    analyticsGenerationConfigStructured(options?: AnalyzeDataOptions): Record<string, unknown> {
        return {
            ...this.analyticsGenerationConfigPlain(options),
            responseMimeType: 'application/json',
        };
    }

    /** Short label for the AI logs table (full payload goes in rawRequest). */
    aiLogTableSummary(text: string, maxLen = 120): string {
        const t = text.trim();
        if (t.length <= maxLen) return t;
        return `${t.slice(0, maxLen)}…`;
    }

    /** Groups user category labels by meta bucket for unified-chat context. */
    categoryMetaContextForPrompt(): string {
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

    /**
     * Robustly extracts JSON from an AI response string, handling markdown and preamble.
     */
    extractJson(text: string): any {
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


    escapeCsvCell(value: unknown): string {
        if (value === undefined || value === null) return '';
        let strValue = String(value);
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
            strValue = `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
    }

    /** ILS posted figure for analyst CSV: prefer charged amount (some rows omit `amount`). */

    /** ILS posted figure for analyst CSV: prefer charged amount (some rows omit `amount`). */
    amountForAnalystCsv(t: Transaction): number {
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

    /**
     * Converts transactions to a compact CSV format to save tokens.
     * Removes irrelevant fields like 'id' and 'processedDate'.
     */
    formatTransactionsForAI(transactions: Transaction[]): string {
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

    /**
     * Historical + current scrape in one CSV; `scope` is `historical` or `current_scrape`.
     */
    formatSplitTransactionsForAI(oldTx: Transaction[], newTx: Transaction[]): string {
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
}
