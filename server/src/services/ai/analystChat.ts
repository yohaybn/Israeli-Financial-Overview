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
import { ANALYZE_TXN_CSV_COLUMN_HINT, AI_TXN_INLINE_MAX_ROWS, StructuredChatResult, AnalyzeDataOptions, AnalyzeDataResult, normalizeFactReplacements, normalizeScoredItems, SuperPrivacyChatOptions, SuperPrivacyChatResult } from './types.js';

export class AiAnalystChat {
    constructor(private core: AiServiceCore) {}


    async analyzeData(query: string, transactions: Transaction[], options?: AnalyzeDataOptions): Promise<AnalyzeDataResult> {
        if (!this.core.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.core.loadSettings();
        const effectiveQuery = this.appendAnalyticsPromptExtra(query);
        const systemInstruction = this.buildAnalyzeDataPlainSystemInstruction();
        const primaryChat = this.core.settings.chatModel;

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
                const combinedCsv = this.core.formatSplitTransactionsForAI(oldTx, newTx);
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
                    newTx.length > 0 && !newAsFile ? this.core.formatTransactionsForAI(newTx) : '';

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
                    const oldCsv = this.core.formatTransactionsForAI(oldTx);
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
                    const newCsv = this.core.formatTransactionsForAI(newTx);
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
                const csv = this.core.formatTransactionsForAI(transactions);
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
            ${this.core.formatTransactionsForAI(transactions)}
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

        const generationConfig = this.core.analyticsGenerationConfigPlain(options);

        let startTime = Date.now();
        try {
            const aiLogIds: string[] = [];
            const runGeneration = async (chatModelName: string) => {
                const m = this.core.genAI!.getGenerativeModel({
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
                const fb = this.core.effectiveFallbackModel(primaryChat);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                    const latencyMs = Date.now() - startTime;
                    const errId = await logAIError(primaryChat, 'gemini', this.core.aiLogTableSummary(effectiveQuery), e1, {
                        latencyMs,
                        systemPrompt: systemInstruction,
                        rawRequest: serializeGeminiContentsForLog(contents),
                    });
                    if (errId) aiLogIds.push(errId);
                    attachGeminiRateLimitToError(e1);
                    throw e1;
                }
                const latencyMsPrimary = Date.now() - startTime;
                const primaryErrId = await logAIError(primaryChat, 'gemini', this.core.aiLogTableSummary(effectiveQuery), e1, {
                    latencyMs: latencyMsPrimary,
                    systemPrompt: systemInstruction,
                    rawRequest: serializeGeminiContentsForLog(contents),
                });
                if (primaryErrId) aiLogIds.push(primaryErrId);
                serverLogger.warn(`analyzeData: retrying with fallback model ${fb} after ${primaryChat} was rate limited or overloaded`);
                startTime = Date.now();
                try {
                    outcome = await runGeneration(fb);
                    usedFallbackModel = fb;
                } catch (e2: any) {
                    const latencyMs = Date.now() - startTime;
                    const fbErrId = await logAIError(fb, 'gemini', this.core.aiLogTableSummary(effectiveQuery), e2, {
                        latencyMs,
                        systemPrompt: systemInstruction,
                        rawRequest: serializeGeminiContentsForLog(contents),
                    });
                    if (fbErrId) aiLogIds.push(fbErrId);
                    attachGeminiRateLimitToError(e2);
                    throw e2;
                }
            }

            const { text, response, latencyMs, chatModelName } = outcome;

            const logRawRequest = serializeGeminiContentsForLog(contents);

            const usageMetadata = response.usageMetadata;
            const successId = await logAICall({
                model: chatModelName,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: systemInstruction,
                    userInput: this.core.aiLogTableSummary(effectiveQuery),
                    rawRequest: logRawRequest,
                    inputLength: logRawRequest.length,
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


    async analyzeDataStructured(query: string, transactions: Transaction[], options?: AnalyzeDataOptions): Promise<StructuredChatResult> {
        if (options?.transactionSplit) {
            throw new Error('Structured chat does not support transactionSplit; use analyzeData instead.');
        }
        if (!this.core.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.core.loadSettings();
        const effectiveQuery = this.appendAnalyticsPromptExtra(query);
        const personaHint =
            this.core.settings.personaInjectionEnabled !== false &&
            this.core.settings.userContext &&
            !isUserPersonaEmpty(this.core.settings.userContext)
                ? ' Adapt tone, depth, and priorities to the User persona alignment JSON in the user message when present; if it conflicts with stored facts, prefer stored facts.'
                : '';
        const systemInstructionBase =
            'You are a professional financial analyst. Reply with a single JSON object exactly as specified in the user message. ' +
            'Do not wrap JSON in markdown fences. Do not repeat prior insights verbatim. Facts are stable life/finance context (not time-bound snapshots); insights are data-driven observations; use factsReplace only when stored facts are clearly outdated.' +
            personaHint;
        const sysExtra = this.core.settings.analyticsSystemInstructionExtra?.trim();
        const systemInstruction = sysExtra ? `${systemInstructionBase}\n\n${sysExtra}` : systemInstructionBase;

        const primaryChat = this.core.settings.chatModel;

        const jsonSpec = `

---
OUTPUT FORMAT
Respond with one JSON object only (no markdown code fences, no text before or after). Schema:
{"response": string, "facts": string[], "factsReplace": {"oldText": string, "newText": string}[], "insights": {"text": string, "score": number}[], "alerts": {"text": string, "score": number}[]}

- "response": Your main answer to the user (you may use markdown inside this string).
- "facts": NEW stable context only—parameters that sharpen future analysis across months, not observations about the current period. Good examples: household composition; employment/income structure (salaried vs freelance, typical pay days if standing); long-term goals; standing category preferences; recurring obligations the user asked you to remember (rent, subscriptions, loans). Bad examples (put these in "insights" or "response" instead): month-specific cash-flow commentary; "already paid/settled this month"; one-off spikes; anything that will be stale next week. Do not duplicate lines under "Stored facts". Do not store raw balances unless the user explicitly asked to remember them. Use [] if nothing new.
- "factsReplace": Update an outdated STORED fact when the user clearly reports a lasting change (new job, salary/pay schedule change, moved, new dependent) OR transaction data reliably contradicts a stored line—and you are confident. Each item: {"oldText": "<copy one Stored facts line verbatim>", "newText": "<replacement stable fact>"}. Max 1–2 items per reply; use [] if unsure. Never replace based on temporary cash-flow, a single month, or an insight. Do not add the same information in both "facts" and "factsReplace".
- "insights": Analytical observations (trends, comparisons, patterns). Each item MUST include "score" 1–100. Score bands: 1–35 = minor; 36–65 = notable; 66–100 = high-signal. Do not duplicate items under "Recent insights" in the prompt. Use an empty array if nothing new.
- "alerts": ONLY for items that genuinely need attention soon: clear overspend vs plan, missed or imminent payment deadline, fraud-like or highly unusual activity, or another time-critical risk. Put general tips, education, and non-urgent observations in "response" or "insights" instead—NOT here. Prefer at most 1–2 alerts per reply; use [] when there is nothing truly alert-worthy. Each item MUST include "score" 1–100. Alert score bands: 1–50 = watchlist (rarely needed); 51–74 = address soon; 75–84 = important; 85–100 = urgent/critical only—do not inflate scores. Do not duplicate "Recent alerts" below.

Facts are user-editable persistent memory (stable context). Insights and alerts are stored with scores for prioritization.`;

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
            const csv = this.core.formatTransactionsForAI(transactions);
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
            ${this.core.categoryMetaContextForPrompt()}
            The attached CSV file contains all ${transactions.length} transactions (${transactions.length} rows). Use it for the question below.
            ${ANALYZE_TXN_CSV_COLUMN_HINT}

            Question and instructions:
            ${fullQuery}
        `;
                userParts = [{ fileData: { mimeType: up.mimeType, fileUri: up.uri } }, { text: currentPrompt }];
            } else {
                currentPrompt = `
            Analyze the Objective: You are a professional financial analyst. Your core task is to provide concise, data-driven answers based on provided transaction history.
            ${this.core.categoryMetaContextForPrompt()}
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
            ${this.core.categoryMetaContextForPrompt()}
            ${ANALYZE_TXN_CSV_COLUMN_HINT}
            Question and instructions:
            ${fullQuery}

            ---
            CSV:
            ${this.core.formatTransactionsForAI(transactions)}
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

        const generationConfig = this.core.analyticsGenerationConfigStructured(options);

        let startTime = Date.now();
        try {
            const runGeneration = async (chatModelName: string) => {
                const m = this.core.genAI!.getGenerativeModel({
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
                const fb = this.core.effectiveFallbackModel(primaryChat);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                    const latencyMs = Date.now() - startTime;
                    await logAIError(primaryChat, 'gemini', this.core.aiLogTableSummary(effectiveQuery), e1, {
                        latencyMs,
                        systemPrompt: systemInstruction,
                        rawRequest: serializeGeminiContentsForLog(contents),
                    });
                    attachGeminiRateLimitToError(e1);
                    throw e1;
                }
                const latencyMsPrimary = Date.now() - startTime;
                await logAIError(primaryChat, 'gemini', this.core.aiLogTableSummary(effectiveQuery), e1, {
                    latencyMs: latencyMsPrimary,
                    systemPrompt: systemInstruction,
                    rawRequest: serializeGeminiContentsForLog(contents),
                });
                serverLogger.warn(`analyzeDataStructured: retrying with fallback model ${fb} after ${primaryChat} was rate limited or overloaded`);
                startTime = Date.now();
                try {
                    outcome = await runGeneration(fb);
                    usedFallbackModel = fb;
                } catch (e2: any) {
                    const latencyMs = Date.now() - startTime;
                    await logAIError(fb, 'gemini', this.core.aiLogTableSummary(effectiveQuery), e2, {
                        latencyMs,
                        systemPrompt: systemInstruction,
                        rawRequest: serializeGeminiContentsForLog(contents),
                    });
                    attachGeminiRateLimitToError(e2);
                    throw e2;
                }
            }

            const { text, response, latencyMs, chatModelName } = outcome;

            const logRawRequest = serializeGeminiContentsForLog(contents);

            const usageMetadata = response.usageMetadata;
            await logAICall({
                model: chatModelName,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: systemInstruction,
                    userInput: this.core.aiLogTableSummary(effectiveQuery),
                    rawRequest: logRawRequest,
                    inputLength: logRawRequest.length,
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
                parsed = this.core.extractJson(text);
            } catch {
                return {
                    response: text,
                    facts: [],
                    factsReplace: [],
                    insights: [],
                    alerts: [],
                    ...(usedFallbackModel ? { usedFallbackModel } : {})
                };
            }
            const resText = typeof parsed.response === 'string' ? parsed.response : '';
            const facts = Array.isArray(parsed.facts) ? parsed.facts.filter((x: unknown) => typeof x === 'string' && x.trim()) : [];
            const factsReplace = normalizeFactReplacements(parsed.factsReplace);
            const insights = normalizeScoredItems(parsed.insights, 50);
            const alerts = normalizeScoredItems(parsed.alerts, 70);
            return {
                response: resText || text,
                facts,
                factsReplace,
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

    /**
     * Super privacy analyst: schema + question go to the model; SQL runs locally; response is built from template + aggregates.
     */

    /**
     * Super privacy analyst: schema + question go to the model; SQL runs locally; response is built from template + aggregates.
     */
    async analyzeDataSuperPrivacy(
        query: string,
        options?: SuperPrivacyChatOptions
    ): Promise<SuperPrivacyChatResult> {
        if (!this.core.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.core.loadSettings();
        const effectiveQuery = this.appendAnalyticsPromptExtra(query);
        const schemaDoc = buildAnalystSqlSchemaDoc(this.core.settings.categoryMeta);
        const scopeActive = Boolean(options?.scopeTransactionIds?.length);
        const scopeBlock = scopeActive
            ? `\nDATA_SCOPE_ACTIVE: true — ${options?.scopeTransactionIds!.length} transaction id(s) in temp table _analyst_scope_ids. Every query on \`transactions\` MUST include: AND id IN (SELECT id FROM _analyst_scope_ids)\n`
            : '\nDATA_SCOPE_ACTIVE: false — all transactions in the database are in scope.\n';
        const scopeNote = options?.scopeNote?.trim()
            ? `\nAdditional scope context: ${options.scopeNote}\n`
            : '';

        const jsonSpec = `

---
OUTPUT FORMAT (super privacy — no transaction rows in this request)
Respond with one JSON object only (no markdown fences). Schema:
{"sqlNotPossible":boolean,"sqlNotPossibleReason":string,"requiresFullAnalyst":boolean,"requiresFullAnalystReason":string,"queries":[{"key":"snake_case_id","sql":"SELECT ..."}],"responseTemplate":"markdown text with {{q:key}} placeholders","facts":string[],"factsReplace":{"oldText":string,"newText":string}[],"insights":{"text":string,"score":number}[],"alerts":{"text":string,"score":number}[]}

- "sqlNotPossible": true when you cannot produce a correct read-only SQL plan (question needs row-level memos/descriptions, data is outside the schema tables, fuzzy text matching, or subjective judgment on individual charges). Set "sqlNotPossibleReason" to a short user-facing explanation. Use queries: [] and a minimal responseTemplate when true.
- "requiresFullAnalyst": alias for the same idea when transaction rows are required; if true, set sqlNotPossible true as well and explain in sqlNotPossibleReason.
- "queries": 1–8 read-only SQLite SELECT (or WITH ... SELECT) statements when sqlNotPossible is false. Use stable keys (letters, numbers, underscore). Each "sql" must obey the schema rules. For {{q:key.list}} placeholders, return at most 15 rows and prefer 2 columns (label + amount) or (category + total).
- "responseTemplate": User-facing answer formatted for the in-app chat UI (see CHAT FORMAT below). Embed numeric results ONLY via placeholders; do not invent amounts.
- "facts", "factsReplace", "insights", "alerts": same rules as standard analyst JSON when those blocks appear in the user message; otherwise use empty arrays.

${ANALYST_CHAT_TEMPLATE_FORMAT_RULES}

SQL SCHEMA:
${schemaDoc}
${scopeBlock}${scopeNote}

User message (question + memory):
${effectiveQuery}`;

        const personaHint =
            this.core.settings.superPrivacySharePersona === true &&
            this.core.settings.personaInjectionEnabled !== false &&
            this.core.settings.userContext &&
            !isUserPersonaEmpty(this.core.settings.userContext)
                ? ' Adapt tone using persona JSON in the user message when present.'
                : '';
        const systemInstructionBase =
            'You are a financial analyst writing SQLite SELECT queries for a local privacy-preserving engine. ' +
            'You never see raw transaction data—only the schema. Return JSON exactly as specified. ' +
            'Do not wrap JSON in markdown fences.' +
            personaHint;
        const sysExtra = this.core.settings.analyticsSystemInstructionExtra?.trim();
        const systemInstruction = sysExtra ? `${systemInstructionBase}\n\n${sysExtra}` : systemInstructionBase;

        const primaryChat = this.core.settings.chatModel;
        const generationConfig = this.core.analyticsGenerationConfigStructured(options);
        const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
        if (options?.conversationHistory?.length) {
            for (const turn of options.conversationHistory) {
                contents.push({ role: turn.role, parts: [{ text: turn.text }] });
            }
        }
        contents.push({ role: 'user', parts: [{ text: jsonSpec }] });

        const runGeneration = async (chatModelName: string) => {
            const m = this.core.genAI!.getGenerativeModel({ model: chatModelName, systemInstruction });
            const genStart = Date.now();
            const result = await runWithAILoadTracking(() =>
                m.generateContent({ contents, generationConfig })
            );
            const response = await result.response;
            const text = response.text();
            return { text, response, latencyMs: Date.now() - genStart, chatModelName };
        };

        let usedFallbackModel: string | undefined;
        let outcome: Awaited<ReturnType<typeof runGeneration>>;
        let startTime = Date.now();
        try {
            startTime = Date.now();
            outcome = await runGeneration(primaryChat);
        } catch (e1: unknown) {
            const fb = this.core.effectiveFallbackModel(primaryChat);
            const err1 = e1 instanceof Error ? e1 : new Error(String(e1));
            if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                await logAIError(primaryChat, 'gemini', this.core.aiLogTableSummary(effectiveQuery), err1, {
                    latencyMs: Date.now() - startTime,
                    systemPrompt: systemInstruction,
                    rawRequest: jsonSpec,
                });
                attachGeminiRateLimitToError(e1);
                throw e1;
            }
            await logAIError(primaryChat, 'gemini', this.core.aiLogTableSummary(effectiveQuery), err1, {
                latencyMs: Date.now() - startTime,
                systemPrompt: systemInstruction,
                rawRequest: jsonSpec,
            });
            startTime = Date.now();
            outcome = await runGeneration(fb);
            usedFallbackModel = fb;
        }

        const { text, response, latencyMs, chatModelName } = outcome;
        const usageMetadata = response.usageMetadata;
        await logAICall({
            model: chatModelName,
            provider: 'gemini',
            requestInfo: {
                systemPrompt: systemInstruction,
                userInput: this.core.aiLogTableSummary(effectiveQuery),
                rawRequest: jsonSpec,
                inputLength: jsonSpec.length,
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

        let parsed: Record<string, unknown>;
        let jsonParseFailed = false;
        try {
            parsed = this.core.extractJson(text);
        } catch {
            jsonParseFailed = true;
            parsed = {};
            return {
                response: text,
                facts: [],
                factsReplace: [],
                insights: [],
                alerts: [],
                jsonParseFailed: true,
                parsedRaw: parsed,
                queries: [],
                ...(usedFallbackModel ? { usedFallbackModel } : {}),
            };
        }

        const sqlNotPossible = parsed.sqlNotPossible === true || parsed.requiresFullAnalyst === true;
        const sqlNotPossibleReason =
            (typeof parsed.sqlNotPossibleReason === 'string' ? parsed.sqlNotPossibleReason.trim() : '') ||
            (typeof parsed.requiresFullAnalystReason === 'string' ? parsed.requiresFullAnalystReason.trim() : '');

        if (sqlNotPossible) {
            const facts = Array.isArray(parsed.facts)
                ? parsed.facts.filter((x: unknown) => typeof x === 'string' && (x as string).trim())
                : [];
            return {
                response:
                    sqlNotPossibleReason ||
                    'This question cannot be answered with read-only SQL on the local database schema.',
                facts,
                factsReplace: normalizeFactReplacements(parsed.factsReplace),
                insights: normalizeScoredItems(parsed.insights, 50),
                alerts: normalizeScoredItems(parsed.alerts, 70),
                parsedRaw: parsed,
                queries: [],
                jsonParseFailed: false,
                ...(usedFallbackModel ? { usedFallbackModel } : {}),
            };
        }

        const rawQueries = Array.isArray(parsed.queries) ? parsed.queries : [];
        const queries: { key: string; sql: string }[] = [];
        for (const item of rawQueries) {
            if (!item || typeof item !== 'object') continue;
            const o = item as Record<string, unknown>;
            const key = typeof o.key === 'string' ? o.key.trim() : '';
            const sql = typeof o.sql === 'string' ? o.sql.trim() : '';
            if (key && sql) queries.push({ key, sql });
        }

        const template =
            typeof parsed.responseTemplate === 'string'
                ? parsed.responseTemplate
                : typeof parsed.response === 'string'
                  ? parsed.response
                  : '';

        const db = this.core.dbService.getDatabase();
        let responseText = template;
        let sqlResults: Record<string, AnalystQueryResult> | undefined;
        if (queries.length > 0) {
            try {
                sqlResults = executeAnalystQueries(db, queries, {
                    scopeTransactionIds: options?.scopeTransactionIds,
                });
                responseText = fillAnalystResponseTemplate(
                    template ||
                        '**Results**\n\n{{q:' + queries[0]!.key + '.list}}',
                    sqlResults
                );
            } catch (execErr: unknown) {
                const msg = execErr instanceof Error ? execErr.message : String(execErr);
                serverLogger.warn('Super privacy SQL execution failed', { error: msg });
                responseText = `${template}\n\n_(Could not run queries locally: ${msg})_`;
            }
        } else if (!responseText.trim()) {
            responseText = 'No SQL queries were returned for your question.';
        }

        const facts = Array.isArray(parsed.facts)
            ? parsed.facts.filter((x: unknown) => typeof x === 'string' && (x as string).trim())
            : [];
        return {
            response: responseText,
            facts,
            factsReplace: normalizeFactReplacements(parsed.factsReplace),
            insights: normalizeScoredItems(parsed.insights, 50),
            alerts: normalizeScoredItems(parsed.alerts, 70),
            parsedRaw: parsed,
            queries,
            sqlResults,
            jsonParseFailed,
            ...(usedFallbackModel ? { usedFallbackModel } : {}),
        };
    }


    private appendAnalyticsPromptExtra(query: string): string {
        const extra = this.core.settings.analyticsPromptExtra?.trim();
        if (!extra) return query;
        return `${query}\n\nAdditional instructions:\n${extra}`;
    }


    private buildAnalyzeDataPlainSystemInstruction(): string {
        const base =
            'You are a professional financial analyst. Provide concise, data-driven answers based on provided transaction history. ' +
            'Do not repeat your previous analysis verbatim; when relevant, refer to prior points briefly and emphasize what is new or changed.';
        const extra = this.core.settings.analyticsSystemInstructionExtra?.trim();
        return extra ? `${base}\n\n${extra}` : base;
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
    /** Short label for the AI logs table (full payload goes in rawRequest). */
}
