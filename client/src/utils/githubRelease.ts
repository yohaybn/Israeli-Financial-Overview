/** Parses `1.2.3`, `v1.2.3@sha`, `1.2.3-beta` → numeric core, or null if not semver-like. */
export function parseSemverCore(versionLike: string): [number, number, number] | null {
    const head = versionLike.split('@')[0]?.trim() ?? '';
    const withoutV = head.replace(/^v/i, '');
    const core = (withoutV.split(/[-+]/)[0] ?? '').trim();
    const parts = core.split('.');
    if (parts.length < 3) return null;
    const a = Number.parseInt(parts[0], 10);
    const b = Number.parseInt(parts[1], 10);
    const c = Number.parseInt(parts[2], 10);
    if ([a, b, c].some((n) => Number.isNaN(n))) return null;
    return [a, b, c];
}

export function compareSemverCore(left: [number, number, number], right: [number, number, number]): number {
    for (let i = 0; i < 3; i++) {
        if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
    }
    return 0;
}

export async function fetchLatestGitHubRelease(repo: string): Promise<{ tagName: string; htmlUrl: string } | null> {
    const trimmed = repo.trim();
    if (!trimmed) return null;
    const [owner, name] = trimmed.split('/').map((s) => s.trim());
    if (!owner || !name) return null;
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/latest`;
    const res = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json' }
    });
    if (res.status === 404) return null;
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!data.tag_name || !data.html_url) return null;
    return { tagName: data.tag_name, htmlUrl: data.html_url };
}
