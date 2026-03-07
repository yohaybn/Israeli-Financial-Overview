import { GoogleGenerativeAI } from '@google/generative-ai';
import { Transaction, Account } from '@app/shared';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { generateTransactionId } from '../utils/idGenerator.js';
import { serverLogger } from '../utils/logger.js';
import { maskSensitiveData } from '../utils/masking.js';
import { logAICall, logAIError, withAILogging } from '../utils/aiLogger.js';
import { DbService } from './dbService.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
// const CACHE_FILE = path.join(DATA_DIR, 'config', 'ai_categories_cache.json'); // Legacy
const SETTINGS_FILE = path.join(DATA_DIR, 'config', 'ai_settings.json');

export interface AiSettings {
    categorizationModel: string;
    chatModel: string;
    categories: string[];
    defaultCategory: string;
}

const DEFAULT_SETTINGS: AiSettings = {
    categorizationModel: 'gemini-flash-latest',
    chatModel: 'gemini-flash-latest',
    categories: ['מזון', 'תחבורה', 'קניות', 'מנויים', 'בריאות', 'מגורים', 'בילויים', 'משכורת', 'העברות', 'חשבונות', 'ביגוד', 'חינוך', 'אחר', 'משכנתא והלוואות'],
    defaultCategory: 'אחר'
};

export class AiService {
    private genAI: GoogleGenerativeAI | null = null;
    // private cache: Record<string, string> = {}; // Legacy
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

