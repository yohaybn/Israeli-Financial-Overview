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
import { canonicalAmountFromExtracted } from './types.js';

export class AiDocuments {
    constructor(private core: AiServiceCore) {}


    async parseDocument(text: string, provider: string = 'imported', accountNumber: string = 'unknown'): Promise<{ transactions: Transaction[], accounts: Account[] }> {
        if (!this.core.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.core.loadSettings();
        const primaryCat = this.core.settings.categorizationModel;

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
                const m = this.core.genAI!.getGenerativeModel({ model: modelName });
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
                const fb = this.core.effectiveFallbackModel(primaryCat);
                if (!fb || !isGeminiRateLimitOrOverloadError(e1)) {
                    attachGeminiRateLimitToError(e1);
                    throw e1;
                }
                serverLogger.warn(`parseDocument: retrying with fallback model ${fb} after ${primaryCat} was rate limited or overloaded`);
                resText = await runParseWithModel(fb);
            }

            const extracted = this.core.extractJson(resText);

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
}
