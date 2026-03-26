import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AiService } from '../services/aiService.js';
import { StorageService } from '../services/storageService.js';
import { DbService } from '../services/dbService.js';
import { buildUnifiedChatQueryWithMemory, mergeAndPersistAiMemory } from '../services/unifiedAiChatMemory.js';
import { telegramBotService } from '../services/telegramBotService.js';
import { runAiMemoryRetentionPrune } from '../services/aiMemoryRetention.js';
import { AI_MODEL_HIGH_DEMAND_ERROR_KEY, isAiModelHighDemandMessage } from '../utils/aiModelHighDemand.js';

const router = Router();
const aiService = new AiService();
const storageService = new StorageService();
const dbService = new DbService();

// Categorize all transactions in DB using AI
router.post('/categorize/all', async (req, res) => {
    try {
        const { force } = req.body;
        const result = await storageService.categorizeAllWithAi(!!force);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Categorize transactions in a result file using AI
router.post('/categorize/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const result = await storageService.getScrapeResult(filename);

        if (!result || !result.transactions) {
            return res.status(404).json({ success: false, error: 'File or transactions not found' });
        }

        const { transactions: categorizedTransactions, aiError } = await aiService.categorizeTransactions(result.transactions);

        // Update the existing file
        result.transactions = categorizedTransactions;
        await storageService.updateScrapeResult(filename, result);
        await storageService.applyCategoryColumnsFromTransactions(categorizedTransactions);

        res.json({ success: true, data: categorizedTransactions, categorizationError: aiError });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Chat with the data (AI Analyst)
router.post('/chat', async (req, res) => {
    try {
        const { query, filename } = req.body;

        // If filename is provided, load that data. Otherwise maybe use a global context?
        // For now, let's require a filename context.
        if (!filename) {
            return res.status(400).json({ success: false, error: 'Filename context required' });
        }

        const result = await storageService.getScrapeResult(filename);
        if (!result || !result.transactions) {
            return res.status(404).json({ success: false, error: 'Data context not found' });
        }

        const answer = await aiService.analyzeData(query, result.transactions);
        res.json({ success: true, data: answer });
    } catch (error: any) {
        const status = error.status || error.response?.status || 500;
        const code = error.code || error.response?.data?.error?.code || 'INTERNAL_ERROR';
        const msg = typeof error?.message === 'string' ? error.message : String(error);
        res.status(status).json({
            success: false,
            error: msg,
            ...(isAiModelHighDemandMessage(msg) ? { errorKey: AI_MODEL_HIGH_DEMAND_ERROR_KEY } : {}),
            code,
            status
        });
    }
});

// Chat with the data for the unified dashboard (structured JSON: response + facts + insights; memory persisted server-side)
router.post('/chat/unified', async (req, res) => {
    try {
        const { query, transactions: clientTransactions, historyNote, scope, filename, conversationHistory } = req.body;

        let transactions = clientTransactions;

        // If transactions not provided in body, or if scope/filename provided, fetch from server
        if (!transactions || scope || filename) {
            if (scope === 'all') {
                // Match /results/all and unified dashboard: include ignored rows (prompt still tells model to exclude them from calculations).
                transactions = await storageService.getAllTransactions(true);
            } else if (filename) {
                const result = await storageService.getScrapeResult(filename);
                transactions = result?.transactions || [];
            }
        }

        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ success: false, error: 'Transactions data or source (scope/filename) required' });
        }

        const contextQuery = buildUnifiedChatQueryWithMemory(historyNote, query);

        const structured = await aiService.analyzeDataStructured(contextQuery, transactions, {
            conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : undefined,
            temperature: 0.7
        });
        const { factsAdded, insightsAdded, alertsAdded, newAlerts } = mergeAndPersistAiMemory(structured);
        void telegramBotService.notifyNewAiMemoryAlerts(newAlerts);

        res.json({
            success: true,
            data: {
                response: structured.response,
                factsAdded,
                insightsAdded,
                alertsAdded
            }
        });
    } catch (error: any) {
        const status = error.status || error.response?.status || 500;
        const code = error.code || error.response?.data?.error?.code || 'INTERNAL_ERROR';
        const msg = typeof error?.message === 'string' ? error.message : String(error);
        res.status(status).json({
            success: false,
            error: msg,
            ...(isAiModelHighDemandMessage(msg) ? { errorKey: AI_MODEL_HIGH_DEMAND_ERROR_KEY } : {}),
            code,
            status
        });
    }
});

// Get AI settings
router.get('/settings', async (req, res) => {
    try {
        const settings = await aiService.getSettings();
        res.json({ success: true, data: settings });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update AI settings
router.post('/settings', async (req, res) => {
    try {
        const settings = await aiService.updateSettings(req.body);
        await runAiMemoryRetentionPrune();
        res.json({ success: true, data: settings });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get available AI models
router.get('/models', async (req, res) => {
    try {
        const models = await aiService.getAvailableModels();
        res.json({ success: true, data: models });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- AI persistent memory (single workspace) ---

router.get('/memory/facts', (_req, res) => {
    try {
        const data = dbService.listAiMemoryFacts();
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/memory/facts', (req, res) => {
    try {
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        if (!text) {
            return res.status(400).json({ success: false, error: 'text required' });
        }
        const id = uuidv4();
        dbService.insertAiMemoryFact(id, text);
        res.json({ success: true, data: { id, text } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.patch('/memory/facts/:id', (req, res) => {
    try {
        const { id } = req.params;
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        if (!text) {
            return res.status(400).json({ success: false, error: 'text required' });
        }
        const ok = dbService.updateAiMemoryFact(id, text);
        if (!ok) {
            return res.status(404).json({ success: false, error: 'Fact not found' });
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/memory/facts', (_req, res) => {
    try {
        const removed = dbService.clearAllAiMemoryFacts();
        res.json({ success: true, data: { removed } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/memory/facts/:id', (req, res) => {
    try {
        const { id } = req.params;
        const ok = dbService.deleteAiMemoryFact(id);
        if (!ok) {
            return res.status(404).json({ success: false, error: 'Fact not found' });
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/memory/insights', (_req, res) => {
    try {
        const data = dbService.listAiMemoryInsights(500);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/** Top insights by score (dashboard widget) */
router.get('/memory/insights/top', (req, res) => {
    try {
        const raw = req.query.limit;
        const limit = Math.min(20, Math.max(1, parseInt(typeof raw === 'string' ? raw : '3', 10) || 3));
        const data = dbService.topAiMemoryInsights(limit);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/memory/alerts', (_req, res) => {
    try {
        const data = dbService.listAiMemoryAlerts(500);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/memory/alerts', (_req, res) => {
    try {
        const removed = dbService.clearAllAiMemoryAlerts();
        res.json({ success: true, data: { removed } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/memory/alerts/:id', (req, res) => {
    try {
        const { id } = req.params;
        const ok = dbService.deleteAiMemoryAlert(id);
        if (!ok) {
            return res.status(404).json({ success: false, error: 'Alert not found' });
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/memory/insights', (_req, res) => {
    try {
        const removed = dbService.clearAllAiMemoryInsights();
        res.json({ success: true, data: { removed } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/memory/insights/:id', (req, res) => {
    try {
        const { id } = req.params;
        const ok = dbService.deleteAiMemoryInsight(id);
        if (!ok) {
            return res.status(404).json({ success: false, error: 'Insight not found' });
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export const aiRoutes = router;
