import type { Transaction } from '@app/shared';
import { isUserPersonaEmpty, sliceTransactionsForAnalyst } from '@app/shared';
import type { AiService, ConversationTurn, StructuredChatResult } from './aiService.js';
import type { AiSettings } from './aiService.js';
import {
    buildUnifiedChatQueryWithMemory,
    superPrivacyIncludesChatHistory,
    superPrivacyPromptShareFromSettings,
} from './unifiedAiChatMemory.js';
import {
    normalizeAnalystPrivacyMode,
    type AnalystPrivacyMode,
    usesSuperPrivacySqlPath,
} from './analystPrivacyMode.js';
import {
    evaluateSuperPrivacySufficient,
    formatSuperPrivacyFailureForUser,
    parseSuperPrivacyFlags,
} from './analystSqlHybrid.js';

export type AnalystChatPath =
    | 'super_privacy'
    | 'full_ai'
    | 'hybrid_super_then_full';

export interface UnifiedAnalystChatResult extends StructuredChatResult {
    analystPath: AnalystChatPath;
    /** True when hybrid attempted SQL first */
    superPrivacyAttempted?: boolean;
    /** When hybrid fell back: why SQL path was insufficient (for UI footnote) */
    superPrivacyFailureReason?: string;
}

export interface RunUnifiedAnalystChatParams {
    query: string;
    historyNote?: string;
    transactions: Transaction[] | undefined;
    conversationHistory?: ConversationTurn[];
    scopeTransactionIds?: string[];
    filenameScoped?: boolean;
}

function standardPersona(settings: AiSettings) {
    return settings.personaInjectionEnabled !== false &&
        settings.userContext &&
        !isUserPersonaEmpty(settings.userContext)
        ? settings.userContext
        : undefined;
}

function buildSuperPrivacyQuery(
    settings: AiSettings,
    query: string,
    historyNote?: string
): string {
    const share = superPrivacyPromptShareFromSettings(settings);
    const persona =
        share.includePersona && settings.userContext && !isUserPersonaEmpty(settings.userContext)
            ? settings.userContext
            : undefined;
    return buildUnifiedChatQueryWithMemory(
        share.includeHistoryNote ? historyNote : undefined,
        query,
        persona,
        share
    );
}

function buildStandardQuery(settings: AiSettings, query: string, historyNote?: string): string {
    return buildUnifiedChatQueryWithMemory(historyNote, query, standardPersona(settings));
}

export async function runUnifiedAnalystChat(
    aiService: AiService,
    settings: AiSettings,
    params: RunUnifiedAnalystChatParams
): Promise<UnifiedAnalystChatResult> {
    const mode: AnalystPrivacyMode = normalizeAnalystPrivacyMode(settings);
    const { query, historyNote, conversationHistory, scopeTransactionIds } = params;

    let transactions = params.transactions;
    if (!transactions || !Array.isArray(transactions)) {
        transactions = [];
    }

    if (mode === 'full_ai') {
        const maxRows = settings.analystMaxTransactionRows ?? 0;
        const sliced = sliceTransactionsForAnalyst(transactions, maxRows);
        const contextQuery = buildStandardQuery(settings, query, historyNote);
        const structured = await aiService.analyzeDataStructured(contextQuery, sliced, {
            conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : undefined,
        });
        return { ...structured, analystPath: 'full_ai' };
    }

    const share = superPrivacyPromptShareFromSettings(settings);
    const superQuery = buildSuperPrivacyQuery(settings, query, historyNote);
    const superResult = await aiService.analyzeDataSuperPrivacy(superQuery, {
        conversationHistory:
            superPrivacyIncludesChatHistory(settings) && Array.isArray(conversationHistory)
                ? conversationHistory
                : undefined,
        scopeTransactionIds,
        scopeNote: share.includeHistoryNote ? historyNote : undefined,
    });

    const flags = parseSuperPrivacyFlags(superResult.parsedRaw ?? {});
    const evaluation = evaluateSuperPrivacySufficient({
        flags,
        queries: superResult.queries ?? [],
        sqlResults: superResult.sqlResults,
        filledResponse: superResult.response,
        jsonParseFailed: superResult.jsonParseFailed,
    });

    if (mode === 'super_privacy') {
        if (!evaluation.sufficient) {
            const failureText = formatSuperPrivacyFailureForUser(evaluation.reasons);
            return {
                response: failureText,
                facts: [],
                factsReplace: [],
                insights: [],
                alerts: [],
                analystPath: 'super_privacy',
                ...(superResult.usedFallbackModel ? { usedFallbackModel: superResult.usedFallbackModel } : {}),
            };
        }
        return {
            ...stripSuperPrivacyMeta(superResult),
            analystPath: 'super_privacy',
        };
    }

    // hybrid
    if (evaluation.sufficient) {
        return {
            ...stripSuperPrivacyMeta(superResult),
            analystPath: 'super_privacy',
            superPrivacyAttempted: true,
        };
    }

    const failureReason = formatSuperPrivacyFailureForUser(evaluation.reasons);
    const maxRows = settings.analystMaxTransactionRows ?? 0;
    const sliced = sliceTransactionsForAnalyst(transactions, maxRows);
    if (sliced.length === 0 && params.filenameScoped) {
        return {
            response:
                failureReason +
                '\n\n_No transactions in scope for full analysis. Load data or widen scope._',
            facts: [],
            factsReplace: [],
            insights: [],
            alerts: [],
            analystPath: 'hybrid_super_then_full',
            superPrivacyAttempted: true,
            superPrivacyFailureReason: failureReason,
        };
    }
    if (sliced.length === 0) {
        return {
            response: failureReason + '\n\n_No transaction data available for full analysis._',
            facts: [],
            factsReplace: [],
            insights: [],
            alerts: [],
            analystPath: 'hybrid_super_then_full',
            superPrivacyAttempted: true,
            superPrivacyFailureReason: failureReason,
        };
    }

    const contextQuery = buildStandardQuery(settings, query, historyNote);
    const full = await aiService.analyzeDataStructured(contextQuery, sliced, {
        conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : undefined,
    });

    return {
        ...full,
        analystPath: 'hybrid_super_then_full',
        superPrivacyAttempted: true,
        superPrivacyFailureReason: failureReason,
    };
}

function stripSuperPrivacyMeta(
    r: Awaited<ReturnType<AiService['analyzeDataSuperPrivacy']>>
): StructuredChatResult {
    const { parsedRaw, queries, sqlResults, jsonParseFailed, ...rest } = r;
    void parsedRaw;
    void queries;
    void sqlResults;
    void jsonParseFailed;
    return rest;
}

/** @internal re-export for routes */
export { usesSuperPrivacySqlPath, normalizeAnalystPrivacyMode };
