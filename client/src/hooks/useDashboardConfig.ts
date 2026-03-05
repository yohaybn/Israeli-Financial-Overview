import { useState, useEffect } from 'react';
import { DashboardConfig } from '@app/shared';
import * as Shared from '@app/shared';

const DEFAULT_DASHBOARD_CONFIG = Shared.DEFAULT_DASHBOARD_CONFIG;

const CONFIG_KEY = 'dashboard_config';

export function useDashboardConfig() {
    const [config, setConfigState] = useState<DashboardConfig>(() => {
        try {
            const stored = localStorage.getItem(CONFIG_KEY);
            return stored ? { ...DEFAULT_DASHBOARD_CONFIG, ...JSON.parse(stored) } : DEFAULT_DASHBOARD_CONFIG;
        } catch (e) {
            console.error('Failed to parse dashboard config', e);
            return DEFAULT_DASHBOARD_CONFIG;
        }
    });

    const updateConfig = (newConfig: Partial<DashboardConfig>) => {
        setConfigState(prev => {
            const updated = { ...prev, ...newConfig };
            localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
            // Dispatch a custom event to sync across components on the same page
            window.dispatchEvent(new CustomEvent('dashboard-config-updated', { detail: updated }));
            return updated;
        });
    };

    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === CONFIG_KEY && e.newValue) {
                try {
                    setConfigState({ ...DEFAULT_DASHBOARD_CONFIG, ...JSON.parse(e.newValue) });
                } catch (err) { }
            }
        };

        const handleCustomEvent = (e: Event) => {
            const customEvent = e as CustomEvent<DashboardConfig>;
            setConfigState(customEvent.detail);
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('dashboard-config-updated', handleCustomEvent as EventListener);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('dashboard-config-updated', handleCustomEvent as EventListener);
        };
    }, []);

    return { config, updateConfig };
}
