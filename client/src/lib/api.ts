import axios from 'axios';
import { getIngressPathPrefix, getResolvedPublicBase, isIngressRelativeBase } from '../utils/publicBase';

/**
 * Root URL for the REST API (no trailing slash). In production, respects Vite `BASE_URL` (GitHub Pages project sites).
 * In dev, use same-origin `/api` so requests go through the Vite proxy (matches `vite.config.ts` backend port).
 */
export function getApiRoot(): string {
    if (import.meta.env.DEV) {
        return '/api';
    }
    if (isIngressRelativeBase()) {
        const p = getIngressPathPrefix();
        return p ? `${p}/api` : '/api';
    }
    const base = import.meta.env.BASE_URL;
    return base.endsWith('/') ? `${base}api` : `${base}/api`;
}

/** Google OAuth redirect URI shown in UI and used with the real backend. */
export function getGoogleOAuthCallbackUrl(): string {
    return new URL('api/auth/google/callback', getResolvedPublicBase()).href;
}

const getAxiosBaseUrl = () => getApiRoot();

const RESOLVED_API_ROOT = getAxiosBaseUrl();

if (typeof window !== 'undefined') {
    // One-time diagnostic so users debugging "why does /api/... 404 in HA Ingress?" can confirm at a
    // glance which base the bundle is actually using. Cheap; runs once at module init.
    // eslint-disable-next-line no-console
    console.info('[api] resolved API root', {
        apiRoot: RESOLVED_API_ROOT,
        baseUrl: import.meta.env.BASE_URL,
        pathname: window.location.pathname,
        href: window.location.href,
    });
}

export const api = axios.create({
    baseURL: RESOLVED_API_ROOT,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const apiClient = api;
