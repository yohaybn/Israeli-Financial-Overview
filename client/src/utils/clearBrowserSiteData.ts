/**
 * Clears site storage for this origin (localStorage, sessionStorage, and best-effort HTTP cookies on path /).
 * Used after server-side factory reset so the UI matches a clean install.
 */
export function clearBrowserSiteData(): void {
    try {
        localStorage.clear();
        sessionStorage.clear();
        const cookies = document.cookie.split(';');
        for (const c of cookies) {
            const name = c.split('=')[0]?.trim();
            if (name) {
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            }
        }
    } catch {
        /* ignore */
    }
}
