import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';

import { maskSensitiveData } from './masking.js';

const LOGS_DIR = path.resolve(process.env.DATA_DIR || './data', 'logs');

// Ensure logs directory exists
fs.ensureDirSync(LOGS_DIR);

const CONFIG_DIR = path.resolve(process.env.DATA_DIR || './data', 'config');
const LOG_CONFIG_PATH = path.join(CONFIG_DIR, 'log_config.json');

// Default log level
let currentLogLevel = 'info';

// Load persisted log level
try {
    if (fs.existsSync(LOG_CONFIG_PATH)) {
        const config = fs.readJsonSync(LOG_CONFIG_PATH);
        if (config.level) {
            currentLogLevel = config.level;
        }
    }
} catch (error) {
    console.error('Failed to load log config:', error);
}

// Helper function to truncate large objects and arrays in logs
function truncateLargeData(obj: any, maxLength: number = 500): any {
    if (Array.isArray(obj)) {
        if (JSON.stringify(obj).length > maxLength) {
            return `[Array with ${obj.length} items]`;
        }
    } else if (typeof obj === 'object' && obj !== null) {
        const jsonStr = JSON.stringify(obj);
        if (jsonStr.length > maxLength) {
            const keyCount = Object.keys(obj).length;
            return `[Object with ${keyCount} keys]`;
        }
    }
    return obj;
}

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        const maskedMetadata = maskSensitiveData(metadata);
        let msg = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        if (Object.keys(maskedMetadata).length > 0) {
            // Truncate large arrays and objects
            const truncatedMetadata = Object.entries(maskedMetadata).reduce((acc, [key, value]) => {
                acc[key] = truncateLargeData(value);
                return acc;
            }, {} as any);
            msg += ` ${JSON.stringify(truncatedMetadata)}`;
        }
        return msg;
    })
);

// Logger for server-side events
export const serverLogger = winston.createLogger({
    level: currentLogLevel,
    format: logFormat,
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'server.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

export const serviceLogger = serverLogger;

/** Client-originated errors only (POST /api/logs with level error). */
export const clientErrorLogger = winston.createLogger({
    level: 'error',
    format: logFormat,
    transports: [
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'error.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

/**
 * Update the log level at runtime and persist it
 */
export function setLogLevel(level: string) {
    const validLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
    if (!validLevels.includes(level)) {
        throw new Error(`Invalid log level: ${level}`);
    }

    currentLogLevel = level;
    serverLogger.level = level;

    // Persist to file
    try {
        fs.ensureDirSync(CONFIG_DIR);
        fs.writeJsonSync(LOG_CONFIG_PATH, { level });
        serverLogger.info(`Log level updated to: ${level}`);
    } catch (error) {
        serverLogger.error('Failed to persist log level:', error);
    }
}

/**
 * Get the current log level
 */
export function getLogLevel(): string {
    return currentLogLevel;
}
