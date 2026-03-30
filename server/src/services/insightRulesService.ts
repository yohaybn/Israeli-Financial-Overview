import { v4 as uuidv4 } from 'uuid';
import type { Transaction } from '@app/shared';
import {
    applyMessageTemplates,
    computeRulePeriodKey,
    evaluateInsightRuleDefinition,
    type DigestLocale,
} from '@app/shared';
import type { DbService } from './dbService.js';

/**
 * Re-evaluates all enabled insight rules against `transactions`, upserts or removes rows in `insight_rule_fires`.
 */
export function refreshInsightRuleFires(
    transactions: Transaction[],
    db: DbService,
    options?: { referenceDate?: Date }
): { matched: number; cleared: number } {
    const ref = options?.referenceDate ?? new Date();
    const allRules = db.listInsightRules();
    let matched = 0;
    let cleared = 0;

    for (const r of allRules) {
        if (!r.enabled) {
            cleared += db.deleteInsightRuleFiresByRuleId(r.id);
            continue;
        }

        const periodKey = computeRulePeriodKey(r.definition, ref);
        const ev = evaluateInsightRuleDefinition(transactions, r.definition, { referenceDate: ref });
        if (!ev.matched) {
            if (db.deleteInsightRuleFireByRuleAndPeriod(r.id, periodKey)) cleared++;
            continue;
        }

        const { en, he } = applyMessageTemplates(r.definition.output, ev.placeholders);
        const kind = r.definition.output.kind;
        const score = r.definition.output.score;
        db.upsertInsightRuleFire(uuidv4(), r.id, periodKey, kind, score, en, he);
        matched++;
    }

    return { matched, cleared };
}

export type MergedTopInsight = {
    id: string;
    text: string;
    score: number;
    createdAt: string;
    source: 'ai' | 'rule';
    ruleId?: string;
    messageEn?: string;
    messageHe?: string;
};

function pickLocaleText(row: { messageEn: string; messageHe: string }, locale: DigestLocale): string {
    if (locale === 'he') {
        const h = row.messageHe.trim();
        if (h) return h;
    } else {
        const e = row.messageEn.trim();
        if (e) return e;
    }
    return row.messageHe.trim() || row.messageEn.trim();
}

/**
 * Merge AI memory insights with rule fires; sort by score desc, take `limit`.
 */
export function mergeTopInsights(
    db: DbService,
    limit: number,
    locale: DigestLocale
): MergedTopInsight[] {
    const ai = db.topAiMemoryInsights(Math.max(limit * 2, limit));
    const fires = db.listInsightRuleFires(Math.max(limit * 2, limit));

    const merged: MergedTopInsight[] = [
        ...ai.map((a) => ({
            id: a.id,
            text: a.text,
            score: a.score,
            createdAt: a.createdAt,
            source: 'ai' as const,
        })),
        ...fires.map((f) => ({
            id: f.id,
            text: pickLocaleText({ messageEn: f.messageEn, messageHe: f.messageHe }, locale),
            score: f.score,
            createdAt: f.updatedAt,
            source: 'rule' as const,
            ruleId: f.ruleId,
            messageEn: f.messageEn,
            messageHe: f.messageHe,
        })),
    ];

    merged.sort((a, b) => b.score - a.score || (a.createdAt < b.createdAt ? 1 : -1));
    return merged.slice(0, limit);
}
