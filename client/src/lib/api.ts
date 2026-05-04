import axios from 'axios';
import { getResolvedPublicBase } from '../utils/publicBase';

/**
 * Always derive the API root from the live `window.location.pathname`. Under Home Assistant
 * Ingress the iframe's URL is `/api/hassio_ingress/<token>/`, so the API root must be
 * `/api/hassio_ingress/<token>/api`. Outside ingress (dev server, plain Docker) we use `/api`.
 *
 * NOTE: do NOT branch on `import.meta.env.DEV` / `import.meta.env.MODE`. The HA addon Dockerfile
 * sets `ENV NODE_ENV=development` for the install/build phase, which Vite has been observed
 * to bake into bundles as `DEV=true`, making the function short-circuit to `/api` even in the
 * production addon image. Detecting the ingress path explicitly is robust against that.
 */
export function getApiRoot(): string {
    if (typeof window === 'undefined' || !window.location || !window.location.pathname) {
        return '/api';
    }
    const pathname = window.location.pathname;
    // HA Ingress URL shape: /api/hassio_ingress/<token>/...
    const ingressMatch = pathname.match(/^\/api\/hassio_ingress\/[^/]+/);
    if (ingressMatch) {
        return `${ingressMatch[0]}/api`;
    }
    return '/api';
}

/** Google OAuth redirect URI shown in UI and used with the real backend. */
export function getGoogleOAuthCallbackUrl(): string {
    return new URL('api/auth/google/callback', getResolvedPublicBase()).href;
}

if (typeof window !== 'undefined') {
    // One-time diagnostic so users debugging "why does /api/... 404 in HA Ingress?" can confirm at a
    // glance which base the bundle is actually using. Cheap; runs once at module init.
    // eslint-disable-next-line no-console
    const normalizedPathname = window.location.pathname
        .replace(/\/+/g, '/')
        .replace(/\/+$/, '');
    const resolvedApiRoot = getApiRoot();
    const ingressPathDetected = /^\/api\/hassio_ingress\/[^/]+/.test(normalizedPathname);
    console.info('[api] resolved API root', {
        apiRoot: resolvedApiRoot,
        baseUrl: import.meta.env.BASE_URL,
        buildVersion: import.meta.env.VITE_APP_BUILD_VERSION,
        installKind: import.meta.env.VITE_INSTALL_KIND,
        mode: import.meta.env.MODE,
        dev: import.meta.env.DEV,
        prod: import.meta.env.PROD,
        moduleUrl: import.meta.url,
        pathname: window.location.pathname,
        normalizedPathname,
        href: window.location.href,
    });
    if (ingressPathDetected && resolvedApiRoot === '/api') {
        // eslint-disable-next-line no-console
        console.warn('[api] ingress path detected but API root resolved to /api; resolver is broken or bundle is stale');
    }
}

/**
 * Axios baseURL is read AT REQUEST TIME via the request interceptor, not captured once at
 * module load. Under HA Ingress the iframe URL is sometimes finalized after the module is
 * imported (e.g. after a Supervisor redirect), so reading on every call avoids "stuck on
 * /api" failures.
 */
export const api = axios.create({
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    config.baseURL = getApiRoot();
    return config;
});

export const apiClient = api;
