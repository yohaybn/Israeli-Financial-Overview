import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import { QueryProvider } from './providers/QueryProvider';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { GettingStartedProvider } from './contexts/GettingStartedContext';
import { ServerActivityProvider } from './contexts/ServerActivityContext';
import { isDemoMode } from './demo/isDemo';

async function bootstrap() {
    if (isDemoMode()) {
        const { worker } = await import('./demo/browser');
        await worker.start({
            onUnhandledRequest: 'bypass',
            serviceWorker: {
                // BASE_URL is a path (/ or /repo/); URL() needs an absolute base.
                url: new URL('mockServiceWorker.js', `${window.location.origin}${import.meta.env.BASE_URL}`).href,
            },
        });
    }

    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <QueryProvider>
                <OnboardingProvider>
                    <GettingStartedProvider>
                        <ServerActivityProvider>
                            <App />
                        </ServerActivityProvider>
                    </GettingStartedProvider>
                </OnboardingProvider>
            </QueryProvider>
        </React.StrictMode>
    );
}

void bootstrap();
