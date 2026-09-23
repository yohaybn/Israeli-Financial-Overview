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

export class AiCharts {
    constructor(private core: AiServiceCore) {}

    /**
     * Natural-language description → transaction-based custom chart definition.
     */
    async generateUserChart(
        userDescription: string,
        options?: { locale?: 'en' | 'he'; hints?: Partial<UserChartDefinition> }
    ): Promise<{ chart: UserChartDefinition; usedFallbackModel?: string }> {
        if (!this.core.genAI) {
            throw new Error('GEMINI_API_KEY not configured');
        }
        await this.core.loadSettings();
        const trimmed = userDescription.trim();
        if (!trimmed) {
            throw new Error('Description required');
        }
        const locale = options?.locale === 'he' ? 'he' : 'en';
        const hints = options?.hints;
        const hintsBlock = hints
            ? `\nUser preferences (apply when compatible with the request):\n${JSON.stringify(hints, null, 2)}\n`
            : '';
        const langHint =
            locale === 'he'
                ? 'Write title in Hebrew.'
                : 'Write title in English.';

        const jsonSpec = `Design a dashboard chart from in-memory transaction data (not SQL).

${langHint}
${hintsBlock}
User request:
${trimmed}

---
OUTPUT: one JSON object only (no markdown fences):
{
  "title": "short chart title",
  "chartKind": "bar" | "line" | "pie",
  "groupBy": "month" | "category" | "weekday" | "merchant",
  "measure": "sum_expense" | "sum_income" | "net" | "count",
  "dataScope": "follow_analytics" | "all_time" | "single_month" | "last_n_days" | "last_n_months" | "custom_range",
  "singleMonth": "YYYY-MM (when dataScope is single_month)",
  "lastN": number (when last_n_days or last_n_months),
  "customDateFrom": "YYYY-MM-DD",
  "customDateTo": "YYYY-MM-DD",
  "merchantTopN": number (1-25 when groupBy is merchant, default 10),
  "seriesLabel": "optional legend / tooltip name for the value (e.g. Total expenses)",
  "filters": [
    {"kind":"category_in","categories":["Food"]},
    {"kind":"description_contains","text":"uber"},
    {"kind":"amount_min","value":100}
  ]
}

Rules:
- pie is not allowed when measure is net (use bar instead).
- filters: optional array; each item needs kind and fields for that kind (no id field).
- Prefer follow_analytics unless the user asks for a specific period.`;

        const systemInstruction =
            'You configure financial dashboard charts from transaction lists. Return JSON exactly as specified.';

        const primaryChat = this.core.settings.chatModel;
        const startTime = Date.now();

        const runGen = async (chatModelName: string) => {
            const m = this.core.genAI!.getGenerativeModel({ model: chatModelName, systemInstruction });
            const genResult = await runWithAILoadTracking(() =>
                m.generateContent({
                    contents: [{ role: 'user', parts: [{ text: jsonSpec }] }],
                    generationConfig: {
                        temperature: 0.25,
                        maxOutputTokens: 4096,
                        responseMimeType: 'application/json',
                    },
                } as Parameters<typeof m.generateContent>[0])
            );
            const response = await genResult.response;
            return { text: response.text(), response, chatModelName };
        };

        let usedFallbackModel: string | undefined;
        let outcome: Awaited<ReturnType<typeof runGen>>;
        try {
            outcome = await runGen(primaryChat);
        } catch (e1: unknown) {
            const fb = this.core.effectiveFallbackModel(primaryChat);
            if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                attachGeminiRateLimitToError(e1);
                throw e1;
            }
            outcome = await runGen(fb);
            usedFallbackModel = fb;
        }

        const { text, response, chatModelName } = outcome;
        let parsed: Record<string, unknown>;
        try {
            parsed = this.core.extractJson(text) as Record<string, unknown>;
        } catch {
            parsed = JSON.parse(text.trim()) as Record<string, unknown>;
        }

