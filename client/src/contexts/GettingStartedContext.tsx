import { createContext, useContext, type ReactNode } from 'react';
import { useGettingStartedState } from '../hooks/useGettingStartedState';

type GettingStartedContextValue = ReturnType<typeof useGettingStartedState>;

const GettingStartedContext = createContext<GettingStartedContextValue | null>(null);

export function GettingStartedProvider({ children }: { children: ReactNode }) {
    const value = useGettingStartedState();
    return <GettingStartedContext.Provider value={value}>{children}</GettingStartedContext.Provider>;
}

export function useGettingStarted(): GettingStartedContextValue {
    const ctx = useContext(GettingStartedContext);
    if (!ctx) {
        throw new Error('useGettingStarted must be used within GettingStartedProvider');
    }
    return ctx;
}
