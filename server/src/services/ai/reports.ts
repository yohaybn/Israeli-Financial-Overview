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

export class AiReports {
    constructor(private core: AiServiceCore) {}

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
        if (!this.core.genAI) return null;
        await this.core.loadSettings();
        const maxRows = this.core.settings.analystMaxTransactionRows ?? 0;
        let txns = sliceTransactionsForAnalyst(params.transactions, maxRows);
        const primaryChat = this.core.settings.chatModel;
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
            `${this.core.categoryMetaContextForPrompt()}` +
            `${this.personaContextForFinancialReport()}` +
            `Aggregates and tables (trusted):\n${params.aggregatesSummary}\n\n` +
            `Transaction sample (newest first, CSV columns per app):\n${this.core.formatTransactionsForAI(txns)}\n\n` +
            'Respond with JSON exactly in this shape:\n' +
            '{"executiveSummary":{"he":"...","en":"..."},"insights":[' +
            '{"title":{"he":"...","en":"..."},"detail":{"he":"...","en":"..."},"action":{"he":"...","en":"..."},"tags":["saving_tip"]}' +
            ']}\n';

        const generationConfig = {
            ...this.core.analyticsGenerationConfigStructured({ temperature: 0.35 }),
        };

        const runGeneration = async (chatModelName: string) => {
            const m = this.core.genAI!.getGenerativeModel({ model: chatModelName, systemInstruction });
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
                const fb = this.core.effectiveFallbackModel(primaryChat);
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
                    userInput: 'financial-report-narrative',
                    rawRequest: userText,
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
                parsed = this.core.extractJson(text);
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
                rawRequest: userText,
            });
            return null;
        }
    }

    /**
     * Bilingual short narrative comparing the report month to prior / YoY periods (trusted multi-month aggregates only).
     */

    /**
     * Bilingual short narrative comparing the report month to prior / YoY periods (trusted multi-month aggregates only).
     */
    async generateFinancialMonthComparisonNarrative(params: {
        reportMonthYm: string;
        localeMode: FinancialReportLocaleMode;
        comparisonContextSummary: string;
    }): Promise<FinancialReportBilingualBlock | null> {
        if (!this.core.genAI) return null;
        await this.core.loadSettings();
        const primaryChat = this.core.settings.chatModel;
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
            `${this.core.categoryMetaContextForPrompt()}` +
            `${this.personaContextForFinancialReport()}` +
            `Multi-month aggregates (trusted):\n${params.comparisonContextSummary}\n\n` +
            'Respond with JSON exactly: {"narrative":{"he":"...","en":"..."}}\n';

        const generationConfig = {
            ...this.core.analyticsGenerationConfigStructured({ temperature: 0.35 }),
        };

        const runGeneration = async (chatModelName: string) => {
            const m = this.core.genAI!.getGenerativeModel({ model: chatModelName, systemInstruction });
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
                const fb = this.core.effectiveFallbackModel(primaryChat);
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
                    userInput: 'financial-report-month-comparison',
                    rawRequest: userText,
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
                parsed = this.core.extractJson(text);
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
                rawRequest: userText,
            });
            return null;
        }
    }


    private personaContextForFinancialReport(): string {
        if (this.core.settings.personaInjectionEnabled === false) return '';
        const ctx = this.core.settings.userContext;
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
}
