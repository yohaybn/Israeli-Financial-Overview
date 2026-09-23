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

export class AiPersona {
    constructor(private core: AiServiceCore) {}

    /**
     * Turn free-text household / finance notes into structured persona fields + short fact bullets (onboarding / AI settings).
     */
    async extractPersonaFromNarrative(narrative: string): Promise<PersonaExtractFromNarrativeResult> {
        await this.core.loadSettings();
        if (!this.core.genAI) {
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
- "facts": 3–8 short stable-context bullets in the user's language (household, income structure, goals, preferences)—not month-specific or time-bound observations (no JSON inside bullets).
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

        const primaryChat = this.core.settings.chatModel;

        const startTime = Date.now();
        const runPersonaGen = async (chatModelName: string) => {
                const m = this.core.genAI!.getGenerativeModel({
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
            const fb = this.core.effectiveFallbackModel(primaryChat);
            if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                const err = e1 instanceof Error ? e1 : new Error(String(e1));
                await logAIError(primaryChat, 'gemini', '[persona extract]', err, {
                    latencyMs: Date.now() - startTime,
                    systemPrompt: systemInstruction,
                    rawRequest: userPrompt,
                });
                attachGeminiRateLimitToError(err);
                throw err;
            }
            await logAIError(primaryChat, 'gemini', '[persona extract]', e1 instanceof Error ? e1 : new Error(String(e1)), {
                latencyMs: Date.now() - startTime,
                systemPrompt: systemInstruction,
                rawRequest: userPrompt,
            });
            serverLogger.warn(`extractPersonaFromNarrative: retrying with fallback model ${fb}`);
            try {
                outcome = await runPersonaGen(fb);
            } catch (e2: any) {
                const err = e2 instanceof Error ? e2 : new Error(String(e2));
                await logAIError(fb, 'gemini', '[persona extract]', err, {
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
        const normalized = normalizePersonaExtractFromAi(parsed);
        const usageMetadata = response.usageMetadata;
        await logAICall({
            model: chatModelName,
            provider: 'gemini',
            requestInfo: {
                systemPrompt: systemInstruction,
                userInput: '[persona extract]',
                rawRequest: userPrompt,
                inputLength: userPrompt.length,
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
}
