import type { AnalystQueryResult } from './analystSqlExecutor.js';

const FAILURE_SNIPPETS = [
    'No SQL queries were returned',
    'Could not run queries locally',
] as const;

export interface SuperPrivacyParsedFlags {
    sqlNotPossible?: boolean;
    requiresFullAnalyst?: boolean;
    sqlNotPossibleReason?: string;
    requiresFullAnalystReason?: string;
}

export function parseSuperPrivacyFlags(parsed: Record<string, unknown>): SuperPrivacyParsedFlags {
    const reason =
        (typeof parsed.sqlNotPossibleReason === 'string' ? parsed.sqlNotPossibleReason.trim() : '') ||
        (typeof parsed.requiresFullAnalystReason === 'string' ? parsed.requiresFullAnalystReason.trim() : '');
    return {
        sqlNotPossible: parsed.sqlNotPossible === true,
        requiresFullAnalyst: parsed.requiresFullAnalyst === true,
        sqlNotPossibleReason: reason || undefined,
        requiresFullAnalystReason: reason || undefined,
    };
}

export function evaluateSuperPrivacySufficient(params: {
    flags: SuperPrivacyParsedFlags;
    queries: { key: string; sql: string }[];
    sqlResults?: Record<string, AnalystQueryResult>;
    filledResponse: string;
    jsonParseFailed?: boolean;
}): { sufficient: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (params.jsonParseFailed) {
        reasons.push('model_response_not_valid_json');
    }
    if (params.flags.sqlNotPossible) {
        reasons.push(
            params.flags.sqlNotPossibleReason || 'sql_not_possible'
        );
    }
    if (params.flags.requiresFullAnalyst) {
        reasons.push(
            params.flags.requiresFullAnalystReason || 'requires_full_analyst'
        );
    }

    const text = params.filledResponse.trim();
    if (!text) {
        reasons.push('empty_response');
    }

    for (const snippet of FAILURE_SNIPPETS) {
        if (text.includes(snippet)) reasons.push(snippet);
    }

    if (/\{\{q:[a-zA-Z0-9_]+/.test(text)) {
        reasons.push('unresolved_placeholders');
    }
    if (/^\s*\|.+\|\s*$/m.test(text) && /\|[\s:]*-{2,}/.test(text)) {
        reasons.push('pipe_tables_not_supported_in_chat');
    }
    if (/\[missing query:/i.test(text) || /\[error:/i.test(text)) {
        reasons.push('template_fill_errors');
    }

    if (params.queries.length === 0 && !params.flags.sqlNotPossible && !params.flags.requiresFullAnalyst) {
        reasons.push('no_queries_generated');
    }

    if (params.sqlResults && params.queries.length > 0) {
        const errors = params.queries.filter((q) => params.sqlResults![q.key]?.error);
        if (errors.length === params.queries.length) {
            reasons.push('all_sql_queries_failed');
        }
    }

    return { sufficient: reasons.length === 0, reasons };
}

export function formatSuperPrivacyFailureForUser(reasons: string[]): string {
    const primary = reasons.find((r) => !r.includes('_') && r.length > 12) ?? reasons[0];
    if (primary && !primary.includes('_') && primary.length > 8) {
        return primary;
    }
    const code = reasons[0] ?? 'sql_not_possible';
    const labels: Record<string, string> = {
        sql_not_possible: 'This question cannot be answered with a read-only SQL query on your local database.',
        requires_full_analyst: 'This question needs full transaction context, not aggregates from SQL alone.',
        no_queries_generated: 'No SQL query could be generated for this question.',
        model_response_not_valid_json: 'The privacy-first SQL step did not return a valid plan.',
        empty_response: 'The privacy-first SQL step returned an empty answer.',
        unresolved_placeholders: 'Local SQL did not produce all values needed for the answer.',
        template_fill_errors: 'Local SQL results could not fill the answer template.',
        all_sql_queries_failed: 'All generated SQL queries failed to run.',
    };
    return labels[code] ?? 'Local SQL could not answer this question.';
}
