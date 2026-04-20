import type { InsightRuleExportRow } from './insightRules.js';
import { parseInsightRuleDefinition } from './insightRules.js';
import { stripInsightRuleDefinitionAmountPlaceholders } from './insightRuleExportMask.js';

/** Stored in repo as one file per submission under community/rules/. */
export const COMMUNITY_INSIGHT_RULE_FILE_SCHEMA_VERSION = 1 as const;

export const COMMUNITY_INSIGHT_RULE_SUBMISSION_VERSION = 1 as const;

/** Max lengths aligned with GAS validator (keep in sync). */
export const COMMUNITY_AUTHOR_MAX_LEN = 120;
export const COMMUNITY_DESCRIPTION_MAX_LEN = 2000;
export const COMMUNITY_RULE_NAME_MAX_LEN = 200;
/** Serialized JSON size cap for `rule` (approximate). */
export const COMMUNITY_RULE_PAYLOAD_MAX_BYTES = 65536;

export interface CommunityInsightRuleSubmissionV1 {
    version: typeof COMMUNITY_INSIGHT_RULE_SUBMISSION_VERSION;
    author: string;
    /**
     * Optional short text for the repo file / GAS index: usually derived from the rule (`definition.description`
     * or an auto-generated summary from the same definition).
     */
    description?: string;
    rule: InsightRuleExportRow;
}

/** One row in community/index.json for listing without fetching every rule file. */
export interface CommunityInsightRulesIndexEntry {
    id: string;
    name: string;
    author: string;
    /** Same as submission `description` / rule file (rule-derived blurb). */
    description?: string;
    submittedAt: string;
    /** Repo-relative path, e.g. community/rules/<id>.json */
    path: string;
    /** Maintainer-curated highlight; sort Featured first in UI. */
    featured?: boolean;
}

export interface CommunityInsightRulesIndex {
    version: 1;
    updatedAt: string;
    rules: CommunityInsightRulesIndexEntry[];
}

/** Full object written to community/rules/<id>.json */
export interface CommunityInsightRuleRepoFileV1 {
    schemaVersion: typeof COMMUNITY_INSIGHT_RULE_FILE_SCHEMA_VERSION;
    submittedAt: string;
    author: string;
    description?: string;
    rule: InsightRuleExportRow;
}

