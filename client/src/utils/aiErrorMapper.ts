/** From Gemini HTTP 429 response headers (when available). */
export interface GeminiRateLimitDetails {
    limitRequests?: string | null;
    remainingRequests?: string | null;
    remainingTokens?: string | null;
}

export interface AIErrorDetails {
    title: string;
    description: string;
    solution: string;
    code?: string;
    /** When set, UI should use `ai_errors.<key>.*` translations for title/description/solution */
    i18nKey?: 'model_high_demand';
    /** Populated on 429 when the server captured Gemini rate-limit headers */
    rateLimit?: GeminiRateLimitDetails | null;
}

function isModelHighDemandMessage(message: string): boolean {
    return (
        message.includes('[503 Service Unavailable]') &&
        message.includes('This model is currently experiencing high demand')
    );
}

function normalizeRateLimit(raw: unknown): GeminiRateLimitDetails | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const limitRequests = r.limitRequests != null ? String(r.limitRequests) : null;
    const remainingRequests = r.remainingRequests != null ? String(r.remainingRequests) : null;
    const remainingTokens = r.remainingTokens != null ? String(r.remainingTokens) : null;
    if (!limitRequests && !remainingRequests && !remainingTokens) return null;
    return { limitRequests, remainingRequests, remainingTokens };
}

export const mapAIError = (error: any): AIErrorDetails => {
    const apiBodyError = typeof error?.error === 'string' ? error.error : '';
    const message =
        (typeof error?.message === 'string' ? error.message : '') ||
        apiBodyError ||
        '';

    const rateLimitFromApi = normalizeRateLimit(error?.rateLimit);

    if (error?.errorKey === 'AI_MODEL_HIGH_DEMAND' || isModelHighDemandMessage(message)) {
        return {
            title: 'Service busy',
            description:
                'This model is currently experiencing high demand. Spikes in demand are usually temporary.',
            solution: 'Please try again in a few moments.',
            code: '503_MODEL_HIGH_DEMAND',
            i18nKey: 'model_high_demand',
            rateLimit: rateLimitFromApi
        };
    }

    const errorCode = error.code || error.status || (message.match(/status code (\d+)/)?.[1]);
    const statusNum = typeof error.status === 'number' ? error.status : NaN;

    // Standard Gemini API Error Codes
    // https://ai.google.dev/gemini-api/docs/troubleshooting

    if (errorCode === '400' || message.includes('INVALID_ARGUMENT')) {
        return {
            title: 'Invalid Request',
            description: 'The request parameters are invalid or the model does not support the requested features.',
            solution: 'Check your API parameters, model version (v1 vs v1beta), and ensure the prompt is within limits.',
            code: '400'
        };
    }

    if (errorCode === '403' || message.includes('PERMISSION_DENIED')) {
        if (message.includes('API key was reported as leaked')) {
            return {
                title: 'API Key Leaked',
                description: 'Your API key has been blocked by Google because it was found in a public repository.',
                solution: 'Generate a new API key in Google AI Studio and update your environment variables.',
                code: '403_LEAKED'
            };
        }
        return {
            title: 'Permission Denied',
            description: 'The API key is invalid or does not have permission to access the requested resource.',
            solution: 'Verify your API key in settings and ensure it is active in Google AI Studio.',
            code: '403'
        };
    }

    if (errorCode === '404' || message.includes('NOT_FOUND')) {
        return {
            title: 'Resource Not Found',
            description: 'The requested model or resource could not be found.',
            solution: 'Check if the model name is correct and supported in your region.',
            code: '404'
        };
    }

    if (
        errorCode === '429' ||
        errorCode === 429 ||
        statusNum === 429 ||
        message.includes('RESOURCE_EXHAUSTED')
    ) {
        return {
            title: 'Rate Limit Exceeded',
            description: 'You have sent too many requests in a short period or exceeded your quota.',
            solution: 'Wait a moment before trying again, or check your quota limits in Google AI Studio.',
            code: '429',
            rateLimit: rateLimitFromApi
        };
    }

    if (errorCode === '500' || message.includes('INTERNAL')) {
        return {
            title: 'AI Service Error',
            description: 'An unexpected error occurred on the Google Gemini servers.',
            solution: 'This is usually temporary. Please try again in a few seconds.',
            code: '500'
        };
    }

    if (errorCode === '503' || message.includes('SERVICE_UNAVAILABLE')) {
        return {
            title: 'Service Unavailable',
            description: 'The Gemini API service is temporarily overloaded or down for maintenance.',
            solution: 'Please try again in a few moments.',
            code: '503'
        };
    }

    if (errorCode === '504' || message.includes('DEADLINE_EXCEEDED')) {
        return {
            title: 'Request Timeout',
            description: 'The AI took too long to respond.',
            solution: 'Try a shorter prompt or wait for the service to become more responsive.',
            code: '504'
        };
    }

    // Response specific issues (Finish Reasons)
    if (message.includes('SAFETY')) {
        return {
            title: 'Blocked by Safety Filters',
            description: 'The prompt or response was blocked because it violated safety guidelines.',
            solution: 'Try rephrasing your question to be more neutral or adjusting safety settings if available.',
            code: 'SAFETY'
        };
    }

    if (message.includes('RECITATION')) {
        return {
            title: 'Content Recitation',
            description: 'The model stopped because the output resembled copyrighted or sensitive material.',
            solution: 'Try making your prompt more specific or unique, or increase the "temperature" setting.',
            code: 'RECITATION'
        };
    }

    // Default Fallback
    return {
        title: 'Unknown AI Error',
        description: message || 'An unexpected error occurred during the AI interaction.',
        solution: 'Check the AI Logs for more technical details or try again later.',
        code: errorCode || 'UNKNOWN'
    };
};
