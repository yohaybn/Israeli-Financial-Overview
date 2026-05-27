import {
    mapSqlResultToChartRows,
    sanitizeSqlAnalyticCard,
    validateChartColumnsAgainstResult,
    type SqlAnalyticCardDefinition,
    type SqlQueryResultShape,
} from '@app/shared';
import type { AnalystQueryResult } from './analystSqlExecutor.js';
import { executeAnalystQueries } from './analystSqlExecutor.js';
import type { DbService } from './dbService.js';

export type SqlAnalyticCardRunResult = {
    card: SqlAnalyticCardDefinition;
    queryResults: Record<string, SqlQueryResultShape>;
    chartRows: ReturnType<typeof mapSqlResultToChartRows>['rows'];
    chartError?: string;
};

export function runSqlAnalyticCard(
    dbService: DbService,
    cardInput: unknown
): { ok: true; result: SqlAnalyticCardRunResult } | { ok: false; error: string } {
    const sanitized = sanitizeSqlAnalyticCard(cardInput);
    if (!sanitized.ok) {
        return { ok: false, error: sanitized.error };
    }
    const card = sanitized.value;
    const db = dbService.getDatabase();
    let queryResults: Record<string, AnalystQueryResult>;
    try {
        queryResults = executeAnalystQueries(
            db,
            card.queries.map((q) => ({ key: q.key, sql: q.sql }))
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
    }

    const shaped: Record<string, SqlQueryResultShape> = {};
    for (const [key, res] of Object.entries(queryResults)) {
        shaped[key] = res;
    }

    const dataResult = shaped[card.dataQueryKey];
    if (!dataResult) {
        return { ok: false, error: `Query "${card.dataQueryKey}" did not run` };
    }
    const colCheck = validateChartColumnsAgainstResult(
        dataResult,
        card.labelColumn,
        card.valueColumns
    );
    if (!colCheck.ok) {
        return { ok: false, error: colCheck.error };
    }
    const mapped = mapSqlResultToChartRows(dataResult, card.labelColumn, card.valueColumns);
    return {
        ok: true,
        result: {
            card,
            queryResults: shaped,
            chartRows: mapped.rows,
            chartError: mapped.error,
        },
    };
}
