/**
 * Official community Apps Script deployment (public URL).
 * Override with env COMMUNITY_INSIGHT_RULES_GAS_URL when needed.
 */
export const DEFAULT_COMMUNITY_INSIGHT_RULES_GAS_URL =
    'https://script.google.com/macros/s/AKfycbwWuO7SeAwagn1sXbbZ0KSpdtmW5_EIoLtrzpN-xfoySP61u1WkgiQrUh-NylJu_IA0Fw/exec';

export function resolveCommunityInsightRulesGasUrl(): string {
    const fromEnv = (process.env.COMMUNITY_INSIGHT_RULES_GAS_URL || '').trim();
    return fromEnv || DEFAULT_COMMUNITY_INSIGHT_RULES_GAS_URL;
}

export function resolveCommunityInsightRulesSecret(): string {
    return (process.env.COMMUNITY_INSIGHT_RULES_SECRET || '').trim();
}
