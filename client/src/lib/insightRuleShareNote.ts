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

/** Replaces runs of digits (optional decimal) so free-text descriptions hide amounts when sharing masked. */
function maskDigitsInPlainText(s: string): string {
    return s.replace(/\d+(?:[.,]\d+)?/g, 'X');
}

function stripMessagePlaceholders(message: string): string {
    return message
        .replace(/\{\{\s*[^}]+\s*\}\}/g, '…')
        .replace(/\s+/g, ' ')
        .trim();
}

export type BuildCommunityShareNoteOptions = {
    /** When true, numeric amounts and scores in the generated note appear as "X". */
    maskAmounts?: boolean;
};

/**
 * Catalog / submission text derived only from the rule: `definition.description`, else builder summary,
 * else a shortened insight message template (no placeholders). Used as root `description` in community submit.
 */
export function buildDefaultCommunityShareNote(
    def: InsightRuleDefinitionV1,
    t: TFunction,
    i18nLanguage: string,
    options?: BuildCommunityShareNoteOptions
): string {
    const maskAmounts = options?.maskAmounts === true;

    const fromDef = def.description?.trim();
    if (fromDef) {
        const text = maskAmounts ? maskDigitsInPlainText(fromDef) : fromDef;
        return clampToSubmissionMax(text);
    }

    const builder = definitionToBuilderState(def);
    if (builder) {
        return clampToSubmissionMax(formatBuilderStateShareNote(t, builder.state, { maskAmounts }));
    }

    const raw = i18nLanguage.startsWith('he') ? def.output.message.he : def.output.message.en;
    let fallback = stripMessagePlaceholders(raw) || stripMessagePlaceholders(def.output.message.en);
    if (maskAmounts) {
        fallback = maskDigitsInPlainText(fallback);
    }
    return clampToSubmissionMax(fallback);
}
