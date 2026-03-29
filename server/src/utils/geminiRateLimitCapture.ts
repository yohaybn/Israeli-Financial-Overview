/**
 * Captures Gemini API rate-limit headers on HTTP 429 by wrapping global fetch.
 * The @google/generative-ai SDK does not expose response headers on errors.
 */

export interface GeminiRateLimitHeaders {
    limitRequests: string | null;
    remainingRequests: string | null;
    remainingTokens: string | null;
}

let last429Headers: GeminiRateLimitHeaders | null = null;

const originalFetch = globalThis.fetch.bind(globalThis);

function isGeminiGenerativeUrl(url: string): boolean {
    return url.includes('generativelanguage.googleapis.com');
}

function captureHeadersFromResponse(res: Response): GeminiRateLimitHeaders {
    return {
        limitRequests: res.headers.get('x-ratelimit-limit-requests'),
        remainingRequests: res.headers.get('x-ratelimit-remaining-requests'),
        remainingTokens: res.headers.get('x-ratelimit-remaining-tokens'),
    };
}

function wrappedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr =
        typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : input instanceof URL
                ? input.href
                : String(input);

    return originalFetch(input, init).then((res) => {
        if (!isGeminiGenerativeUrl(urlStr)) return res;
        if (res.status === 429) {
            last429Headers = captureHeadersFromResponse(res);
        } else if (res.ok) {
            last429Headers = null;
        }
        return res;
    });
}

let installed = false;

export function installGeminiRateLimitFetchWrap(): void {
    if (installed) return;
    installed = true;
    globalThis.fetch = wrappedFetch as typeof fetch;
}

/** Pop last captured 429 headers (clears the buffer). */
export function takeLastGemini429RateLimitHeaders(): GeminiRateLimitHeaders | null {
    const h = last429Headers;
    last429Headers = null;
    return h;
}

/**
 * On Gemini 429 / RESOURCE_EXHAUSTED, attaches `geminiRateLimit` to the error object when headers were captured.
 */
export function attachGeminiRateLimitToError(error: unknown): void {
    if (error === null || error === undefined) return;
    const e = error as Record<string, unknown>;
    const status = typeof e.status === 'number' ? e.status : undefined;
    const msg = e.message != null ? String(e.message) : '';
    const looks429 =
        status === 429 || msg.includes('[429') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
    if (!looks429) return;
    const h = takeLastGemini429RateLimitHeaders();
    if (
        h &&
        (h.limitRequests != null || h.remainingRequests != null || h.remainingTokens != null)
    ) {
        (error as { geminiRateLimit?: GeminiRateLimitHeaders }).geminiRateLimit = h;
    }
}

installGeminiRateLimitFetchWrap();
