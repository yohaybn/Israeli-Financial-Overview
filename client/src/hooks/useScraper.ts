import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ScrapeResult, ImporterConfig } from '@app/shared';

export function useScrapeResults() {
    return useQuery({
        queryKey: ['scrapeResults'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: Array<{ filename: string; transactionCount: number; accountCount: number; createdAt: string }> }>('/results');
            return data.data;
        },
    });
}

export function useDeleteScrapeResult() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (filename: string) => {
            const encoded = encodeURIComponent(filename);
            await api.delete(`/results/${encoded}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
        },
    });
}

export function useRenameResult() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ oldFilename, newFilename }: { oldFilename: string; newFilename: string }) => {
            const { data } = await api.post<{ success: boolean }>('/results/rename', { oldFilename, newFilename });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
        },
    });
}

export function useScrapeResult(filename: string | null) {
    return useQuery({
        queryKey: ['scrapeResult', filename],
        queryFn: async () => {
            if (!filename) return null;
            const encoded = encodeURIComponent(filename);
            const { data } = await api.get<{ success: boolean; data: ScrapeResult }>(`/results/${encoded}`);
            return data.data;
        },
        enabled: !!filename,
    });
}

export function useMultipleScrapeResults(filenames: string[]) {
    return useQuery({
        queryKey: ['scrapeResults', filenames],
        queryFn: async () => {
            if (!filenames || filenames.length === 0) return [];
            const results = await Promise.all(
                filenames.map(async (filename) => {
                    const encoded = encodeURIComponent(filename);
                    const { data } = await api.get<{ success: boolean; data: ScrapeResult }>(`/results/${encoded}`);
                    return data.data;
                })
            );
            return results;
        },
        enabled: filenames.length > 0,
    });
}

export function useRunScrape() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (config: ImporterConfig) => {
            const { data } = await api.post<{ success: boolean; data: ScrapeResult; filename: string }>('/scrape', config);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
        },
    });
}

export function useUpdateCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ filename, transactionId, category }: { filename: string; transactionId: string; category: string }) => {
            const encodedFile = encodeURIComponent(filename);
            const encodedTxn = encodeURIComponent(transactionId);
            const { data } = await api.put<{ success: boolean }>(`/results/${encodedFile}/transactions/${encodedTxn}/category`, { category });
            return data;
        },
        onSuccess: (_, variables) => {
            // Update the cached result immediately
            queryClient.setQueryData(['scrapeResult', variables.filename], (oldData: ScrapeResult | undefined) => {
                if (!oldData) return oldData;
                return {
                    ...oldData,
                    transactions: oldData.transactions?.map(t =>
                        t.id === variables.transactionId ? { ...t, category: variables.category } : t
                    ) || []
                };
            });
            // Also update the multiple results cache if it exists
            queryClient.setQueryData(['scrapeResults', [variables.filename]], (oldData: ScrapeResult[] | undefined) => {
                if (!oldData) return oldData;
                return oldData.map(result => ({
                    ...result,
                    transactions: result.transactions?.map(t =>
                        t.id === variables.transactionId ? { ...t, category: variables.category } : t
                    ) || []
                }));
            });
        },
    });
}

export function useToggleIgnore() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ transactionId, isIgnored }: { transactionId: string; isIgnored: boolean }) => {
            const encodedTxn = encodeURIComponent(transactionId);
            const { data } = await api.patch<{ success: boolean }>(`/transactions/${encodedTxn}/ignore`, { isIgnored });
            return data;
        },
        onSuccess: () => {
            // Update the unified data cache
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
        },
    });
}

export function useUpdateTransactionCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ transactionId, category }: { transactionId: string; category: string }) => {
            const encodedTxn = encodeURIComponent(transactionId);
            const { data } = await api.put<{ success: boolean }>(`/transactions/${encodedTxn}/category`, { category });
            return data;
        },
        onSuccess: () => {
            // Update the unified data cache
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
        },
    });
}

export function useUpdateTransactionType() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ transactionId, type }: { transactionId: string; type: string }) => {
            const encodedTxn = encodeURIComponent(transactionId);
            const { data } = await api.patch<{ success: boolean }>(`/transactions/${encodedTxn}/type`, { type });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
        },
    });
}

export function useUpdateTransactionMemo() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ transactionId, memo }: { transactionId: string; memo: string }) => {
            const encodedTxn = encodeURIComponent(transactionId);
            const { data } = await api.patch<{ success: boolean }>(`/transactions/${encodedTxn}/memo`, { memo });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
        },
    });
}

export function useUpdateTransactionSubscription() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ transactionId, isSubscription, interval, excludeFromSubscriptions }: { transactionId: string; isSubscription: boolean; interval: string | null; excludeFromSubscriptions?: boolean }) => {
            const encodedTxn = encodeURIComponent(transactionId);
            const { data } = await api.patch<{ success: boolean }>(`/transactions/${encodedTxn}/subscription`, { isSubscription, interval, excludeFromSubscriptions });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
        },
    });
}

export function useUnifiedAIChat() {
    return useMutation({
        mutationFn: async ({ query, scope, filename, historyNote }: { query: string; scope?: string; filename?: string; historyNote?: string }) => {
            const { data } = await api.post<{ success: boolean; data: string }>('/ai/chat/unified', { query, scope, filename, historyNote });
            return data.data;
        },
    });
}

export function useFilters() {
    return useQuery({
        queryKey: ['filters'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: any[] }>('/filters');
            return data.data;
        },
    });
}

export function useAddFilter() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (pattern: string) => {
            const { data } = await api.post<{ success: boolean; data: any }>('/filters', { pattern });
            return data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['filters'] });
        },
    });
}

export function useRemoveFilter() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/filters/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['filters'] });
        },
    });
}

export function useToggleFilter() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.patch(`/filters/${id}/toggle`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['filters'] });
        },
    });
}

export function useUploadFile() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post<{ success: boolean; filename: string }>('/results/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
        },
    });
}

export function useImportFiles() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ files, accountNumberOverride, useAi }: { files: File[]; accountNumberOverride?: string; useAi?: boolean }) => {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });
            if (accountNumberOverride) {
                formData.append('accountNumberOverride', accountNumberOverride);
            }
            if (useAi) {
                formData.append('useAi', String(useAi));
            }
            const { data } = await api.post<{ success: boolean; results: any[]; allSuccessful: boolean }>('/results/import', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
        },
    });
}

export function useAICategorize() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (filename: string) => {
            const encoded = encodeURIComponent(filename);
            const { data } = await api.post<{ success: boolean; data: any[]; categorizationError?: string }>(`/ai/categorize/${encoded}`);
            return data;
        },
        onSuccess: (_data, filename) => {
            queryClient.invalidateQueries({ queryKey: ['scrapeResult', filename] });
        },
    });
}

export function useRecategorizeAll() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (force: boolean = false) => {
            const { data } = await api.post<{ success: boolean; count: number; error?: string }>('/ai/categorize/all', { force });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
        },
    });
}

export function useAIChat() {
    return useMutation({
        mutationFn: async ({ query, filename }: { query: string; filename: string }) => {
            const { data } = await api.post<{ success: boolean; data: string }>('/ai/chat', { query, filename });
            return data.data;
        },
    });
}

export function useAISettings() {
    return useQuery({
        queryKey: ['aiSettings'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: any }>('/ai/settings');
            return data.data;
        },
    });
}

export function useUpdateAISettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (settings: any) => {
            const { data } = await api.post<{ success: boolean; data: any }>('/ai/settings', settings);
            return data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['aiSettings'] });
        },
    });
}

export function useAIModels() {
    return useQuery({
        queryKey: ['aiModels'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: string[] }>('/ai/models');
            return data.data;
        },
    });
}

// Google Auth Hooks
export function useGoogleAuthUrl() {
    return useQuery({
        queryKey: ['googleAuthUrl'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: string }>('/auth/google/url');
            return data.data;
        },
        enabled: false, // Don't fetch automatically, we'll trigger it on button click or similar
    });
}

export function useGoogleAuthStatus() {
    return useQuery({
        queryKey: ['googleAuthStatus'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: { authenticated: boolean } }>('/auth/google/status');
            return data.data;
        },
    });
}

export function useGoogleConfigStatus() {
    return useQuery({
        queryKey: ['googleConfigStatus'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: { configured: boolean } }>('/auth/google/config-status');
            return data.data;
        },
    });
}

export function useGoogleSettings() {
    return useQuery({
        queryKey: ['googleSettings'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: any }>('/auth/google/settings');
            return data.data;
        },
    });
}

export function useUpdateGoogleSettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (settings: any) => {
            await api.post('/auth/google/settings', settings);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['googleSettings'] });
            queryClient.invalidateQueries({ queryKey: ['googleConfigStatus'] });
        },
    });
}

export function useGoogleLogout() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            await api.post('/auth/google/logout');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['googleAuthStatus'] });
        },
    });
}

// Google Sheets Hooks
export function useListSpreadsheets() {
    return useQuery({
        queryKey: ['spreadsheets'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: any[] }>('/sheets/list');
            return data.data;
        },
    });
}

export function useCreateSpreadsheet() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (name: string) => {
            const { data } = await api.post<{ success: boolean; data: any }>('/sheets/create', { name });
            return data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['spreadsheets'] });
        },
    });
}

export function useSyncToSheets() {
    return useMutation({
        mutationFn: async ({ filename, spreadsheetId }: { filename: string; spreadsheetId: string }) => {
            await api.post('/sheets/sync', { filename, spreadsheetId });
        },
    });
}

// Scheduler Hooks
export function useSchedulerConfig() {
    return useQuery({
        queryKey: ['schedulerConfig'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: any }>('/scheduler/config');
            return data.data;
        },
    });
}

export function useUpdateSchedulerConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (config: any) => {
            const { data } = await api.post<{ success: boolean; data: any }>('/scheduler/config', config);
            return data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schedulerConfig'] });
        },
    });
}

export function useRunSchedulerNow() {
    return useMutation({
        mutationFn: async () => {
            await api.post('/scheduler/run-now');
        },
    });
}

// Logs Hook
export function useLogs(type: 'server' | 'client' | 'ai' = 'server', lines: number = 200, options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: ['logs', type, lines],
        queryFn: async () => {
            const { data } = await api.get<{ type: string; lines: string; totalLines: number }>(`/logs?type=${type}&lines=${lines}`);
            return data;
        },
        refetchInterval: 5000, // Refresh every 5 seconds
        ...options
    });
}

export function useLogLevel() {
    return useQuery({
        queryKey: ['logLevel'],
        queryFn: async () => {
            const { data } = await api.get<{ level: string }>('/logs/level');
            return data.level;
        },
    });
}

export function useUpdateLogLevel() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (level: string) => {
            await api.post('/logs/level', { level });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logLevel'] });
        },
    });
}

export function useClearLogs() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (type: 'server' | 'client') => {
            const { data } = await api.post<{ success: boolean; type: string }>(`/logs/clear?type=${type}`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs'] });
        },
    });
}
export function useMergeResults() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ filenames, outputName }: { filenames: string[]; outputName: string }) => {
            const { data } = await api.post<{ success: boolean; filename: string }>('/results/merge', { filenames, outputName, deleteOriginals: true });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
        },
    });
}

export function useReloadDatabase() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.post<{ success: boolean; message: string }>('/results/reload');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['results/all'] });
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
        },
    });
}

export function useResetToDefaults() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.post<{ success: boolean; message: string }>('/results/reset');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
            queryClient.invalidateQueries({ queryKey: ['filters'] });
            queryClient.invalidateQueries({ queryKey: ['results/all'] });
        },
    });
}

export function useLocalBackups() {
    return useQuery({
        queryKey: ['backups', 'local'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: Array<{ filename: string; size: number; createdAt: string }> }>('/backups/local');
            return data.data;
        },
    });
}

export function useDriveBackups(enabled = false) {
    return useQuery({
        queryKey: ['backups', 'drive'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: Array<{ id: string; name: string; createdTime: string; size?: string }> }>('/backups/drive');
            return data.data;
        },
        enabled
    });
}

export function useCreateBackup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (destination: 'local' | 'google-drive') => {
            const { data } = await api.post<{ success: boolean; data: any }>('/backups/create', { destination });
            return data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['backups', 'local'] });
            queryClient.invalidateQueries({ queryKey: ['backups', 'drive'] });
        }
    });
}

export function useRestoreLocalBackup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (filename: string) => {
            const { data } = await api.post<{ success: boolean; message: string; dbRestored?: boolean }>('/backups/restore/local', { filename });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['results/all'] });
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
            queryClient.invalidateQueries({ queryKey: ['backups', 'local'] });
            queryClient.invalidateQueries({ queryKey: ['filters'] });
        }
    });
}

export function useRestoreDriveBackup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (fileId: string) => {
            const { data } = await api.post<{ success: boolean; message: string; dbRestored?: boolean }>('/backups/restore/drive', { fileId });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['results/all'] });
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
            queryClient.invalidateQueries({ queryKey: ['backups', 'drive'] });
            queryClient.invalidateQueries({ queryKey: ['filters'] });
        }
    });
}

export function useRestoreUploadedBackup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post<{ success: boolean; message: string; dbRestored?: boolean }>('/backups/restore/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['results/all'] });
            queryClient.invalidateQueries({ queryKey: ['scrapeResults'] });
            queryClient.invalidateQueries({ queryKey: ['unified-data'] });
            queryClient.invalidateQueries({ queryKey: ['filters'] });
        }
    });
}

export function useDownloadLocalBackup() {
    return useMutation({
        mutationFn: async (filename: string) => {
            const encoded = encodeURIComponent(filename);
            const response = await api.get(`/backups/local/${encoded}/download`, {
                responseType: 'blob'
            });

            const blob = response.data as Blob;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        }
    });
}
