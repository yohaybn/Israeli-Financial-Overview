import axios from 'axios';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class RemoteLogger {
    private endpoint: string;

    constructor(endpoint: string = '/api/logs') {
        this.endpoint = endpoint;
    }

    private async log(level: LogLevel, message: string, metadata: any = {}) {
        // Log to local console first
        const consoleMethod = (console as any)[level] || console.log;
        consoleMethod(`[Remote] ${message}`, metadata);

        try {
            await axios.post(this.endpoint, {
                level,
                message,
                timestamp: new Date().toISOString(),
                ...metadata
            });
        } catch (error) {
            // Silently fail if logging fails to avoid infinite loops or UI distraction
            console.error('Failed to send log to server:', error);
        }
    }

    info(message: string, metadata?: any) {
        this.log('info', message, metadata);
    }

    warn(message: string, metadata?: any) {
        this.log('warn', message, metadata);
    }

    error(message: string, metadata?: any) {
        this.log('error', message, metadata);
    }

    debug(message: string, metadata?: any) {
        this.log('debug', message, metadata);
    }
}

export const logger = new RemoteLogger();
