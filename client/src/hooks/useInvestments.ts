import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export const investmentsKeys = {
    list: ['investments', 'list'] as const,
    summary: ['investments', 'summary'] as const,
    history: (from?: string, to?: string) => ['investments', 'history', from ?? '', to ?? ''] as const,
    valueHistory: (from?: string, to?: string) => ['investments', 'valueHistory', from ?? '', to ?? ''] as const,
    snapshotSettings: ['investments', 'snapshotSettings'] as const,
    symbolSearch: (q: string) => ['investments', 'symbolSearch', q] as const,
    appSettings: ['investments', 'appSettings'] as const,
    priceHistory: (id: string) => ['investments', 'priceHistory', id] as const,
};

export type EodhdQuoteModeDto = 'realtime' | 'eod' | 'realtime_then_eod' | 'eod_then_realtime';

export type InvestmentAppSettingsDto = {
    featureEnabled: boolean;
    eodhdApiTokenConfigured: boolean;
    eodhdApiTokenFromEnv: boolean;
    marketDataProvider: 'yahoo' | 'eodhd_then_yahoo';
    eodhdQuoteMode: EodhdQuoteModeDto;
    /** When true, portfolio value chart uses daily USD→ILS from Frankfurter; when false, today’s spot for all dates. */
    portfolioHistoricUsdIls: boolean;
};

export function useInvestmentAppSettings(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: investmentsKeys.appSettings,
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data?: InvestmentAppSettingsDto; error?: string }>(
                '/investments/app-settings'
            );
            if (!data.success || !data.data) throw new Error(data.error || 'load_failed');
            return data.data;
        },
        staleTime: 60_000,
        enabled: options?.enabled !== false,
    });
}

export function useUpdateInvestmentAppSettings() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (patch: {
            featureEnabled?: boolean;
            eodhdApiToken?: string;
            clearEodhdApiToken?: boolean;
            eodhdQuoteMode?: EodhdQuoteModeDto;
            portfolioHistoricUsdIls?: boolean;
        }) => {
            const body: Record<string, unknown> = {};
            if (patch.featureEnabled !== undefined) body.feature_enabled = patch.featureEnabled;
            if (patch.clearEodhdApiToken) body.clear_eodhd_api_token = true;
            else if (patch.eodhdApiToken !== undefined && patch.eodhdApiToken.trim() !== '') {
                body.eodhd_api_token = patch.eodhdApiToken.trim();
            }
            if (patch.eodhdQuoteMode !== undefined) body.eodhd_quote_mode = patch.eodhdQuoteMode;
            if (patch.portfolioHistoricUsdIls !== undefined) body.portfolio_historic_usd_ils = patch.portfolioHistoricUsdIls;
            const { data } = await api.patch<{
                success: boolean;
                data?: InvestmentAppSettingsDto;
                error?: string;
            }>('/investments/app-settings', body);
            if (!data.success || !data.data) throw new Error(data.error || 'save_failed');
            return data.data;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: investmentsKeys.appSettings });
            void qc.invalidateQueries({ queryKey: ['investments'] });
        },
    });
}

export type InvestmentRow = {
    id: string;
    userId: string;
    symbol: string;
    /** Optional display label (does not replace the ticker). */
    nickname?: string | null;
    quantity: number;
    purchasePricePerUnit: number;
    currency: string;
    trackFromDate: string;
    sourceTransactionId?: string | null;
    useTelAvivListing: boolean;
    /** ILS only: purchase price per unit is in agorot (1/100 ₪). */
    valueInAgorot?: boolean;
    createdAt: string;
    updatedAt: string;
};

export type InvestmentPriceHistoryPoint = {
    date: string;
    price: number;
    source: 'purchase' | 'eod';
};

export type InvestmentPriceHistoryDto = {
    points: InvestmentPriceHistoryPoint[];
    resolvedSymbol: string;
    currency: string;
};

export type LivePositionRow = {
    investmentId: string;
    symbol: string;
    nickname?: string | null;
    quantity: number;
    purchasePricePerUnit: number;
    valueInAgorot?: boolean;
    currency: string;
    trackFromDate: string;
    currentPrice: number | null;
    costBasisNative: number;
    marketValueNative: number | null;
    pnlNative: number | null;
    costBasisIls: number | null;
    marketValueIls: number | null;
    pnlIls: number | null;
    pnlPctOfCost?: number | null;
    quoteError?: string;
};

export type PortfolioSummary = {
    displayCurrency: string;
    usdIlsRate: number | null;
    positions: LivePositionRow[];
    totalCostBasisIls: number | null;
    totalMarketValueIls: number | null;
    totalPnlIls: number | null;
    totalPnlPctOfCost?: number | null;
    partialQuotes: boolean;
};

export type PortfolioHistoryPoint = {
    id: string;
    snapshotDate: string;
    totalValue: number;
    displayCurrency: string;
};

export type PortfolioValueHistoryPointDto = {
    date: string;
    totalValueIls: number;
    changePct: number | null;
};

export type PortfolioValueHistoryDto = {
    points: PortfolioValueHistoryPointDto[];
    partial: boolean;
    fxMode: 'historic' | 'spot';
};

export type SnapshotSettings = {
    userId: string;
    runTime: string;
    timezone: string;
    enabled: boolean;
    updatedAt: string;
};