    private async initialize() {
        // await this.loadCache(); // Legacy
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
            this.settings = { ...DEFAULT_SETTINGS, ...await fs.readJson(SETTINGS_FILE) };
        }
    }

    async getSettings(): Promise<AiSettings> {
        await this.loadSettings();
        return this.settings;
    }

    async updateSettings(newSettings: Partial<AiSettings>): Promise<AiSettings> {
        this.settings = { ...this.settings, ...newSettings };
        const CONFIG_DIR = path.join(DATA_DIR, 'config');
        await fs.ensureDir(CONFIG_DIR);
        await fs.writeJson(SETTINGS_FILE, this.settings, { spaces: 2 });
        serverLogger.info(`Settings updated and saved to ${SETTINGS_FILE} `);
        return this.settings;
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

    async categorizeTransactions(transactions: Transaction[]): Promise<Transaction[]> {
        if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.loadSettings();
        serverLogger.info(`Categorizing ${transactions.length} transactions using ${this.settings.categorizationModel}`);

        const model = this.genAI.getGenerativeModel({ model: this.settings.categorizationModel });

        // Filter out transactions that already have a cached category
        // Use DB cache now
        const uncategorized = transactions.filter(t => !this.dbService.getCategory(t.description));
        serverLogger.info(`${transactions.length - uncategorized.length} already in cache, ${uncategorized.length} to categorize`);

        if (uncategorized.length === 0) {
            return transactions.map(t => ({
                ...t,
                category: this.dbService.getCategory(t.description) || t.category || this.settings.defaultCategory
            }));
        }

        // Prepare prompt
        const descriptions = Array.from(new Set(uncategorized.map(t => t.description)));
        const prompt = `
            You are a professional financial assistant specializing in Israeli banking. 
            Your task is to categorize the following transaction descriptions into the most appropriate category.

            AVAILABLE CATEGORIES:
            ${this.settings.categories.join(', ')}

            DEFAULT CATEGORY:
            Use "${this.settings.defaultCategory}" if you are unsure or if the description doesn't fit any other category.

            OUTPUT FORMAT:
            You MUST return the result as a VALID JSON object where:
            - The key is the EXACT transaction description.
            - The value is the selected category string.

            Example:
            {
                "AMAZON MKT PLC": "General",
                "YELLOW": "Transport"
            }

            TRANSACTION DESCRIPTIONS TO CATEGORIZE:
            ${descriptions.join('\n')}
        `;

        let startTime = Date.now();
        try {
            serverLogger.info(`Sending request to Gemini model: ${this.settings.categorizationModel}`, {
                categoryCount: this.settings.categories.length,
                descriptionCount: descriptions.length
            });

            startTime = Date.now();
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const latencyMs = Date.now() - startTime;

            serverLogger.debug(`Gemini raw response: ${text}`);

            let categoriesMap: Record<string, string> = {};
            try {
                categoriesMap = this.extractJson(text);
                serverLogger.info(`Received ${Object.keys(categoriesMap).length} categories from AI`);
            } catch (parseError: any) {
                serverLogger.error(`Failed to parse AI response as JSON: ${parseError.message}`, {
                    rawText: text.substring(0, 500) // Log part of the response for debugging
                });
                throw new Error(`AI categorization returned malformed data: ${parseError.message}`);
            }

            // Log the AI call
            const usageMetadata = response.usageMetadata;
            const descriptionsStr = descriptions.join(', ');
            await logAICall({
                model: this.settings.categorizationModel,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: `Categorize Israeli bank transactions. Categories: ${this.settings.categories.join(', ')}`,
                    userInput: descriptionsStr,  // Log full descriptions
                    inputLength: descriptions.length
                },
                responseInfo: {
                    rawOutput: `Successfully categorized ${Object.keys(categoriesMap).length} descriptions`,
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

            // Save to DB
            for (const [desc, cat] of Object.entries(categoriesMap)) {
                this.dbService.setCategory(desc, cat as string);
            }
            // Object.assign(this.cache, categoriesMap);
            // await this.saveCache();
            // serverLogger.info(`Cache saved to ${CACHE_FILE}`);

            return transactions.map(t => ({
                ...t,
                category: this.dbService.getCategory(t.description) || t.category || this.settings.defaultCategory
            }));
        } catch (error: any) {
            const latencyMs = Date.now() - (startTime || Date.now());

            // Log the error
            await logAIError(
                this.settings.categorizationModel,
                'gemini',
                `Categorize ${descriptions.length} descriptions`,
                error,
                { latencyMs }
            );

            serverLogger.error(`Categorization failed: ${error.message}`);
            throw error; // Propagate error so the route/UI know it failed
        }
    }

    async analyzeData(query: string, transactions: Transaction[]): Promise<string> {
        if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.loadSettings();
        const model = this.genAI.getGenerativeModel({
            model: this.settings.chatModel,
            systemInstruction: "You are a professional financial analyst. Provide concise, data-driven answers based on provided transaction history."
        });
        const prompt = `
           Transactions:
            ${JSON.stringify(transactions, null, 2)}
            
            Question: ${query}
        `;

        let startTime = Date.now();
        try {
            startTime = Date.now();
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const latencyMs = Date.now() - startTime;

            // Log the AI call
            const usageMetadata = response.usageMetadata;
            await logAICall({
                model: this.settings.chatModel,
                provider: 'gemini',
                requestInfo: {
                    systemPrompt: 'You are a financial analyst. Based on the following transaction descriptions, answer the user\'s question. Keep your answer concise and professional.',
                    userInput: prompt,  // Log full prompt with all context
                    inputLength: prompt.length
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

            return text;
        } catch (error: any) {
            const latencyMs = Date.now() - startTime;

            // Log the error
            await logAIError(
                this.settings.chatModel,
                'gemini',
                query,
                error,
                { latencyMs }
            );

            throw error;
        }
    }

    async parseDocument(text: string, provider: string = 'imported', accountNumber: string = 'unknown'): Promise<{ transactions: Transaction[], accounts: Account[] }> {
        if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');

        await this.loadSettings();
        const model = this.genAI.getGenerativeModel({ model: this.settings.categorizationModel });

        const prompt = `
            You are a financial data extraction expert. Extract all bank/credit card transactions from the provided text.
            The text might contain multiple files or accounts. Please extract all of them.
            
            IMPORTANT RULES FOR AMOUNTS:
            - For EXPENSES, CHARGES, or MONEY GOING OUT: Use NEGATIVE numbers (e.g., -150.50).
            - For INCOME, REFUNDS, PAYMENTS RECEIVED, or MONEY COMING IN: Use POSITIVE numbers (e.g., 2000.00).
            - Do not include currency symbols in the amount field.
            - Ensure the 'originalAmount' follows the same polarity rules.

            Output the result ONLY as a JSON object with the following structure:
            {
              "transactions": [
                {
                  "date": "YYYY-MM-DDTHH:mm:ss.SSSZ",
                  "processedDate": "YYYY-MM-DDTHH:mm:ss.SSSZ",
                  "description": "merchant or transaction name",
                  "amount": number (MUST be negative for expenses),
                  "originalAmount": number (MUST be negative for expenses),
                  "originalCurrency": "ILS",
                  "chargedAmount": number (MUST be negative for expenses),
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

            Text to parse:
            ${text.substring(0, 100000)} 
        `;

        try {
            serverLogger.info(`AI Parsing document text (${text.length} chars) using ${this.settings.categorizationModel}`);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const resText = response.text();

            const extracted = this.extractJson(resText);

            const transactions: Transaction[] = (extracted.transactions || []).map((t: any) => {
                const txnAcc = t.accountNumber || extracted.accountNumber || accountNumber;
                const baseTxn = {
                    accountNumber: txnAcc,
                    date: t.date,
                    originalAmount: t.originalAmount || t.amount,
                    description: t.description,
                };

                return {
                    id: t.identifier || generateTransactionId(baseTxn),
                    date: t.date,
                    processedDate: t.processedDate || t.date,
                    description: t.description,
                    amount: t.amount,
                    chargedAmount: t.chargedAmount || t.amount,
                    chargedCurrency: t.chargedCurrency || t.originalCurrency || 'ILS',
                    originalAmount: t.originalAmount || t.amount,
                    originalCurrency: t.originalCurrency || 'ILS',
                    status: t.status || 'completed',
                    type: t.type || 'normal',
                    memo: t.memo || '',
                    provider: t.provider || provider,
                    accountNumber: txnAcc
                };
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
     * Robustly extracts JSON from an AI response string, handling markdown and preamble.
     */
    private extractJson(text: string): any {
        try {
            // 1. Try direct parsing
            return JSON.parse(text.trim());
        } catch (e) {
            // 2. Try removing markdown blocks
            const jsonMatch = text.match(/```json\s?([\s\S]*?)\s?```/) || text.match(/```\s?([\s\S]*?)\s?```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    return JSON.parse(jsonMatch[1].trim());
                } catch (innerE) {
                    // Fall through to fuzzy extraction
                }
            }

            // 3. Fuzzy extraction (find first { and last })
            const startIdx = text.indexOf('{');
            const endIdx = text.lastIndexOf('}');

            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                const fuzzyJson = text.substring(startIdx, endIdx + 1);
                try {
                    return JSON.parse(fuzzyJson);
                } catch (fuzzyE: any) {
                    throw new Error(`JSON parsing failed: ${fuzzyE.message}`);
                }
            }

            throw new Error('No JSON object found in response');
        }
    }
}
