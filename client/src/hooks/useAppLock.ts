import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type AppLockStatus = {
    lockConfigured: boolean;
    unlocked: boolean;
    restricted: boolean;
};

export function useAppLockStatus() {
    return useQuery({
        queryKey: ['appLockStatus'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: AppLockStatus }>('/app-lock/status');
            return data.data;
        },
        refetchInterval: 20_000
    });
}

export function useUnlockApp() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (password: string) => {
            await api.post('/app-lock/unlock', { password });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['appLockStatus'] });
        }
    });
}

export function useLockApp() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            await api.post('/app-lock/lock');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['appLockStatus'] });
        }
    });
}

export function useSetupAppLock() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (password: string) => {
            await api.post('/app-lock/setup', { password });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['appLockStatus'] });
        }
    });
}
