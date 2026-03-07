import { Router } from 'express';
import { AiService } from '../services/aiService.js';
import { StorageService } from '../services/storageService.js';

const router = Router();
const aiService = new AiService();
const storageService = new StorageService();

// Categorize transactions in a result file using AI
router.post('/categorize/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const result = await storageService.getScrapeResult(filename);

        if (!result || !result.transactions) {
            return res.status(404).json({ success: false, error: 'File or transactions not found' });
        }

        const categorizedTransactions = await aiService.categorizeTransactions(result.transactions);

        // Update the existing file
        result.transactions = categorizedTransactions;
        await storageService.updateScrapeResult(filename, result);

        res.json({ success: true, data: categorizedTransactions });
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
        res.status(status).json({
            success: false,
            error: error.message,
            code,
            status
        });
    }
});

// Chat with the data for the unified dashboard
router.post('/chat/unified', async (req, res) => {
    try {
        const { query, transactions, historyNote } = req.body;

        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ success: false, error: 'Transactions array required' });
        }

        const contextQuery = `
Context Rules:
- History transactions: Older than the current month. Used for baselines and averages.
- Current month transactions: The focus of immediate budget tracking.
- Internal transfers/credit card payments should ideally be marked as "Internal Transfer" using the category/type tools to avoid double counting expenses.
- Ignored transactions: should be fully excluded from calculations.
${historyNote ? `- Additional context: ${historyNote}` : ''}

User Query: ${query}
`;

        const answer = await aiService.analyzeData(contextQuery, transactions);
        res.json({ success: true, data: answer });
    } catch (error: any) {
        const status = error.status || error.response?.status || 500;
        const code = error.code || error.response?.data?.error?.code || 'INTERNAL_ERROR';
        res.status(status).json({
            success: false,
            error: error.message,
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

export const aiRoutes = router;
