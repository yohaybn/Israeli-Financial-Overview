/**
 * True when runtime env exposes a configured Gemini API key (masked or raw in UI).
 */
export function isGeminiApiKeyConfigured(value: string | undefined | null): boolean {
    if (value === undefined || value === null) return false;
    const v = String(value).trim();
    if (!v) return false;
    if (v.includes('***')) return true;
    return v.length >= 8;
}
