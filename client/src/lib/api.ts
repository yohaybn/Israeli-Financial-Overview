import axios from 'axios';
import { getResolvedPublicBase } from '../utils/publicBase';

/**
 * Always derive the API root from the live `window.location.pathname`. Under Home Assistant
 * Ingress the iframe's URL is `/api/hassio_ingress/<token>/`, so the API root must be
 * `/api/hassio_ingress/<token>/api`. At site root pathname `/` becomes `/api`.
 *
 * Earlier implementations branched on `import.meta.env.BASE_URL` and used cached/imported
 * helpers; under some Ingress edge cases the branch returned `/api` even when the iframe
 * was at the ingress URL. Inlining the logic and reading `window.location` directly at
 * each call is robust against those quirks and against bundler weirdness.
 */
export function getApiRoot(): string {
    if (import.meta.env.DEV) {
        return '/api';
    }
    const pathname =
        typeof window !== 'undefined' && window.location && window.location.pathname
            ? window.location.pathname
            : '/';
    const normalized = pathname
        .replace(/\/+/g, '/')   // collapse repeated slashes (HA can leave a trailing `//`)
        .replace(/\/+$/, '');   // strip trailing slashes
    return normalized ? `${normalized}/api` : '/api';
}

/** Google OAuth redirect URI shown in UI and used with the real backend. */
export function getGoogleOAuthCallbackUrl(): string {
    return new URL('api/auth/google/callback', getResolvedPublicBase()).href;
}

if (typeof window !== 'undefined') {
    // One-time diagnostic so users debugging "why does /api/... 404 in HA Ingress?" can confirm at a
    // glance which base the bundle is actually using. Cheap; runs once at module init.
    // eslint-disable-next-line no-console
    console.info('[api] resolved API root', {
        apiRoot: getApiRoot(),
        baseUrl: import.meta.env.BASE_URL,
        pathname: window.location.pathname,
        href: window.location.href,
    });
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
