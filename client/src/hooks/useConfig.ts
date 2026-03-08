import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useEnvConfig() {
    return useQuery({
        queryKey: ['env-config'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: Record<string, string> }>('/config/env');
            return data.data;
        },
    });
}

export function useUpdateEnvConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (updates: Record<string, string>) => {
            const { data } = await api.post<{ success: boolean }>('/config/env', updates);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['env-config'] });
        },
    });
}

export function useRestartServer() {
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.post<{ success: boolean }>('/config/restart');
            return data;
        },
    });
}
