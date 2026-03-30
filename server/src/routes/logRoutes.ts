import { Router } from 'express';
import path from 'path';
import fs from 'fs-extra';
import { serverLogger, clientErrorLogger, getLogLevel, setLogLevel } from '../utils/logger.js';

export const logRoutes = Router();

const LOGS_DIR = path.resolve(process.env.DATA_DIR || './data', 'logs');

/** Query type for the client error log file (legacy: client, client_errors). */
function isErrorLogQueryType(type: string): boolean {
    return type === 'error_log' || type === 'client_errors' || type === 'client';
}

/**
 * @route   GET /api/logs
 * @desc    Fetch logs from the server
 * @access  Public (should be protected in production)
 */
logRoutes.get('/', async (req, res) => {
    try {
        const type = req.query.type as string || 'server';
        const linesCount = parseInt(req.query.lines as string) || 200;

        const fileName = isErrorLogQueryType(type) ? 'error.log' : 'server.log';
        const filePath = path.join(LOGS_DIR, fileName);

        if (!await fs.pathExists(filePath)) {
            return res.json({
                type,
                lines: '',
                totalLines: 0
            });
        }

        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim() !== '');

        // Return the last N lines
        const lastLines = lines.slice(-linesCount).join('\n');

        res.json({
            type,
            lines: lastLines,
            totalLines: lines.length
        });
    } catch (error) {
        serverLogger.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

/**
 * @route   POST /api/logs
 * @desc    Record client-side errors only (ignored for other levels)
 * @access  Public
 */
logRoutes.post('/', (req, res) => {
    const { level = 'info', message, timestamp, ...metadata } = req.body;
    if (level !== 'error') {
        res.status(204).send();
        return;
    }
    clientErrorLogger.error(message, { ...metadata, clientTimestamp: timestamp });
    res.status(204).send();
});

/**
 * @route   GET /api/logs/level
 * @desc    Get current log level
 * @access  Public
 */
logRoutes.get('/level', (req, res) => {
    res.json({ level: getLogLevel() });
});

/**
 * @route   POST /api/logs/clear
 * @desc    Clear server or client log file
 * @access  Public
 */
logRoutes.post('/clear', async (req, res) => {
    try {
        const type = (req.query.type as string) || 'server';
        if (type !== 'server' && !isErrorLogQueryType(type)) {
            return res.status(400).json({ error: 'type must be server or error_log (client / client_errors are legacy)' });
        }
        const fileName = isErrorLogQueryType(type) ? 'error.log' : 'server.log';
        const filePath = path.join(LOGS_DIR, fileName);
        await fs.ensureDir(LOGS_DIR);
        await fs.writeFile(filePath, '', 'utf-8');
        serverLogger.info(`Cleared ${type} log file`);
        res.json({ success: true, type });
    } catch (error) {
        serverLogger.error('Error clearing logs:', error);
        res.status(500).json({ error: 'Failed to clear logs' });
    }
});

/**
 * @route   POST /api/logs/level
 * @desc    Update log level
 * @access  Public
 */
logRoutes.post('/level', (req, res) => {
    const { level } = req.body;
    if (!level) {
        return res.status(400).json({ error: 'Level is required' });
    }

    try {
        setLogLevel(level);
        res.json({ success: true, level });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});
