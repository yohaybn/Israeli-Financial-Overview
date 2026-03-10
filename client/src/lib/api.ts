import axios from 'axios';

export const api = axios.create({
    // Remove the protocol and domain. 
    // This will now point to: current-domain.com/api
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

export const apiClient = api;