        const chart = this.normalizeUserChartFromAi(parsed, uuidv4());
        const usageMetadata = response.usageMetadata;
        await logAICall({
            model: chatModelName,
            provider: 'gemini',
            requestInfo: {
                systemPrompt: systemInstruction,
                userInput: this.core.aiLogTableSummary(trimmed),
                rawRequest: jsonSpec,
                inputLength: jsonSpec.length,
            },
            responseInfo: {
                rawOutput: JSON.stringify(chart),
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

        return { chart, ...(usedFallbackModel ? { usedFallbackModel } : {}) };
    }


    private normalizeUserChartFromAi(raw: Record<string, unknown>, id: string): UserChartDefinition {
        const title = typeof raw.title === 'string' ? raw.title.trim() : 'Chart';
        const chartKinds: UserChartKind[] = ['bar', 'line', 'pie'];
        const groupBys: UserChartGroupBy[] = ['month', 'category', 'weekday', 'merchant'];
        const measures: UserChartMeasure[] = ['sum_expense', 'sum_income', 'net', 'count'];
        const scopes: UserChartDataScope[] = [
            'follow_analytics',
            'all_time',
            'single_month',
            'last_n_days',
            'last_n_months',
            'custom_range',
        ];
        let chartKind = chartKinds.includes(raw.chartKind as UserChartKind) ? (raw.chartKind as UserChartKind) : 'bar';
        const measure = measures.includes(raw.measure as UserChartMeasure) ? (raw.measure as UserChartMeasure) : 'sum_expense';
        if (measure === 'net' && chartKind === 'pie') chartKind = 'bar';
        const groupBy = groupBys.includes(raw.groupBy as UserChartGroupBy) ? (raw.groupBy as UserChartGroupBy) : 'category';
        const dataScope = scopes.includes(raw.dataScope as UserChartDataScope)
            ? (raw.dataScope as UserChartDataScope)
            : 'follow_analytics';

        const base: UserChartDefinition = {
            id,
            title: title.slice(0, 120) || 'Chart',
            chartKind,
            groupBy,
            measure,
            merchantTopN:
                groupBy === 'merchant'
                    ? Math.min(25, Math.max(1, Math.floor(Number(raw.merchantTopN)) || 10))
                    : undefined,
        };

        const filtersRaw = Array.isArray(raw.filters) ? raw.filters : [];
        const filters: UserChartDefinition['filters'] = [];
        for (const item of filtersRaw) {
            if (!item || typeof item !== 'object') continue;
            const o = item as Record<string, unknown>;
            const kind = o.kind;
            const fid = uuidv4();
            if (kind === 'category_in' || kind === 'category_not_in') {
                const categories = Array.isArray(o.categories)
                    ? o.categories.filter((c): c is string => typeof c === 'string').map((c) => c.trim()).filter(Boolean)
                    : [];
                if (categories.length) filters.push({ id: fid, kind, categories });
            } else if (kind === 'description_contains' || kind === 'description_not_contains') {
                const text = typeof o.text === 'string' ? o.text.trim() : '';
                if (text) filters.push({ id: fid, kind, text });
            } else if (kind === 'amount_min' || kind === 'amount_max') {
                const value = Number(o.value);
                if (Number.isFinite(value) && value >= 0) filters.push({ id: fid, kind, value });
            }
        }
        if (filters.length) base.filters = filters;

        const seriesLabel = typeof raw.seriesLabel === 'string' ? raw.seriesLabel.trim().slice(0, 80) : '';
        if (seriesLabel) base.seriesLabel = seriesLabel;

        switch (dataScope) {
            case 'all_time':
                return { ...base, dataScope };
            case 'single_month': {
                const ym = typeof raw.singleMonth === 'string' ? raw.singleMonth.trim() : '';
                if (/^\d{4}-\d{2}$/.test(ym)) return { ...base, dataScope, singleMonth: ym };
                return base;
            }
            case 'last_n_days': {
                const n = Math.min(3660, Math.max(1, Math.floor(Number(raw.lastN)) || 30));
                return { ...base, dataScope, lastN: n };
            }
            case 'last_n_months': {
                const n = Math.min(120, Math.max(1, Math.floor(Number(raw.lastN)) || 3));
                return { ...base, dataScope, lastN: n };
            }
            case 'custom_range': {
                const from = typeof raw.customDateFrom === 'string' ? raw.customDateFrom : '';
                const to = typeof raw.customDateTo === 'string' ? raw.customDateTo : '';
                if (from && to && from <= to) return { ...base, dataScope, customDateFrom: from, customDateTo: to };
                return base;
            }
            default:
                return dataScope === 'follow_analytics' ? base : { ...base, dataScope };
        }
    }

    /**
     * Natural-language description → SQL analytic card definition (read-only queries + chart mapping).
     */

    /**
     * Natural-language description → SQL analytic card definition (read-only queries + chart mapping).
     */
    async generateSqlAnalyticCard(
        userDescription: string,
        options?: { locale?: 'en' | 'he' }
    ): Promise<{ card: SqlAnalyticCardDefinition; usedFallbackModel?: string }> {
        if (!this.core.genAI) {
            throw new Error('GEMINI_API_KEY not configured');
        }
        await this.core.loadSettings();
        const trimmed = userDescription.trim();
        if (!trimmed) {
            throw new Error('Description required');
        }
        const locale = options?.locale === 'he' ? 'he' : 'en';
        const schemaDoc = buildAnalystSqlSchemaDoc(this.core.settings.categoryMeta);
        const langHint =
            locale === 'he'
                ? 'Write title and description in Hebrew. Use ILS formatting in descriptions.'
                : 'Write title and description in English.';

        const jsonSpec = `You design a single dashboard chart card backed by read-only SQLite queries on local transaction data.

${langHint}

User request:
${trimmed}

---
OUTPUT: one JSON object only (no markdown fences). Schema:
{
  "title": "short chart title",
  "description": "one sentence explaining the chart (optional)",
  "chartKind": "bar" | "line" | "pie",
  "dataQueryKey": "main",
  "labelColumn": "column_alias_for_labels",
  "valueColumns": ["numeric_column_alias"],
  "valueLabels": ["optional display name for legend, same order as valueColumns"],
  "queries": [{"key":"main","sql":"SELECT ..."}]
}

Rules:
- "queries": 1–4 SELECT (or WITH ... SELECT) statements. Keys: snake_case, unique. Each sql obeys schema rules below.
- "dataQueryKey" must match the query that returns chart rows (usually one row per category/month).
- "labelColumn" and "valueColumns" must be column aliases present in that query's result.
- Prefer aggregated results (GROUP BY) with ≤ 24 rows for bar/line; ≤ 12 slices for pie.
- For spending: (isIgnored = 0 OR isIgnored IS NULL) AND (isInternalTransfer = 0 OR isInternalTransfer IS NULL) unless the user asks otherwise.
- pie: use exactly one valueColumns entry with non-negative values when possible.
- bar/line: time series → line; categories comparison → bar.

SQL SCHEMA:
${schemaDoc}

DATA_SCOPE_ACTIVE: false — all transactions in the database are in scope.`;

        const systemInstruction =
            'You are a financial data visualization designer. You write SQLite SELECT queries for a local engine. ' +
            'You never see raw rows—only the schema. Return JSON exactly as specified.';

        const primaryChat = this.core.settings.chatModel;
        const startTime = Date.now();

        const runGen = async (chatModelName: string) => {
            const m = this.core.genAI!.getGenerativeModel({ model: chatModelName, systemInstruction });
            const genResult = await runWithAILoadTracking(() =>
                m.generateContent({
                    contents: [{ role: 'user', parts: [{ text: jsonSpec }] }],
                    generationConfig: {
                        temperature: 0.25,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json',
                    },
                } as Parameters<typeof m.generateContent>[0])
            );
            const response = await genResult.response;
            return { text: response.text(), response, chatModelName };
        };

        let usedFallbackModel: string | undefined;
        let outcome: Awaited<ReturnType<typeof runGen>>;
        try {
            outcome = await runGen(primaryChat);
        } catch (e1: unknown) {
            const fb = this.core.effectiveFallbackModel(primaryChat);
            if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                attachGeminiRateLimitToError(e1);
                throw e1;
            }
            outcome = await runGen(fb);
            usedFallbackModel = fb;
        }

        const { text, response, chatModelName } = outcome;
        let parsed: unknown;
        try {
            parsed = this.core.extractJson(text);
        } catch {
            try {
                parsed = JSON.parse(text.trim());
            } catch {
                throw new Error('AI did not return valid JSON for the analytic card');
            }
        }

        const withId = {
            ...(typeof parsed === 'object' && parsed !== null ? parsed : {}),
            id: uuidv4(),
            createdAt: new Date().toISOString(),
        };
        const sanitized = sanitizeSqlAnalyticCard(withId);
        if (!sanitized.ok) {
            throw new Error(sanitized.error);
        }

        const db = this.core.dbService.getDatabase();
        const results = executeAnalystQueries(
            db,
            sanitized.value.queries.map((q) => ({ key: q.key, sql: q.sql }))
        );
        const dataResult = results[sanitized.value.dataQueryKey];
        if (!dataResult || dataResult.error) {
            throw new Error(
                dataResult?.error ||
                    `Chart query "${sanitized.value.dataQueryKey}" failed — try rephrasing your request`
            );
        }

        const usageMetadata = response.usageMetadata;
        await logAICall({
            model: chatModelName,
            provider: 'gemini',
            requestInfo: {
                systemPrompt: systemInstruction,
                userInput: this.core.aiLogTableSummary(trimmed),
                rawRequest: jsonSpec,
                inputLength: jsonSpec.length,
            },
            responseInfo: {
                rawOutput: JSON.stringify(sanitized.value),
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

        return {
            card: sanitized.value,
            ...(usedFallbackModel ? { usedFallbackModel } : {}),
        };
    }
}
