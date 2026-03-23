import { v4 as uuidv4 } from 'uuid';
import { DbService } from './dbService.js';
import type { StructuredChatResult } from './aiService.js';
import type { ConversationTurn } from './aiService.js';

const db = new DbService();

function normalizeMemoryKey(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Builds the unified chat prompt including stored facts and recent insights (single shared workspace).
 */
export function buildUnifiedChatQueryWithMemory(historyNote: string | undefined, userQuery: string): string {
    const facts = db.listAiMemoryFacts();
    const insights = db.listAiMemoryInsights(40);
    const alerts = db.listAiMemoryAlerts(25);

    const factsBlock = facts.length === 0 ? '(none)' : facts.map((f) => `- ${f.text}`).join('\n');
    const insightsBlock =
        insights.length === 0 ? '(none)' : insights.map((i) => `- [score ${i.score}] ${i.text}`).join('\n');
    const alertsBlock =
        alerts.length === 0 ? '(none)' : alerts.map((a) => `- [score ${a.score}] ${a.text}`).join('\n');

    return `Context Rules:
- History transactions: Older than the current month. Used for baselines and averages.
- Current month transactions: The focus of immediate budget tracking.
- Internal transfers/credit card payments should ideally be marked as "Internal Transfer" using the category/type tools to avoid double counting expenses.
- Ignored transactions: should be fully excluded from calculations.
${historyNote ? `- Additional context: ${historyNote}` : ''}

Stored facts (editable by the user in Configuration; do not duplicate these in the JSON "facts" array unless the user changes the situation):
${factsBlock}

Recent insights (already recorded with importance score; do not repeat the same observation or duplicate in JSON "insights"):
${insightsBlock}

Recent alerts (already recorded; do not duplicate in JSON "alerts"):
${alertsBlock}

User Query: ${userQuery}`;
}

export function mergeAndPersistAiMemory(structured: StructuredChatResult): {
    factsAdded: number;
    insightsAdded: number;
    alertsAdded: number;
} {
    const existing = db.listAiMemoryFacts();
    const existingKeys = new Set(existing.map((f) => normalizeMemoryKey(f.text)));

    let factsAdded = 0;
    for (const raw of structured.facts) {
        const t = raw.trim();
        if (!t) continue;
        const key = normalizeMemoryKey(t);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        db.insertAiMemoryFact(uuidv4(), t);
        factsAdded++;
    }

    const recentInsightKeys = new Set(db.listAiMemoryInsights(120).map((i) => normalizeMemoryKey(i.text)));

    let insightsAdded = 0;
    for (const item of structured.insights) {
        const t = item.text.trim();
        if (!t) continue;
        const key = normalizeMemoryKey(t);
        if (recentInsightKeys.has(key)) continue;
        recentInsightKeys.add(key);
        db.insertAiMemoryInsight(uuidv4(), t, item.score);
        insightsAdded++;
    }

    const recentAlertKeys = new Set(db.listAiMemoryAlerts(120).map((a) => normalizeMemoryKey(a.text)));

    let alertsAdded = 0;
    for (const item of structured.alerts) {
        const t = item.text.trim();
        if (!t) continue;
        const key = normalizeMemoryKey(t);
        if (recentAlertKeys.has(key)) continue;
        recentAlertKeys.add(key);
        db.insertAiMemoryAlert(uuidv4(), t, item.score);
        alertsAdded++;
    }

    return { factsAdded, insightsAdded, alertsAdded };
}

export type { ConversationTurn };
