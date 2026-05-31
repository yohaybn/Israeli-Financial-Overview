import type { AiSettings } from './aiService.js';

export type AnalystPrivacyMode = 'super_privacy' | 'full_ai' | 'hybrid';

const VALID: AnalystPrivacyMode[] = ['super_privacy', 'full_ai', 'hybrid'];

export function normalizeAnalystPrivacyMode(
    settings: Pick<AiSettings, 'analystPrivacyMode' | 'superPrivacyMode'>
): AnalystPrivacyMode {
    const raw = settings.analystPrivacyMode;
    if (raw && VALID.includes(raw as AnalystPrivacyMode)) {
        return raw as AnalystPrivacyMode;
    }
    if (settings.superPrivacyMode === true) return 'super_privacy';
    return 'hybrid';
}

export function usesSuperPrivacySqlPath(mode: AnalystPrivacyMode): boolean {
    return mode === 'super_privacy' || mode === 'hybrid';
}

export function superPrivacyShareTogglesVisible(mode: AnalystPrivacyMode): boolean {
    return mode === 'super_privacy' || mode === 'hybrid';
}
