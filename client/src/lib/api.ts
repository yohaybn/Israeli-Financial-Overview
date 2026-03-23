import axios from 'axios';

declare const __BACKEND_PORT__: string;

/**
 * Root URL for the REST API (no trailing slash). In production, respects Vite `BASE_URL` (GitHub Pages project sites).
 */
export function getApiRoot(): string {
    if (import.meta.env.DEV) {
        const port = typeof __BACKEND_PORT__ !== 'undefined' ? __BACKEND_PORT__ : '3000';
        return `http://${window.location.hostname}:${port}/api`;
    }
    const base = import.meta.env.BASE_URL;
    return base.endsWith('/') ? `${base}api` : `${base}/api`;
}

/** Google OAuth redirect URI shown in UI and used with the real backend. */
export function getGoogleOAuthCallbackUrl(): string {
    return new URL('api/auth/google/callback', window.location.origin + import.meta.env.BASE_URL).href;
}

const getAxiosBaseUrl = () => getApiRoot();

export const api = axios.create({
    baseURL: getAxiosBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
});

export const apiClient = api;
