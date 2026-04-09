import { isAiModelHighDemandMessage } from './aiModelHighDemand.js';

/**
 * True when retrying with another model may help (rate limit or temporary overload).
 * Matches Gemini 429 / RESOURCE_EXHAUSTED and 503 / SERVICE_UNAVAILABLE / high-demand messages.
 */
export function isGeminiRateLimitOrOverloadError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number })?.status;
    const code = (error as { code?: string | number })?.code;

    if (status === 429 || status === 503) return true;

    const codeNum = typeof code === 'number' ? code : typeof code === 'string' ? parseInt(code, 10) : NaN;
    if (codeNum === 429 || codeNum === 503) return true;

    if (msg.includes('RESOURCE_EXHAUSTED')) return true;
    if (msg.includes('SERVICE_UNAVAILABLE')) return true;
    if (msg.includes('[429') || msg.includes(' 429 ') || msg.includes('status code 429')) return true;
    if (msg.includes('[503') || msg.includes(' 503 ') || msg.includes('status code 503')) return true;
    if (isAiModelHighDemandMessage(msg)) return true;

    return false;
}
