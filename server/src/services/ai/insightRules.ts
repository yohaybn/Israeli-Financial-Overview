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
import { AI_CATEGORIZATION_NO_API_KEY } from './types.js';

export class AiInsightRules {
    constructor(private core: AiServiceCore) {}

    /**
     * Turn a natural-language description into a v1 insight rule definition (Gemini JSON).
     */
    async suggestInsightRuleDraft(userDescription: string): Promise<{ name: string; definition: InsightRuleDefinitionV1 }> {
        if (!this.core.genAI) {
            throw new Error(AI_CATEGORIZATION_NO_API_KEY);
        }
        await this.core.loadSettings();
        const trimmed = userDescription.trim();
        if (!trimmed) {
            throw new Error('Description required');
        }
        const placeholdersBlock = formatInsightRulePlaceholdersForPrompt();
        const categoriesBlock = formatCategoryLabelsForPrompt(this.core.settings.categories);
        const defaultCategory = this.core.settings.defaultCategory.trim() || 'אחר';

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

        const primaryChat = this.core.settings.chatModel;

        const startTime = Date.now();
        const runDraftGen = async (chatModelName: string) => {
            const m = this.core.genAI!.getGenerativeModel({
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
            const fb = this.core.effectiveFallbackModel(primaryChat);
            if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                const err = e1 instanceof Error ? e1 : new Error(String(e1));
                await logAIError(primaryChat, 'gemini', this.core.aiLogTableSummary(trimmed), err, {
                    latencyMs: Date.now() - startTime,
                    systemPrompt: systemInstruction,
                    rawRequest: userPrompt,
                });
                attachGeminiRateLimitToError(err);
                throw err;
            }
            await logAIError(primaryChat, 'gemini', this.core.aiLogTableSummary(trimmed), e1 instanceof Error ? e1 : new Error(String(e1)), {
                latencyMs: Date.now() - startTime,
                systemPrompt: systemInstruction,
                rawRequest: userPrompt,
            });
            serverLogger.warn(`suggestInsightRuleDraft: retrying with fallback model ${fb}`);
            try {
                outcome = await runDraftGen(fb);
            } catch (e2: any) {
                const err = e2 instanceof Error ? e2 : new Error(String(e2));
                await logAIError(fb, 'gemini', this.core.aiLogTableSummary(trimmed), err, {
                    latencyMs: Date.now() - startTime,
                    systemPrompt: systemInstruction,
                    rawRequest: userPrompt,
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
                userInput: this.core.aiLogTableSummary(trimmed),
                rawRequest: userPrompt,
                inputLength: userPrompt.length,
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

    /**
     * Natural-language description → transaction-based custom chart definition.
     */
}
