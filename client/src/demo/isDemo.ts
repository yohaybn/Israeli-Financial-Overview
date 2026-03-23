export function isDemoMode(): boolean {
    return import.meta.env.VITE_DEMO === 'true';
}
