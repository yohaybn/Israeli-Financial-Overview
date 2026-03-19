import { useCallback, useEffect, useState } from 'react';
import { DashboardConfig } from '@app/shared';
import * as Shared from '@app/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const DEFAULT_DASHBOARD_CONFIG = Shared.DEFAULT_DASHBOARD_CONFIG;
const CONFIG_KEY = 'dashboard_config'; // Still used for one-time migration

export function useDashboardConfig() {
    const queryClient = useQueryClient();
    const [isMigrating, setIsMigrating] = useState(false);

    // Fetch config from server
    const { data: serverConfig, isLoading } = useQuery({
        queryKey: ['dashboardConfig'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: DashboardConfig }>('/config/dashboard');
            return data.data;
        },
    });

    const updateConfigMutation = useMutation({
        mutationFn: async (newConfig: Partial<DashboardConfig>) => {
            const { data } = await api.post<{ success: boolean; data: DashboardConfig }>('/config/dashboard', newConfig);
            return data.data;
        },
        onSuccess: (updatedConfig) => {
            queryClient.setQueryData(['dashboardConfig'], updatedConfig);
            window.dispatchEvent(new CustomEvent('dashboard-config-updated', { detail: updatedConfig }));
        },
    });

    // One-time migration from localStorage to server
    useEffect(() => {
        const stored = localStorage.getItem(CONFIG_KEY);
        if (stored && serverConfig && !isMigrating) {
            try {
                const parsed = JSON.parse(stored);
                setIsMigrating(true);
                // POST the local config to server
                api.post('/config/dashboard', parsed).then(() => {
                    localStorage.removeItem(CONFIG_KEY);
                    queryClient.invalidateQueries({ queryKey: ['dashboardConfig'] });
                }).finally(() => {
                    setIsMigrating(false);
                });
            } catch (e) {
                console.error('Failed to migrate dashboard config', e);
                localStorage.removeItem(CONFIG_KEY); // Corrupted, just remove it
            }
        }
    }, [serverConfig, isMigrating, queryClient]);

    const updateConfig = useCallback((newConfig: Partial<DashboardConfig>) => {
        updateConfigMutation.mutate(newConfig);
    }, [updateConfigMutation]);

    return { 
        config: serverConfig || DEFAULT_DASHBOARD_CONFIG, 
        updateConfig,
        isLoading: isLoading || isMigrating
    };
}
