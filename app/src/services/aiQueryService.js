/**
 * AI Query Service
 * 
 * Handles natural language queries about transaction data.
 * Supports multiple AI providers: OpenAI, Gemini, Ollama
 */

import { getSettings, getAiConfig, getAiKey } from '../config.js';

/**
 * Available local analysis functions that AI can invoke
 */
const localFunctions = {
    filterByCategory: (data, category) => {
        return data.filter(t =>
            (t.category || '').toLowerCase().includes(category.toLowerCase())
        );
    },

    filterByDateRange: (data, startDate, endDate) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        return data.filter(t => {
            const date = new Date(t.date || t.processedDate);
            return date >= start && date <= end;
        });
    },

    filterByAmount: (data, minAmount, maxAmount) => {
        return data.filter(t => {
            const amount = Math.abs(t.chargedAmount || t.amount || 0);
            return amount >= (minAmount || 0) && amount <= (maxAmount || Infinity);
        });
    },

    calculateTotal: (data) => {
        return data.reduce((sum, t) => sum + Math.abs(t.chargedAmount || t.amount || 0), 0);
    },

    calculateAverage: (data) => {
        if (data.length === 0) return 0;
        const total = localFunctions.calculateTotal(data);
        return total / data.length;
    },

    findLargestExpense: (data) => {
        return data.reduce((max, t) => {
            const amount = Math.abs(t.chargedAmount || t.amount || 0);
            return amount > Math.abs(max.chargedAmount || max.amount || 0) ? t : max;
        }, data[0] || null);
    },

    countTransactions: (data) => {
        return data.length;
    },

    searchDescription: (data, keyword) => {
        return data.filter(t =>
            (t.description || t.memo || '').toLowerCase().includes(keyword.toLowerCase())
        );
    }
};

/**
 * Build a context summary from transaction data
 */
function buildDataContext(data) {
    const totalTransactions = data.length;
    const totalAmount = data.reduce((sum, t) => sum + (t.chargedAmount || t.amount || 0), 0);
    const categories = [...new Set(data.map(t => t.category).filter(Boolean))];

    // Get date range
    const dates = data.map(t => new Date(t.date || t.processedDate)).filter(d => !isNaN(d));
    const minDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;

    return {
        summary: `Dataset contains ${totalTransactions} transactions. ` +
            `Total amount: ${totalAmount.toFixed(2)}. ` +
            `Categories: ${categories.slice(0, 10).join(', ')}${categories.length > 10 ? '...' : ''}. ` +
            `Date range: ${minDate?.toISOString().split('T')[0] || 'N/A'} to ${maxDate?.toISOString().split('T')[0] || 'N/A'}.`,
        totalTransactions,
        categories,
        dateRange: { min: minDate, max: maxDate }
    };
}

/**
 * Query data using AI
 * @param {string} question - Natural language question
 * @param {Array} data - Transaction data
 * @param {Object} options - Provider options
 * @returns {Promise<Object>} - AI response with answer
 */
