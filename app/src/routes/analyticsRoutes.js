/**
 * Analytics Routes
 * 
 * API endpoints for data analytics functionality
 */

import express from 'express';
import { getAvailableAnalyzers, runAnalyzer, runAnalyzers, runAllAnalyzers } from '../services/analyticsService.js';
import { loadData, getAvailableSources, getLocalDataFiles } from '../services/dataLoader.js';
import { queryData, executeLocalFunction, getLocalFunctions } from '../services/aiQueryService.js';
import { initializeAnalyzers } from '../services/analyzers/index.js';

const router = express.Router();

// Initialize analyzers on module load
initializeAnalyzers();

/**
 * GET /analytics/analyzers
 * List all available analyzers
 */
router.get('/analyzers', (req, res) => {
    try {
        const analyzers = getAvailableAnalyzers();
        res.json({ success: true, analyzers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /analytics/sources
 * List available data sources
 */
router.get('/sources', (req, res) => {
    try {
        const sources = getAvailableSources();
        res.json({ success: true, sources });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /analytics/local-files
 * List available local data files
 */
router.get('/local-files', (req, res) => {
    try {
        const files = getLocalDataFiles();
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /analytics/load
 * Load data from a source
 * Body: { source: 'sheets'|'local'|'memory', options: { sheetId?, filename?, data? } }
 */
router.post('/load', async (req, res) => {
    let { source, options, preview = true } = req.body;

    // Check if preview is explicitly false in options
    if (options && options.preview === false) {
        preview = false;
    }

    if (!source) {
        return res.status(400).json({ success: false, error: 'Source is required' });
    }

    try {
        const data = await loadData(source, options || {});
        res.json({
            success: true,
            rowCount: data.length,
            data: preview ? data.slice(0, 100) : data, // Return all if preview is false
            hasMore: preview && data.length > 100
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /analytics/run
 * Run selected analyzers on data
 * Body: { analyzers: string[], source: string, options: object, data?: array }
 */
router.post('/run', async (req, res) => {
    const { analyzers, source, options = {}, data: inputData } = req.body;

    try {
        // Load data if not provided directly
        let data;
        if (inputData && Array.isArray(inputData)) {
            data = inputData;
        } else if (source) {
            data = await loadData(source, options);
        } else {
            return res.status(400).json({ success: false, error: 'Either data or source is required' });
        }

        if (!data || data.length === 0) {
            return res.status(400).json({ success: false, error: 'No data to analyze' });
        }

        // Run analyzers
        let results;
        if (!analyzers || analyzers.length === 0 || analyzers.includes('all')) {
            results = await runAllAnalyzers(data, options);
        } else {
            results = await runAnalyzers(analyzers, data, options);
        }

        res.json({
            success: true,
            dataRowCount: data.length,
            results
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /analytics/query
 * AI-powered natural language query
 * Body: { question: string, source?: string, options?: object, data?: array }
 */
router.post('/query', async (req, res) => {
    const { question, source, options = {}, data: inputData } = req.body;

    if (!question) {
        return res.status(400).json({ success: false, error: 'Question is required' });
    }

    try {
        // Load data if not provided directly
        let data;
        if (inputData && Array.isArray(inputData)) {
            data = inputData;
        } else if (source) {
            data = await loadData(source, options);
        } else {
            return res.status(400).json({ success: false, error: 'Either data or source is required' });
        }

        const result = await queryData(question, data, options);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /analytics/functions
 * List available local analysis functions
 */
router.get('/functions', (req, res) => {
    try {
        const functions = getLocalFunctions();
        res.json({ success: true, functions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /analytics/execute
 * Execute a local analysis function
 * Body: { function: string, params: object, source?: string, options?: object, data?: array }
 */
router.post('/execute', async (req, res) => {
    const { function: functionName, params = {}, source, options = {}, data: inputData } = req.body;

    if (!functionName) {
        return res.status(400).json({ success: false, error: 'Function name is required' });
    }

    try {
        // Load data if not provided directly
        let data;
        if (inputData && Array.isArray(inputData)) {
            data = inputData;
        } else if (source) {
            data = await loadData(source, options);
        } else {
            return res.status(400).json({ success: false, error: 'Either data or source is required' });
        }

        const result = executeLocalFunction(functionName, data, params);
        res.json({
            success: true,
            function: functionName,
            result: Array.isArray(result) ? { data: result, count: result.length } : result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
