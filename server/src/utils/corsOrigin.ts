/**
 * Origin policy for a self-hosted, single-user server on a home network.
 *
 * Why not `cors()` (allow all): with the server listening on 0.0.0.0 and the
 * app lock not yet configured, any website the user visits in their browser can
 * issue cross-origin calls to the local API (drive scrapes, read backups).
 * The fix keeps self-hosting practical: same-origin and LAN/localhost clients
 * keep working with zero configuration, everything else needs an explicit
 * opt-in via CORS_EXTRA_ORIGINS.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const LOCAL_TLDS = ['.local', '.lan', '.internal', '.home.arpa', '.corp'];

/** True for RFC1918 / link-local IPv4 hosts on the user's own network. */
function isPrivateIpv4(hostname: string): boolean {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (!m) return false;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 169 && b === 254) return true; // link-local
    return false;
}

function parseExtraOrigins(raw: string | undefined): Set<string> {
    if (!raw) return new Set();
    return new Set(
        raw
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
    );
}

export type CorsOriginChecker = (origin: string | undefined) => boolean;

/**
 * Build the origin checker once at startup. Failures are closed: an origin we
 * cannot parse or do not recognize is rejected.
 */
export function createCorsOriginChecker(
    extraOriginsRaw: string | undefined = process.env.CORS_EXTRA_ORIGINS
): CorsOriginChecker {
    const extraOrigins = parseExtraOrigins(extraOriginsRaw);

    return (origin: string | undefined): boolean => {
        // No Origin header: same-origin navigation/fetch, curl, Electron, mobile
        // WebViews and server-to-server calls. CORS only governs cross-origin
        // browser requests, so these are not restricted by it anyway.
        if (!origin || origin === 'null') return true;

        if (extraOrigins.has(origin)) return true;

        let url: URL;
        try {
            url = new URL(origin);
        } catch {
            return false;
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

        const hostname = url.hostname.toLowerCase();
        if (LOOPBACK_HOSTNAMES.has(hostname)) return true;
        if (isPrivateIpv4(hostname)) return true;
        if (LOCAL_TLDS.some((tld) => hostname.endsWith(tld))) return true;

        return false;
    };
}