export async function queryData(question, data, options = {}) {
    const settings = getSettings();
    const aiConfig = getAiConfig();

    // Resolve Provider
    let provider = options.provider || settings.aiProvider;
    let ai_model = aiConfig.model;
    // Use provider from AI Config if not set in options/settings
    if (!provider && aiConfig && aiConfig.provider) {
        provider = aiConfig.provider;
    }

    // Infer provider from model if still not resolved
    if (ai_model) {
        if (ai_model.startsWith('gemini')) {
            provider = 'gemini';
        } else if (ai_model.startsWith('gpt')) {
            provider = 'openai';
        }
    } else {
        throw new Error(`AI model not configured. Please configure it in Settings (AI Categorization section) or set AI_API_KEY env var.`);
    }


    // Resolve API Key
    let apiKey = options.apiKey || process.env.AI_API_KEY || getAiKey();

    if (!apiKey && provider !== 'ollama') {
        throw new Error(`AI API key not configured. Please configure it in Settings (AI Categorization section) or set AI_API_KEY env var.`);
    }

    // Resolve Model
    const model = options.model || (provider === 'gemini' ? (aiConfig.model || 'gemini-2.5-flash-lite') : null);

    const context = buildDataContext(data);

    // Build the prompt
    const systemPrompt = `You are a financial data analyst assistant. You help users understand their transaction data.

Available data context:
${JSON.stringify(data)}

You can analyze the data and answer questions about spending patterns, categories, trends, etc.
When asked for specific calculations, provide clear numerical answers.
Keep responses concise and focused on the data.`;

    const userPrompt = question;

    try {
        let response;

        switch (provider) {
            case 'openai':
                response = await queryOpenAI(systemPrompt, userPrompt, apiKey, data, model);
                break;
            case 'gemini':
                response = await queryGemini(systemPrompt, userPrompt, apiKey, data, model);
                break;
            case 'ollama':
                response = await queryOllama(systemPrompt, userPrompt, options.ollamaUrl || 'http://localhost:11434', data, model);
                break;
            default:
                throw new Error(`Unknown AI provider: ${provider}`);
        }

        return {
            success: true,
            question,
            answer: response,
            provider,
            context: context.summary
        };
    } catch (error) {
        return {
            success: false,
            question,
            error: error.message,
            provider
        };
    }
}

/**
 * Query OpenAI
 */
async function queryOpenAI(systemPrompt, userPrompt, apiKey, data, model) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 500
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error: ${err}`);
    }

    const result = await response.json();
    return result.choices[0].message.content;
}

/**
 * Query Google Gemini
 */
async function queryGemini(systemPrompt, userPrompt, apiKey, data, model) {
    const modelName = model || 'gemini-2.5-flash-lite';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: `${systemPrompt}\n\nUser question: ${userPrompt}` }]
            }]
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error: ${err}`);
    }

    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
}

/**
 * Query local Ollama
 */
async function queryOllama(systemPrompt, userPrompt, ollamaUrl, data, model) {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model || 'llama2',
            prompt: `${systemPrompt}\n\nUser question: ${userPrompt}`,
            stream: false
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Ollama API error: ${err}`);
    }

    const result = await response.json();
    return result.response;
}

/**
 * Execute a local analysis function
 * @param {string} functionName - Name of the function to run
 * @param {Array} data - Transaction data
 * @param {Object} params - Function parameters
 */
export function executeLocalFunction(functionName, data, params = {}) {
    const fn = localFunctions[functionName];
    if (!fn) {
        throw new Error(`Unknown function: ${functionName}`);
    }

    return fn(data, ...Object.values(params));
}

/**
 * Get list of available local functions
 */
export function getLocalFunctions() {
    return Object.keys(localFunctions).map(name => ({
        name,
        description: getFunctionDescription(name)
    }));
}

function getFunctionDescription(name) {
    const descriptions = {
        filterByCategory: 'Filter transactions by category name',
        filterByDateRange: 'Filter transactions within a date range',
        filterByAmount: 'Filter transactions by amount range',
        calculateTotal: 'Calculate total amount of transactions',
        calculateAverage: 'Calculate average transaction amount',
        findLargestExpense: 'Find the largest expense transaction',
        countTransactions: 'Count number of transactions',
        searchDescription: 'Search transactions by description keyword'
    };
    return descriptions[name] || '';
}

/**
 * Fetch available Gemini models dynamically
 */
export async function getAvailableModels() {
    try {
        const apiKey = getAiKey();
        if (!apiKey) return [];

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            console.error(`Failed to fetch models: ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        if (!data.models) return [];

        // Filter and map to our format
        return data.models
            .filter(m => m.name.includes('gemini'))
            .map(m => ({
                value: m.name.replace('models/', ''),
                label: m.displayName
            }))
            // Sort by latest/version if possible, or just keep default order
            .sort((a, b) => b.value.localeCompare(a.value));

    } catch (e) {
        console.error('Error getting dynamic models:', e);
        return [];
    }
}
