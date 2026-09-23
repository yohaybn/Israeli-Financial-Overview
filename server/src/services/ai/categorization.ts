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

import { AiServiceCore } from './core.js';

export class AiCategorization {
    constructor(private core: AiServiceCore) {}


    async categorizeTransactions(
        transactions: Transaction[],
        options?: CategorizeTransactionsOptions
    ): Promise<CategorizeTransactionsResult> {
        await this.core.loadSettings();
        const skipCache = options?.skipCache === true;
        const alwaysDesc = options?.alwaysCategorizeDescriptions;
        const alwaysSet =
            alwaysDesc == null
                ? null
                : alwaysDesc instanceof Set
                  ? alwaysDesc
                  : new Set(alwaysDesc);

        if (!this.core.genAI) {
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

        serverLogger.info(`Categorizing ${transactions.length} transactions using ${this.core.settings.categorizationModel}`);

        // Skip descriptions the user locked in the UI; unless skipCache: only uncached descriptions (+ optional always list)
        const uncategorized = skipCache
            ? transactions.filter((t) => !this.core.dbService.descriptionHasUserSetCategory(t.description))
            : transactions.filter((t) => {
                  if (this.core.dbService.descriptionHasUserSetCategory(t.description)) return false;
                  if (!this.core.dbService.getCategory(t.description)) return true;
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
        const catExtra = this.core.settings.categorizationPromptExtra?.trim();
        const prompt = `
            Analyze the Objective: You are a professional financial assistant specializing in Israeli banking. 
            Your core task is to categorize the following transaction descriptions into the most appropriate category.

            ${skipCache ? 'Re-evaluate every description below from scratch; do not rely on any prior categorization.\n\n' : ''}
            TRANSACTION DESCRIPTIONS (JSON array; index 0 is the first element, then 1, 2, ...):
            ${descriptionsJson}

            Constraints & Output Format:
            AVAILABLE CATEGORIES:
            ${this.core.settings.categories.join(', ')}

            DEFAULT CATEGORY:
            Use "${this.core.settings.defaultCategory}" if you are unsure or if the description doesn't fit any other category.

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

        const primary = this.core.settings.categorizationModel;
        const categorizationSystemPrompt =
            `Categorize Israeli bank transactions. Output JSON object with string keys "0","1",... mapping to category. Categories: ${this.core.settings.categories.join(', ')}` +
            (this.core.settings.categorizationSystemInstructionExtra?.trim()
                ? `\n\n${this.core.settings.categorizationSystemInstructionExtra.trim()}`
                : '');

        const runCategorizeWithModel = async (modelName: string) => {
            serverLogger.info(`Sending request to Gemini model: ${modelName}`, {
                categoryCount: this.core.settings.categories.length,
                descriptionCount: descriptions.length
            });
            const genStart = Date.now();
            const m = this.core.genAI!.getGenerativeModel({
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
                const parsed = this.core.extractJson(text);
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
                const fb = this.core.effectiveFallbackModel(primary);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                    const latencyMs = Date.now() - startTime;
                    const errId = await logAIError(primary, 'gemini', `Categorize ${descriptions.length} descriptions`, e1, {
                        latencyMs,
                        systemPrompt: categorizationSystemPrompt,
                        rawRequest: prompt,
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
                    systemPrompt: categorizationSystemPrompt,
                    rawRequest: prompt,
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
                        systemPrompt: categorizationSystemPrompt,
                        rawRequest: prompt,
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

            const successId = await logAICall({
                model: modelName,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: categorizationSystemPrompt,
                    userInput: `Categorize ${descriptions.length} descriptions`,
                    rawRequest: prompt,
                    inputLength: prompt.length,
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
                if (this.core.dbService.descriptionHasUserSetCategory(desc)) continue;
                if (skipCache && c === this.core.settings.defaultCategory) continue;
                this.core.dbService.setCategory(desc, c);
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
                systemPrompt: categorizationSystemPrompt,
                rawRequest: prompt,
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


    private categorizationGenerationConfig(): Record<string, unknown> {
        const cfg: Record<string, unknown> = {
            temperature: this.core.settings.categorizationTemperature ?? 0.7,
            responseMimeType: 'application/json',
        };
        if (this.core.settings.categorizationTopP !== undefined) cfg.topP = this.core.settings.categorizationTopP;
        if (this.core.settings.categorizationTopK !== undefined) cfg.topK = this.core.settings.categorizationTopK;
        if (this.core.settings.categorizationMaxOutputTokens !== undefined) cfg.maxOutputTokens = this.core.settings.categorizationMaxOutputTokens;
        return cfg;
    }


    private mapTransactionsWithCategoryCache(transactions: Transaction[]): Transaction[] {
        return transactions.map((t) => ({
            ...t,
            category: this.core.dbService.getCategory(t.description) || t.category || this.core.settings.defaultCategory,
        }));
    }


    async updateCategoryInCache(description: string, category: string): Promise<void> {
        // await this.loadCache();
        // this.cache[description] = category;
        // await this.saveCache();
        this.core.dbService.setCategory(description, category);
        serverLogger.info(`Category updated in cache for description: "${description}" -> "${category}"`);
    }

    /**
     * Turns `{"0":"Cat",...}` from categorizeTransactions into description -> category for DB/cache updates.
     */

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
}
