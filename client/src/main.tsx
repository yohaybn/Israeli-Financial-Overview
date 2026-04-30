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
import { getResolvedPublicBase, isIngressRelativeBase } from './utils/publicBase';

/**
 * One-time PWA service-worker kill switch for HA Ingress.
 *
 * Older addon builds shipped a vite-plugin-pwa service worker. Under HA Ingress the SW caches
 * `index.html` + asset hashes that become stale on every addon update, so users keep seeing
 * the previous build and API calls go to the wrong base URL. We now disable the plugin in
 * `vite.config.ts` for the ingress build, but devices that already installed the old SW need
 * an explicit unregister + cache wipe — that's what this does. Synchronous-ish (Promise) so it
 * cannot delay rendering: we kick it off and forget.
 */
function killStalePwaServiceWorkerUnderIngress(): void {
    if (!isIngressRelativeBase()) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))))
        .then(() => {
            if (typeof caches !== 'undefined') {
                return caches
                    .keys()
                    .then((keys) => Promise.all(keys.map((k) => caches.delete(k).catch(() => false))));
            }
            return undefined;
        })
        .catch(() => {
            /* best-effort cleanup */
        });
}

async function bootstrap() {
    killStalePwaServiceWorkerUnderIngress();

    if (isDemoMode()) {
        const { worker } = await import('./demo/browser');
        await worker.start({
            onUnhandledRequest: 'bypass',
            serviceWorker: {
                url: new URL('mockServiceWorker.js', getResolvedPublicBase()).href,
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
