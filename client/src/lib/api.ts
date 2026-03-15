import axios from 'axios';

declare const __BACKEND_PORT__: string;

const getBaseUrl = () => {
    // @ts-ignore: Vite injects import.meta.env
    if (import.meta.env.DEV) {
        return `http://${window.location.hostname}:${typeof __BACKEND_PORT__ !== 'undefined' ? __BACKEND_PORT__ : 3001}/api`;
    }
    return '/api';
};

export const api = axios.create({
    // Remove the protocol and domain if in production, else target backend port.
    baseURL: getBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
});

export const apiClient = api;