function isObject(x: unknown): x is Record<string, unknown> {
    return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function parseCommunityInsightRuleSubmission(
    raw: unknown
): { ok: true; value: CommunityInsightRuleSubmissionV1 } | { ok: false; error: string } {
    if (!isObject(raw)) return { ok: false, error: 'body must be object' };
    if (raw.version !== COMMUNITY_INSIGHT_RULE_SUBMISSION_VERSION) return { ok: false, error: 'unsupported submission version' };
    if (typeof raw.author !== 'string') return { ok: false, error: 'author required' };
    const author = raw.author.trim();
    if (!author.length) return { ok: false, error: 'author required' };
    if (author.length > COMMUNITY_AUTHOR_MAX_LEN) return { ok: false, error: 'author too long' };
    if (raw.description !== undefined) {
        if (typeof raw.description !== 'string') return { ok: false, error: 'description must be string' };
        if (raw.description.length > COMMUNITY_DESCRIPTION_MAX_LEN) return { ok: false, error: 'description too long' };
    }
    const rule = raw.rule;
    if (!isObject(rule)) return { ok: false, error: 'rule required' };
    if (typeof rule.id !== 'string' || !rule.id.trim()) return { ok: false, error: 'rule.id required' };
    if (typeof rule.name !== 'string' || !rule.name.trim()) return { ok: false, error: 'rule.name required' };
    if (rule.name.length > COMMUNITY_RULE_NAME_MAX_LEN) return { ok: false, error: 'rule.name too long' };
    if (typeof rule.enabled !== 'boolean') return { ok: false, error: 'rule.enabled required' };
    if (typeof rule.priority !== 'number' || !Number.isFinite(rule.priority)) return { ok: false, error: 'rule.priority required' };
    if (rule.source !== 'user' && rule.source !== 'ai') return { ok: false, error: 'rule.source invalid' };
    const stripped = stripInsightRuleDefinitionAmountPlaceholders(rule.definition);
    if (!stripped.ok) return { ok: false, error: stripped.error };
    const def = parseInsightRuleDefinition(stripped.normalized);
    if (!def.ok) return { ok: false, error: def.error };

    const payloadBytes = new TextEncoder().encode(JSON.stringify({ rule: { ...rule, definition: def.value } })).length;
    if (payloadBytes > COMMUNITY_RULE_PAYLOAD_MAX_BYTES) return { ok: false, error: 'rule payload too large' };

    return {
        ok: true,
        value: {
            version: COMMUNITY_INSIGHT_RULE_SUBMISSION_VERSION,
            author,
            description: raw.description?.trim() || undefined,
            rule: {
                id: rule.id.trim(),
                name: rule.name.trim(),
                enabled: rule.enabled,
                priority: Math.round(rule.priority),
                source: rule.source,
                definition: def.value,
            },
        },
    };
}

export function parseCommunityInsightRulesIndex(
    raw: unknown
): { ok: true; value: CommunityInsightRulesIndex } | { ok: false; error: string } {
    if (!isObject(raw)) return { ok: false, error: 'index must be object' };
    if (raw.version !== 1) return { ok: false, error: 'unsupported index version' };
    if (typeof raw.updatedAt !== 'string') return { ok: false, error: 'updatedAt required' };
    const rules = raw.rules;
    if (!Array.isArray(rules)) return { ok: false, error: 'rules must be array' };
    const out: CommunityInsightRulesIndexEntry[] = [];
    for (const r of rules) {
        if (!isObject(r)) return { ok: false, error: 'index entry must be object' };
        if (typeof r.id !== 'string' || !r.id) return { ok: false, error: 'entry.id' };
        if (typeof r.name !== 'string') return { ok: false, error: 'entry.name' };
        if (typeof r.author !== 'string') return { ok: false, error: 'entry.author' };
        if (typeof r.submittedAt !== 'string') return { ok: false, error: 'entry.submittedAt' };
        if (typeof r.path !== 'string' || !r.path) return { ok: false, error: 'entry.path' };
        let description: string | undefined;
        if (r.description !== undefined) {
            if (typeof r.description !== 'string') return { ok: false, error: 'entry.description' };
            const d = r.description.trim();
            if (d.length > COMMUNITY_DESCRIPTION_MAX_LEN) return { ok: false, error: 'entry.description too long' };
            description = d.length ? d : undefined;
        }
        out.push({
            id: r.id,
            name: r.name,
            author: r.author,
            ...(description ? { description } : {}),
            submittedAt: r.submittedAt,
            path: r.path,
            featured: typeof r.featured === 'boolean' ? r.featured : undefined,
        });
    }
    return {
        ok: true,
        value: { version: 1, updatedAt: raw.updatedAt, rules: out },
    };
}

export function parseCommunityInsightRuleRepoFile(
    raw: unknown
): { ok: true; value: CommunityInsightRuleRepoFileV1 } | { ok: false; error: string } {
    if (!isObject(raw)) return { ok: false, error: 'file must be object' };
    if (raw.schemaVersion !== COMMUNITY_INSIGHT_RULE_FILE_SCHEMA_VERSION) return { ok: false, error: 'unsupported file schema' };
    if (typeof raw.submittedAt !== 'string') return { ok: false, error: 'submittedAt required' };
    if (typeof raw.author !== 'string') return { ok: false, error: 'author required' };
    if (!('rule' in raw)) return { ok: false, error: 'rule required' };
    const sub = parseCommunityInsightRuleSubmission({
        version: COMMUNITY_INSIGHT_RULE_SUBMISSION_VERSION,
        author: raw.author,
        description: raw.description,
        rule: raw.rule,
    });
    if (!sub.ok) return sub;
    return {
        ok: true,
        value: {
            schemaVersion: COMMUNITY_INSIGHT_RULE_FILE_SCHEMA_VERSION,
            submittedAt: raw.submittedAt,
            author: sub.value.author,
            description: sub.value.description,
            rule: sub.value.rule,
        },
    };
}

/** Featured first, then newest by submittedAt (ISO strings compare lexicographically for same timezone). */
function stripMessagePlaceholdersForCatalog(s: string): string {
    return s
        .replace(/\{\{\s*[^}]+\s*\}\}/g, '…')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Blurb for community index / GAS: submission note, else IFTTT `definition.description`, else `output.message` (placeholders stripped).
 * Call after {@link parseCommunityInsightRuleSubmission} so `definition` is normalized.
 */
export function resolveCommunityCatalogDescription(value: CommunityInsightRuleSubmissionV1): string | undefined {
    const top = value.description?.trim();
    if (top) {
        return top.length > COMMUNITY_DESCRIPTION_MAX_LEN ? top.slice(0, COMMUNITY_DESCRIPTION_MAX_LEN) : top;
    }
    const def = value.rule.definition;
    const fromDef = def.description?.trim();
    if (fromDef) {
        return fromDef.length > COMMUNITY_DESCRIPTION_MAX_LEN ? fromDef.slice(0, COMMUNITY_DESCRIPTION_MAX_LEN) : fromDef;
    }
    const en = def.output.message.en?.trim() ?? '';
    const he = def.output.message.he?.trim() ?? '';
    const raw = en || he;
    if (!raw) return undefined;
    const stripped = stripMessagePlaceholdersForCatalog(raw);
    if (!stripped) return undefined;
    return stripped.length > COMMUNITY_DESCRIPTION_MAX_LEN ? stripped.slice(0, COMMUNITY_DESCRIPTION_MAX_LEN) : stripped;
}

export function sortCommunityIndexEntriesForDisplay(entries: CommunityInsightRulesIndexEntry[]): CommunityInsightRulesIndexEntry[] {
    return [...entries].sort((a, b) => {
        const fa = a.featured ? 1 : 0;
        const fb = b.featured ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return b.submittedAt.localeCompare(a.submittedAt);
    });
}
