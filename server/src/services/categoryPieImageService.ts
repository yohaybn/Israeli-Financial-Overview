import sharp from 'sharp';
import type { CategoryExpenseSlice } from '@app/shared';

const MERGE_FRACTION = 0.04;
const OTHER_COLOR = '#64748b';

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Merge categories below min share into a single "Other" slice (matches dashboard treemap spirit). */
export function mergeSmallSlicesForPie(
    slices: CategoryExpenseSlice[],
    otherLabel: string
): CategoryExpenseSlice[] {
    if (slices.length === 0) return [];
    const total = slices.reduce((s, r) => s + r.value, 0);
    if (total <= 0) return [];
    const threshold = Math.max(total * MERGE_FRACTION, 0.01);
    const large = slices.filter((c) => c.value >= threshold);
    const small = slices.filter((c) => c.value < threshold);
    if (small.length === 0) return large;
    const merged = small.reduce((s, r) => s + r.value, 0);
    return [
        ...large,
        {
            name: otherLabel,
            value: Math.round(merged * 100) / 100,
            color: OTHER_COLOR,
        },
    ].sort((a, b) => b.value - a.value);
}

function piePaths(cx: number, cy: number, r: number, slices: CategoryExpenseSlice[]): string {
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (total <= 0) return '';
    let startAngle = -Math.PI / 2;
    const parts: string[] = [];
    for (const slice of slices) {
        if (slice.value <= 0) continue;
        const sweep = (slice.value / total) * 2 * Math.PI;
        const endAngle = startAngle + sweep;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = sweep > Math.PI ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        parts.push(`<path d="${d}" fill="${escapeXml(slice.color)}" stroke="#ffffff" stroke-width="2"/>`);
        startAngle = endAngle;
    }
    return parts.join('\n');
}

export interface CategoryPiePngOptions {
    slices: CategoryExpenseSlice[];
    title: string;
    subtitle?: string;
    otherLabel: string;
}

/**
 * Renders a PNG (fast path: SVG → sharp) for Telegram sendPhoto.
 */
export async function renderCategorySpendingPiePng(options: CategoryPiePngOptions): Promise<Buffer> {
    const { slices, title, subtitle, otherLabel } = options;
    const merged = mergeSmallSlicesForPie(slices, otherLabel);
    const W = 920;
    const H = 560;
    const cx = 270;
    const cy = 290;
    const r = 210;

    const total = merged.reduce((s, x) => s + x.value, 0);

    const legendX = 520;
    let legendY = 120;
    const lineH = 26;
    const maxLegend = 14;
    const rows = merged.slice(0, maxLegend);
    const overflow = merged.length - rows.length;

    const legendLines: string[] = [];
    for (const row of rows) {
        const pct = total > 0 ? Math.round((row.value / total) * 1000) / 10 : 0;
        const label = escapeXml(row.name.length > 36 ? `${row.name.slice(0, 35)}…` : row.name);
        legendLines.push(
            `<g transform="translate(${legendX}, ${legendY})">` +
                `<rect x="0" y="-10" width="12" height="12" rx="2" fill="${escapeXml(row.color)}"/>` +
                `<text x="20" y="0" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="13" fill="#1e293b">${label}</text>` +
                `<text x="380" y="0" text-anchor="end" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="12" fill="#475569" font-weight="600">₪${row.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${pct}%)</text>` +
                `</g>`
        );
        legendY += lineH;
    }
    if (overflow > 0) {
        legendLines.push(
            `<text x="${legendX}" y="${legendY + 8}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="11" fill="#94a3b8">+${overflow} …</text>`
        );
    }

    const sub = subtitle ? `<text x="460" y="52" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="13" fill="#64748b">${escapeXml(subtitle)}</text>` : '';

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="460" y="36" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#334155">${escapeXml(title)}</text>
  ${sub}
  ${total > 0 ? piePaths(cx, cy, r, merged) : `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="14" fill="#94a3b8">—</text>`}
  ${legendLines.join('\n')}
</svg>`;

    return sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
}
