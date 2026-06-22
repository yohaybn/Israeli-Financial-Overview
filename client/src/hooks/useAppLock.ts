import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type AppLockStatus = {
    lockConfigured: boolean;
    unlocked: boolean;
    restricted: boolean;
    fullBlockerEnabled?: boolean;
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
            const { data } = await api.post('/app-lock/unlock', { password });
            return data;
        },
        onSuccess: (data: any) => {
            if (data?.token) {
                localStorage.setItem('app_session_token', data.token);
            }
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
            localStorage.removeItem('app_session_token');
            queryClient.invalidateQueries({ queryKey: ['appLockStatus'] });
            window.dispatchEvent(new CustomEvent('app-session-expired'));
        }
    });
}

export function useSetupAppLock() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (password: string) => {
            const { data } = await api.post('/app-lock/setup', { password });
            return data;
        },
        onSuccess: (data: any) => {
            if (data?.token) {
                localStorage.setItem('app_session_token', data.token);
            }
            queryClient.invalidateQueries({ queryKey: ['appLockStatus'] });
        }
    });
}
