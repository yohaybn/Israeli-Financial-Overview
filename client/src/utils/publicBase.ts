/**
 * Vite `base: './'` is used for Home Assistant Ingress (and other subpath hosts) so asset URLs are
 * relative to the page. Helpers here resolve same-origin links that would break if built with `base: '/'`.
 */

export function isIngressRelativeBase(): boolean {
    const b = import.meta.env.BASE_URL;
    return b === './' || b.startsWith('./');
}

/** Directory URL (with trailing slash) for resolving static files and API roots in the browser. */
export function getResolvedPublicBase(): string {
    const base = import.meta.env.BASE_URL;
    if (import.meta.env.DEV) {
        return `${window.location.origin}/`;
    }
    if (base === '/' || base === '') {
        return `${window.location.origin}/`;
    }
    if (isIngressRelativeBase()) {
        try {
            const resolved = new URL(base, window.location.href).href;
            return resolved.endsWith('/') ? resolved : `${resolved}/`;
        } catch {
            return `${window.location.origin}/`;
        }
    }
    const path = base.endsWith('/') ? base : `${base}/`;
    return `${window.location.origin}${path}`;
}

export function publicAssetUrl(relativePath: string): string {
    const rel = relativePath.replace(/^\//, '');
    return new URL(rel, getResolvedPublicBase()).href;
}

/**
 * With `base: './'`, relative `./api` resolves wrong when the ingress URL has no trailing slash
 * (`/hassio/ingress/my_addon` → `./api` becomes `/hassio/ingress/api`). Use the live pathname prefix instead.
 * Empty string means site root (`/`).
 */
export function getIngressPathPrefix(): string {
    const p = window.location.pathname.replace(/\/+$/, '');
    return p || '';
}

/** Socket.IO `path` option: must include HA Ingress prefix when the UI is not at domain root. */
export function getSocketIoPath(): string {
    if (import.meta.env.DEV) return '/socket.io';
    const base = import.meta.env.BASE_URL;
    if (base === '/' || base === '') return '/socket.io';
    if (isIngressRelativeBase()) {
        const p = getIngressPathPrefix();
        return p ? `${p}/socket.io` : '/socket.io';
    }
    const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${normalized}/socket.io`;
}