export type InvestmentSymbolSearchHit = {
    symbol: string;
    name: string;
    exchange?: string;
    quoteType?: string;
};

/** @deprecated Use {@link InvestmentSymbolSearchHit}. */
export type YahooSymbolSearchHit = InvestmentSymbolSearchHit;

/** Debounced symbol search (`GET /investments/symbol-search?q=`). */
export function useInvestmentSymbolSearch(query: string) {
    const q = query.trim();
    return useQuery({
        queryKey: investmentsKeys.symbolSearch(q),
        queryFn: async () => {
            const params = new URLSearchParams({ q });
            const { data } = await api.get<{
                success: boolean;
                data?: { query: string; hits: InvestmentSymbolSearchHit[] };
                error?: string;
            }>(`/investments/symbol-search?${params.toString()}`);
            if (!data.success || !data.data) throw new Error(data.error || 'search_failed');
            return data.data.hits;
        },
        enabled: q.length >= 1 && q.length <= 64,
        staleTime: 60_000,
    });
}

export function useInvestmentPriceHistory(investmentId: string | null, options?: { enabled?: boolean }) {
    const enabled = Boolean(investmentId) && (options?.enabled !== false);
    return useQuery({
        queryKey: investmentsKeys.priceHistory(investmentId ?? ''),
        queryFn: async () => {
            if (!investmentId) throw new Error('no_id');
            const { data } = await api.get<{
                success: boolean;
                data?: InvestmentPriceHistoryDto;
                error?: string;
                detail?: string;
            }>(`/investments/${investmentId}/price-history`, { validateStatus: () => true });
            if (!data.success || !data.data) {
                throw new Error(data.error || data.detail || 'load_failed');
            }
            return data.data;
        },
        enabled,
        staleTime: 5 * 60_000,
    });
}

export function useInvestmentsList() {
    return useQuery({
        queryKey: investmentsKeys.list,
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: InvestmentRow[] }>('/investments');
            if (!data.success) throw new Error('load_failed');
            return data.data;
        },
    });
}

export function usePortfolioSummary() {
    return useQuery({
        queryKey: investmentsKeys.summary,
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: PortfolioSummary }>('/investments/summary');
            if (!data.success) throw new Error('load_failed');
            return data.data;
        },
        staleTime: 45_000,
    });
}

export function usePortfolioHistory(from?: string, to?: string) {
    return useQuery({
        queryKey: investmentsKeys.valueHistory(from, to),
        queryFn: async () => {
            const params = new URLSearchParams();
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            const q = params.toString();
            const { data } = await api.get<{
                success: boolean;
                data?: PortfolioValueHistoryDto;
                error?: string;
            }>(`/investments/value-history${q ? `?${q}` : ''}`, { validateStatus: () => true });
            if (!data.success || !data.data) {
                throw new Error(data.error || 'load_failed');
            }
            return data.data;
        },
        staleTime: 5 * 60_000,
    });
}

export function useClearPortfolioSnapshotHistory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.delete<{ success: boolean; data?: { deleted: number }; error?: string }>(
                '/investments/history'
            );
            if (!data.success) throw new Error(data.error || 'delete_failed');
            return data.data?.deleted ?? 0;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['investments'] });
        },
    });
}

export function useSnapshotSettings(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: investmentsKeys.snapshotSettings,
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: SnapshotSettings }>('/investments/snapshot-settings');
            if (!data.success) throw new Error('load_failed');
            return data.data;
        },
        enabled: options?.enabled !== false,
    });
}

export function useCreateInvestment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (body: {
            symbol: string;
            quantity: number;
            purchase_price_per_unit: number;
            currency: string;
            track_from_date: string;
            use_tel_aviv_listing?: boolean;
            value_in_agorot?: boolean;
            nickname?: string | null;
        }) => {
            const { data } = await api.post<{ success: boolean; data: InvestmentRow }>('/investments', body);
            if (!data.success) throw new Error('save_failed');
            return data.data;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['investments'] });
        },
    });
}

export function useUpdateInvestment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { id: string; patch: Record<string, unknown> }) => {
            const { data } = await api.patch<{ success: boolean; data: InvestmentRow }>(`/investments/${args.id}`, args.patch);
            if (!data.success) throw new Error('save_failed');
            return data.data;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['investments'] });
        },
    });
}

export function useDeleteInvestment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.delete<{ success: boolean }>(`/investments/${id}`);
            if (!data.success) throw new Error('delete_failed');
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['investments'] });
        },
    });
}

export function useUpdateSnapshotSettings() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (body: { run_time?: string; timezone?: string; enabled?: boolean }) => {
            const { data } = await api.patch<{ success: boolean; data: SnapshotSettings }>(
                '/investments/snapshot-settings',
                body
            );
            if (!data.success) throw new Error('save_failed');
            return data.data;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: investmentsKeys.snapshotSettings });
        },
    });
}

export function useSavePortfolioSnapshot() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (opts?: { snapshot_date?: string }) => {
            const body = opts?.snapshot_date ? { snapshot_date: opts.snapshot_date } : {};
            const { data } = await api.post<{ success: boolean; data?: { snapshotDate: string }; error?: string }>(
                '/investments/snapshot',
                body
            );
            if (!data.success) throw new Error(data.error || 'snapshot_failed');
            return data.data;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['investments'] });
        },
    });
}
