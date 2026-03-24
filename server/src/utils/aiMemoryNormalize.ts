/** Normalized key for deduplicating AI memory alerts (must match server merge + dismissal). */
export function normalizeAiMemoryKey(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
