
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAiConfig } from '../config.js';
import { decrypt } from '../encryption.js';

const CACHE_PATH = path.resolve('./categories-cache.json');
const APP_SECRET = process.env.APP_SECRET || 'bank-scraper-secret-key-change-me';

// Load Cache
function loadCache() {
    if (fs.existsSync(CACHE_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        } catch (e) {
            console.error('Failed to load category cache', e);
        }
    }
    return {};
}

// Save Cache
function saveCache(cache) {
    try {
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.error('Failed to save category cache', e);
    }
}

export async function categorize(inputData) {
    const aiConfig = getAiConfig();
    const cache = loadCache();

    // Check if AI is enabled and configured
    if (!aiConfig || !aiConfig.apiKey) {
        throw new Error('AI not configured. Please configure API key in Settings.');
    }

    // Determine if we have a flat array of transactions or a nested structure (Accounts with txns)
    let transactions = [];
    let isNested = false;

    if (Array.isArray(inputData)) {
        if (inputData.length > 0 && inputData[0].txns) {
            isNested = true;
            inputData.forEach(account => {
                if (account.txns) transactions = transactions.concat(account.txns);
            });
        } else {
            transactions = inputData;
        }
    }

    if (transactions.length === 0) return inputData;

    // Identify unique descriptions that need categorization
    const distinctDescriptions = [...new Set(transactions.map(t => (t.description || '').trim()))].filter(Boolean);
    const missing = distinctDescriptions.filter(desc => !cache[desc]);

    if (missing.length > 0) {
        console.log(`[Categorizer] Found ${missing.length} new descriptions to categorize.`);

        // Get Decrypted Key
        let apiKey = aiConfig.apiKey;
        try {
            const encryptedObj = JSON.parse(apiKey);
            if (encryptedObj.iv && encryptedObj.content) {
                apiKey = decrypt(encryptedObj, APP_SECRET);
            }
        } catch (e) {
            // assume plain text if parse fails or not encrypted structure
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const modelName = aiConfig.model || 'gemini-2.5-flash';
        console.log(`[Categorizer] Using model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });

        // Get categories list from config or use defaults
        const defaultCategories = 'מזון, תחבורה, קניות, מנויים, בריאות, מגורים, בילויים, משכורת, העברות, חשבונות, ביגוד, חינוך, אחר';
        const categoriesList = aiConfig.categories || defaultCategories;

        // Prompt construction
        const prompt = `
        You are a financial assistant. I will provide a list of transaction descriptions in Hebrew or English. 
        For each description, provide a short, general category from this list: ${categoriesList}
        If none of the categories fit, use "שונות" (Other).
        Return ONLY a valid JSON object where keys are the descriptions and values are the categories.
        Do not include markdown formatting like \`\`\`json. Just the raw JSON string.
        
        Descriptions:
        ${JSON.stringify(missing)}
        `;

        console.log(`[Categorizer] Sending request to AI...`);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Clean markdown if present
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const newCategories = JSON.parse(cleanText);

            // Validate categories - if not in list, set to "אחר"
            const validCategories = categoriesList.split(',').map(c => c.trim());
            Object.keys(newCategories).forEach(key => {
                if (!validCategories.includes(newCategories[key])) {
                    newCategories[key] = 'אחר';
                }
            });

            // Update Cache
            Object.assign(cache, newCategories);
            saveCache(cache);
            console.log(`[Categorizer] Successfully prioritized ${Object.keys(newCategories).length} items.`);
        } catch (e) {
            console.error('[Categorizer] Failed to parse AI response:', cleanText);
            throw new Error('AI response was not valid JSON');
        }
    }

    // Apply Categories
    if (isNested) {
        inputData.forEach(account => {
            if (account.txns) {
                account.txns.forEach(t => {
                    t.category = cache[(t.description || '').trim()] || t.category || '';
                });
            }
        });
        return inputData;
    } else {
        return transactions.map(t => {
            return {
                ...t,
                category: cache[(t.description || '').trim()] || t.category || ''
            };
        });
    }
}

export function updateCategory(description, category) {
    const cache = loadCache();
    cache[description] = category;
    saveCache(cache);
}

export function checkDescriptionExists(description) {
    const cache = loadCache();
    return Object.prototype.hasOwnProperty.call(cache, description);
}
