import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { isDemoMode } from '../demo/isDemo';

/**
 * Polls the backend health endpoint. Used to show a top-bar warning when the API is unreachable.
 */
export function useServerHealth() {
    return useQuery({
        queryKey: ['server-health'],
        queryFn: async () => {
            const { data } = await api.get<{ status: string }>('/health');
            return data;
        },
        enabled: !isDemoMode(),
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
        retry: 1,
        retryDelay: 1500,
    });
}
