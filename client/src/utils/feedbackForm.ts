import { FEEDBACK_FORM_VIEW_URL } from '../config/feedbackGoogleForm';
import { api } from '../lib/api';

export function getAppBuildVersion(): string {
    return import.meta.env.VITE_APP_BUILD_VERSION?.trim() || 'unknown';
}

export function getFeedbackFormBaseUrl(): string {
    return FEEDBACK_FORM_VIEW_URL.trim();
}

export async function fetchLogsForFeedback(types: Array<'server' | 'error_log'>): Promise<string> {
    const parts: string[] = [];
    const lines = 200;
    for (const type of types) {
        const { data } = await api.get<{ type: string; lines: string; totalLines: number }>(
            `/logs?type=${type}&lines=${lines}`
        );
        const header = type === 'error_log' ? 'error log' : `${type} log`;
        parts.push(`=== ${header} (last ${lines} lines) ===\n${data.lines}`);
    }
    return parts.join('\n\n');
}

/** Opens the form URL without query prefill. `fullLogText` is for optional copy-paste into the form. */
export function buildFeedbackPayload(opts: {
    includeServer: boolean;
    includeClient: boolean;
    rawLogs: string;
}): { url: string; fullLogText: string } {
    let logExcerpt = '';
    if (opts.includeServer || opts.includeClient) {
        logExcerpt = opts.rawLogs;
    }
    return { url: getFeedbackFormBaseUrl(), fullLogText: logExcerpt };
}
