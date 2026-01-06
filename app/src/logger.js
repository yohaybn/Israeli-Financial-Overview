import fs from 'fs';
import path from 'path';

const logPath = path.resolve('./server.log');

function logToFile(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(logPath, line);
    } catch (e) {
        process.stdout.write('Failed to write to log file: ' + e.message + '\n');
    }
}

export function initLogger() {
    // Clear log on startup
    try {
        fs.writeFileSync(logPath, '');
    } catch (e) {
        console.error('Failed to clear log file', e);
    }

    const originalConsoleLog = console.log;
    console.log = function (...args) {
        originalConsoleLog.apply(console, args);
        logToFile(args.join(' '));
    };
    const originalConsoleError = console.error;
    console.error = function (...args) {
        originalConsoleError.apply(console, args);
        logToFile('ERROR: ' + args.join(' '));
    };
}
