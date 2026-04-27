import axios from 'axios';
import { getResolvedPublicBase } from '../utils/publicBase';

/**
 * Root URL for the REST API (no trailing slash). In production, respects Vite `BASE_URL` (GitHub Pages project sites).
 * In dev, use same-origin `/api` so requests go through the Vite proxy (matches `vite.config.ts` backend port).
 */
export function getApiRoot(): string {
    if (import.meta.env.DEV) {
        return '/api';
    }
    const base = import.meta.env.BASE_URL;
    return base.endsWith('/') ? `${base}api` : `${base}/api`;
}

/** Google OAuth redirect URI shown in UI and used with the real backend. */
export function getGoogleOAuthCallbackUrl(): string {
    return new URL('api/auth/google/callback', getResolvedPublicBase()).href;
}

const getAxiosBaseUrl = () => getApiRoot();

export const api = axios.create({
    baseURL: getAxiosBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
});

export const apiClient = api;
