import { api } from '../lib/api';

/**
 * Sends a client-side error to the server (`error.log`). No other levels are stored.
 */
export async function logClientError(message: string, metadata?: Record<string, unknown>): Promise<void> {
    console.error(`[Client] ${message}`, metadata ?? '');

    try {
        await api.post('/logs', {
            level: 'error',
            message,
            timestamp: new Date().toISOString(),
            ...(metadata || {})
        });
    } catch {
        // Avoid loops / noise if logging fails
    }
}
