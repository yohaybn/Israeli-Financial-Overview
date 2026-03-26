import { v4 as uuidv4 } from 'uuid';
import { DbService } from './dbService.js';
import type { StructuredChatResult } from './aiService.js';
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
- Setup is a bit involved; users can skip it and configure later under Configuration (Sheets tab, Maintenance/backup, Environment).
- In Google Cloud Console: create a project; enable Google Drive API and Google Sheets API (APIs & Services → Library).
- OAuth consent screen: External (or appropriate type), fill app name and contact emails; you can advance through Scopes and Test users with defaults for personal use.
- Credentials: Create OAuth client ID → Web application. Under Authorized redirect URIs add the exact callback URL the app uses: default is http://127.0.0.1:<PORT>/api/auth/google/callback where PORT matches the server (often 3000). If the UI is opened via http://localhost:<PORT>, add that same path with localhost too — redirect URIs must match exactly what appears in Configuration → Environment (GOOGLE_REDIRECT_URI).
- Copy Client ID and Client Secret into the app (Configuration → Environment or runtime-settings / google_settings). Then sign in via the in-app Google / Sheets flows.
- If Google shows "Google hasn't verified this app", that is normal for a personal Cloud project: choose Advanced, then proceed to the app (unsafe).
- DRIVE_FOLDER_ID is optional: ID from a Drive folder URL (after /folders/) for default upload location; can be set later.
`.trim();

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

${STATIC_APP_DOCS_FOR_AI}

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
    newAlerts: { text: string; score: number }[];
} {
    const existing = db.listAiMemoryFacts();
    const existingKeys = new Set(existing.map((f) => normalizeAiMemoryKey(f.text)));

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

    return { factsAdded, insightsAdded, alertsAdded, newAlerts };
}

export type { ConversationTurn };
