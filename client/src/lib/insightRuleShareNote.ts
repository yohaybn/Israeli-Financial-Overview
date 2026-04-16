import type { TFunction } from 'i18next';
import {
    COMMUNITY_DESCRIPTION_MAX_LEN,
    definitionToBuilderState,
    type InsightRuleDefinitionV1,
} from '@app/shared';
import { formatBuilderStateShareNote } from './insightRuleSummaryText';

function clampToSubmissionMax(s: string): string {
    const t = s.trim();
    if (t.length <= COMMUNITY_DESCRIPTION_MAX_LEN) return t;
    return `${t.slice(0, COMMUNITY_DESCRIPTION_MAX_LEN - 1)}…`;
}

function stripMessagePlaceholders(message: string): string {
    return message
        .replace(/\{\{\s*[^}]+\s*\}\}/g, '…')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Default catalog description for community share: prefer definition.description, else builder summary,
 * else a shortened insight message template (no placeholders).
 */
export function buildDefaultCommunityShareNote(
    def: InsightRuleDefinitionV1,
    t: TFunction,
    i18nLanguage: string
): string {
    const fromDef = def.description?.trim();
    if (fromDef) {
        return clampToSubmissionMax(fromDef);
    }

    const builder = definitionToBuilderState(def);
    if (builder) {
        return clampToSubmissionMax(formatBuilderStateShareNote(t, builder.state));
    }

    const raw = i18nLanguage.startsWith('he') ? def.output.message.he : def.output.message.en;
    const fallback = stripMessagePlaceholders(raw) || stripMessagePlaceholders(def.output.message.en);
    return clampToSubmissionMax(fallback);
}
