import { v4 as uuidv4 } from 'uuid';
import type { UserPersonaContext } from '@app/shared';
import { isUserPersonaEmpty } from '@app/shared';
import { DbService } from './dbService.js';
import type { FactReplacement, StructuredChatResult } from './aiService.js';
import type { ConversationTurn } from './aiService.js';
import { normalizeAiMemoryKey } from '../utils/aiMemoryNormalize.js';

const db = new DbService();

/**
 * Static product documentation injected into unified AI chat so the assistant can answer setup questions.
 * (Not user-specific; complements editable "Stored facts".)
 */
const STATIC_APP_DOCS_FOR_AI = `
App documentation — Google Drive & Google Sheets (OAuth):
- Optional: used for cloud backup/export and syncing to Google Sheets. Core scraping, dashboard, and AI (Gemini) features do not require Google OAuth.
- Setup is a bit involved; users can skip it and configure later under Configuration (Google tab, Maintenance).
- In Google Cloud Console: create a project; enable Google Drive API and Google Sheets API (APIs & Services → Library).
- OAuth consent screen: External (or appropriate type), fill app name and contact emails; you can advance through Scopes and Test users with defaults for personal use.
- Credentials: Create OAuth client ID → Web application. Under Authorized redirect URIs add the exact callback URL the app uses: default is http://127.0.0.1:<PORT>/api/auth/google/callback where PORT matches the server (often 3000). If the UI is opened via http://localhost:<PORT>, add that same path with localhost too — redirect URIs must match exactly what appears in Configuration → Google (GOOGLE_REDIRECT_URI).
- Copy Client ID and Client Secret into the app (Configuration → Google or google_settings). Then sign in via the in-app Google / Sheets flows.
- If Google shows "Google hasn't verified this app", that is normal for a personal Cloud project: choose Advanced, then proceed to the app (unsafe).
- DRIVE_FOLDER_ID is optional: ID from a Drive folder URL (after /folders/) for default upload location; can be set later.
`.trim();

/**
 * Builds the unified chat prompt including stored facts and recent insights (single shared workspace).
 */
export function buildUnifiedChatQueryWithMemory(
    historyNote: string | undefined,
    userQuery: string,
    userContext?: UserPersonaContext | null
): string {
    const facts = db.listAiMemoryFacts();
    const insights = db.listAiMemoryInsights(40);
    const alerts = db.listAiMemoryAlerts(25);

    const factsBlock = facts.length === 0 ? '(none)' : facts.map((f) => `- ${f.text}`).join('\n');
    const insightsBlock =
        insights.length === 0 ? '(none)' : insights.map((i) => `- [score ${i.score}] ${i.text}`).join('\n');
    const alertsBlock =
        alerts.length === 0 ? '(none)' : alerts.map((a) => `- [score ${a.score}] ${a.text}`).join('\n');

    const personaBlock =
        userContext && !isUserPersonaEmpty(userContext)
            ? `User persona alignment (JSON; respect for tone and priorities):\n${JSON.stringify(userContext)}\n\n`
            : '';

    return `Context Rules:
- History transactions: Older than the current month. Used for baselines and averages.
- Current month transactions: The focus of immediate budget tracking.
- Internal transfers/credit card payments should ideally be marked as "Internal Transfer" using the category/type tools to avoid double counting expenses.
- Ignored transactions: should be fully excluded from calculations.
${historyNote ? `- Additional context: ${historyNote}` : ''}

${personaBlock}${STATIC_APP_DOCS_FOR_AI}

Stored facts (persistent stable context—household, income structure, goals, preferences; NOT time-bound monthly observations. User-editable in Configuration. Copy a line verbatim into factsReplace.oldText when updating; add only genuinely new stable lines in JSON "facts"):
${factsBlock}

Recent insights (already recorded with importance score; do not repeat the same observation or duplicate in JSON "insights"):
${insightsBlock}

Recent alerts (already recorded; do not duplicate in JSON "alerts"):
${alertsBlock}

User Query: ${userQuery}`;
}

