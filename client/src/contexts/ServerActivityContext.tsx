import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../lib/api';
import { isDemoMode } from '../demo/isDemo';

export type ServerActivityState = {
  aiActive: boolean;
  scrapeActive: boolean;
};

type ServerActivityContextValue = {
  activity: ServerActivityState;
  fetchActivity: () => Promise<void>;
};

const ServerActivityContext = createContext<ServerActivityContextValue | null>(null);

export function ServerActivityProvider({ children }: { children: React.ReactNode }) {
  const [activity, setActivity] = useState<ServerActivityState>({
    aiActive: false,
    scrapeActive: false
  });

  const fetchActivity = useCallback(async () => {
    if (isDemoMode()) {
      setActivity({ aiActive: false, scrapeActive: false });
      return;
    }
    try {
      const response = await apiClient.get('/ai-logs/activity');
      if (response.data.success) {
        const { activeAiRequests, activeScrapes } = response.data.data;
        setActivity({
          aiActive: activeAiRequests > 0,
          scrapeActive: activeScrapes > 0
        });
      }
    } catch {
      /* ignore polling errors */
    }
  }, []);

  useEffect(() => {
    if (isDemoMode()) return;
    void fetchActivity();
    const id = window.setInterval(fetchActivity, 2000);
    return () => window.clearInterval(id);
  }, [fetchActivity]);

  const value = useMemo(() => ({ activity, fetchActivity }), [activity, fetchActivity]);

  return (
    <ServerActivityContext.Provider value={value}>
      {children}
    </ServerActivityContext.Provider>
  );
}

export function useServerActivity(): ServerActivityContextValue {
  const ctx = useContext(ServerActivityContext);
  if (!ctx) {
    throw new Error('useServerActivity must be used within ServerActivityProvider');
  }
  return ctx;
}
