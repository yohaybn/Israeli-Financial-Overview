import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

/** In-memory cache: embedded CSS is ~200KB+ of base64; build once per process. */
let cachedEmbeddedCss: string | null = null;

function notoSansHebrewPackageDir(): string {
    return path.dirname(require.resolve('@fontsource/noto-sans-hebrew/package.json'));
}

/**
 * Replace `url(./files/*.woff2)` in Fontsource CSS with data URIs so Puppeteer/Chromium
 * does not depend on network or font load timing (fixes missing Hebrew glyphs in PDFs).
 */
function embedWoff2InCss(css: string, pkgDir: string): string {
    const filesDir = path.join(pkgDir, 'files');
    return css.replace(/url\(\.\/files\/([^)]+\.woff2)\)/g, (_m, rel: string) => {
        const filename = path.basename(rel.trim());
        const buf = readFileSync(path.join(filesDir, filename));
        const b64 = buf.toString('base64');
        return `url(data:font/woff2;base64,${b64})`;
    });
}

/**
 * Full @font-face rules for weights used in the PDF (400 / 600 / 700), family `Noto Sans Hebrew`
 * with correct unicode-range for Hebrew + Latin + punctuation.
 */
export function getFinancialPdfEmbeddedFontsCss(): string {
    if (cachedEmbeddedCss) return cachedEmbeddedCss;
    const pkgDir = notoSansHebrewPackageDir();
    const weights = ['400.css', '600.css', '700.css'];
    const parts: string[] = [];
    for (const w of weights) {
        const cssPath = path.join(pkgDir, w);
        const raw = readFileSync(cssPath, 'utf8');
        parts.push(embedWoff2InCss(raw, pkgDir));
    }
    cachedEmbeddedCss = parts.join('\n');
    return cachedEmbeddedCss;
}