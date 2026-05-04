/**
 * Vite `base: './'` is used for Home Assistant Ingress (and other subpath hosts) so asset URLs are
 * relative to the page. Helpers here resolve same-origin links that would break if built with `base: '/'`.
 */

export function isIngressRelativeBase(): boolean {
    const b = import.meta.env.BASE_URL;
    return b === './' || b.startsWith('./');
}

/**
 * Directory URL (with trailing slash) for resolving static files and API roots in the browser.
 *
 * Do NOT branch on `import.meta.env.DEV` — the addon Dockerfile sets `NODE_ENV=development`
 * during install/build, which Vite can bake as `DEV=true` even in the production bundle.
 * The path-based logic below produces the right answer in dev (`base === '/'`) and in
 * ingress (`base === './'`).
 */
export function getResolvedPublicBase(): string {
    const base = import.meta.env.BASE_URL;
    if (base === '/' || base === '' || base == null) {
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

/**
 * Socket.IO `path` option: mirrors `getApiRoot()` in `lib/api.ts`. Detect the HA ingress URL
 * explicitly rather than branching on `import.meta.env.DEV`; the addon Dockerfile sets
 * `NODE_ENV=development` during build, which can leak `DEV=true` into the production bundle
 * and make this short-circuit incorrectly to `/socket.io` under ingress.
 */
export function getSocketIoPath(): string {
    if (typeof window === 'undefined' || !window.location || !window.location.pathname) {
        return '/socket.io';
    }
    const pathname = window.location.pathname;
    const ingressMatch = pathname.match(/^\/api\/hassio_ingress\/[^/]+/);
    if (ingressMatch) {
        return `${ingressMatch[0]}/socket.io`;
    }
    return '/socket.io';
}
