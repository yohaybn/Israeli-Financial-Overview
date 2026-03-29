/**
 * How the app was installed / built. `VITE_INSTALL_KIND` is set at build time (Docker, Windows package, GitHub Pages, etc.).
 * If unset, we infer a coarse label from the browser (never "docker" — that only comes from build).
 */
export function getInstallationKindLabel(): string {
    const fromBuild = import.meta.env.VITE_INSTALL_KIND?.trim();
    if (fromBuild) return fromBuild;

    if (import.meta.env.DEV) return 'development';

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Windows/i.test(ua)) return 'windows';
    if (/Mac OS|Macintosh|Linux|X11/i.test(ua)) return 'unix';
    return 'unknown';
}