function findStoredFactIdForReplacement(
    existing: { id: string; text: string }[],
    oldText: string
): string | null {
    const key = normalizeAiMemoryKey(oldText);
    const exact = existing.find((f) => normalizeAiMemoryKey(f.text) === key);
    if (exact) return exact.id;
    const fuzzy = existing.filter((f) => {
        const fk = normalizeAiMemoryKey(f.text);
        return fk.includes(key) || key.includes(fk);
    });
    return fuzzy.length === 1 ? fuzzy[0].id : null;
}

export function applyFactReplacements(
    replacements: FactReplacement[],
    existing: { id: string; text: string }[]
): { factsReplaced: number; existingKeys: Set<string> } {
    let factsReplaced = 0;
    const existingKeys = new Set(existing.map((f) => normalizeAiMemoryKey(f.text)));
    const usedIds = new Set<string>();

    for (const { oldText, newText } of replacements.slice(0, 2)) {
        const id = findStoredFactIdForReplacement(existing, oldText);
        if (!id || usedIds.has(id)) continue;
        const trimmedNew = newText.trim();
        if (!trimmedNew) continue;
        const newKey = normalizeAiMemoryKey(trimmedNew);
        if (existingKeys.has(newKey)) {
            const dup = existing.find((f) => normalizeAiMemoryKey(f.text) === newKey && f.id !== id);
            if (dup) continue;
        }
        if (db.updateAiMemoryFact(id, trimmedNew)) {
            usedIds.add(id);
            const oldFact = existing.find((f) => f.id === id);
            if (oldFact) existingKeys.delete(normalizeAiMemoryKey(oldFact.text));
            existingKeys.add(newKey);
            const row = existing.find((f) => f.id === id);
            if (row) row.text = trimmedNew;
            factsReplaced++;
        }
    }

    return { factsReplaced, existingKeys };
}

export function mergeAndPersistAiMemory(structured: StructuredChatResult): {
    factsAdded: number;
    factsReplaced: number;
    insightsAdded: number;
    alertsAdded: number;
    newAlerts: { text: string; score: number }[];
} {
    const existing = db.listAiMemoryFacts();
    const { factsReplaced, existingKeys } = applyFactReplacements(structured.factsReplace ?? [], existing);

    let factsAdded = 0;
    for (const raw of structured.facts) {
        const t = raw.trim();
        if (!t) continue;
        const key = normalizeAiMemoryKey(t);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        db.insertAiMemoryFact(uuidv4(), t);
        factsAdded++;
    }

    const recentInsightKeys = new Set(db.listAiMemoryInsights(120).map((i) => normalizeAiMemoryKey(i.text)));

    let insightsAdded = 0;
    for (const item of structured.insights) {
        const t = item.text.trim();
        if (!t) continue;
        const key = normalizeAiMemoryKey(t);
        if (recentInsightKeys.has(key)) continue;
        recentInsightKeys.add(key);
        db.insertAiMemoryInsight(uuidv4(), t, item.score);
        insightsAdded++;
    }

    const recentAlertKeys = new Set(db.listAiMemoryAlerts(120).map((a) => normalizeAiMemoryKey(a.text)));

    let alertsAdded = 0;
    const newAlerts: { text: string; score: number }[] = [];
    for (const item of structured.alerts) {
        const t = item.text.trim();
        if (!t) continue;
        const key = normalizeAiMemoryKey(t);
        if (recentAlertKeys.has(key)) continue;
        if (db.isAiMemoryAlertDismissed(key)) continue;
        recentAlertKeys.add(key);
        db.insertAiMemoryAlert(uuidv4(), t, item.score);
        alertsAdded++;
        newAlerts.push({ text: t, score: item.score });
    }

    return { factsAdded, factsReplaced, insightsAdded, alertsAdded, newAlerts };
}

export type { ConversationTurn };
