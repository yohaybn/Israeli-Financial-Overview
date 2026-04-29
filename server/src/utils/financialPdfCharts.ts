/**
 * SVG chart primitives for financial PDF (parity with Detailed Analytics visuals, no Recharts).
 */

import type { CategoryTreemapGroup } from '@app/shared';
import { TREEMAP_SMALL_MERGED_ID } from '@app/shared';

function escapeXml(s: string): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function svgCategoryTreemapByParent(
    groups: CategoryTreemapGroup[],
    opts: {
        width: number;
        height: number;
        mergedLabel: string;
        formatCurrency: (n: number) => string;
    }
): string {
    const { width: W, height: H, mergedLabel, formatCurrency } = opts;
    if (!groups.length) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><text x="8" y="20" font-size="11" fill="#94a3b8">—</text></svg>`;
    }

    let total = 0;
    for (const g of groups) {
        for (const c of g.children) total += c.value;
    }
    if (total <= 0) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><text x="8" y="20" font-size="11" fill="#94a3b8">—</text></svg>`;
    }

    const pad = 2;
    let y = pad;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="inherit">`;

    for (const g of groups) {
        const gSum = g.children.reduce((s, c) => s + c.value, 0);
        if (gSum <= 0) continue;
        const rowH = (gSum / total) * innerH;
        let x = pad;
        for (const leaf of g.children) {
            const w = (leaf.value / gSum) * innerW;
            const label =
                leaf.name === TREEMAP_SMALL_MERGED_ID ? mergedLabel : leaf.name;
            const showText = w > 44 && rowH > 18;
            svg += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${rowH.toFixed(2)}" rx="4" fill="${escapeXml(leaf.color)}" stroke="#f3f4f6" stroke-width="2"/>`;
            if (showText) {
                const fs = Math.min(11, rowH * 0.35);
                const ty = y + rowH / 2 - fs * 0.2;
                svg += `<text x="${(x + 6).toFixed(2)}" y="${ty.toFixed(2)}" font-size="${fs.toFixed(1)}" font-weight="700" fill="#111827" direction="rtl" xml:space="preserve">${escapeXml(label.length > 22 ? label.slice(0, 20) + '…' : label)}</text>`;
                const amtY = y + rowH - 6;
                if (rowH > 36) {
                    svg += `<text x="${(x + w - 6).toFixed(2)}" y="${amtY.toFixed(2)}" font-size="${(fs * 0.85).toFixed(1)}" font-weight="700" fill="#1f2937" text-anchor="end" direction="ltr">${escapeXml(formatCurrency(leaf.value))}</text>`;
                }
            }
            x += w;
        }
        y += rowH;
    }

    svg += '</svg>';
    return svg;
}

export function svgMonthlyIncomeExpenseBars(
    rows: { month: string; income: number; expenses: number }[],
    opts: {
        width: number;
        height: number;
        labelIncome: string;
        labelExpenses: string;
        formatAxis: (n: number) => string;
    }
): string {
    const { width: W, height: H, labelIncome, labelExpenses, formatAxis } = opts;
    const margin = { l: 44, r: 12, t: 28, b: 52 };
    const innerW = W - margin.l - margin.r;
    const innerH = H - margin.t - margin.b;
    if (!rows.length) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="8" y="20" fill="#94a3b8">—</text></svg>`;
    }

    let maxY = 1;
    for (const r of rows) {
        maxY = Math.max(maxY, r.income, r.expenses);
    }

    const n = rows.length;
    const gap = 4;
    const barW = Math.max(4, (innerW - gap * (n + 1)) / (n * 2 + 0.5));
    const groupW = barW * 2 + gap;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    svg += `<text x="${margin.l}" y="18" font-size="10" fill="#64748b">${escapeXml(labelIncome)} · ${escapeXml(labelExpenses)}</text>`;

    const y0 = margin.t + innerH;
    for (let i = 0; i < 3; i++) {
        const v = (maxY * i) / 2;
        const yy = y0 - (v / maxY) * innerH;
        svg += `<line x1="${margin.l}" y1="${yy.toFixed(1)}" x2="${W - margin.r}" y2="${yy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
        svg += `<text x="${margin.l - 4}" y="${(yy + 3).toFixed(1)}" font-size="8" fill="#9ca3af" text-anchor="end">${escapeXml(formatAxis(v))}</text>`;
    }

    rows.forEach((r, i) => {
        const xBase = margin.l + gap + i * (groupW + gap);
        const hIn = (r.income / maxY) * innerH;
        const hEx = (r.expenses / maxY) * innerH;
        svg += `<rect x="${xBase.toFixed(1)}" y="${(y0 - hIn).toFixed(1)}" width="${barW.toFixed(1)}" height="${hIn.toFixed(1)}" fill="#10ac84" rx="2"/>`;
        svg += `<rect x="${(xBase + barW + 2).toFixed(1)}" y="${(y0 - hEx).toFixed(1)}" width="${barW.toFixed(1)}" height="${hEx.toFixed(1)}" fill="#ee5253" rx="2"/>`;
        const m = r.month.length >= 7 ? r.month.slice(2, 7) : r.month;
        svg += `<text x="${(xBase + barW).toFixed(1)}" y="${(H - 10).toFixed(1)}" font-size="7" fill="#9ca3af" text-anchor="middle">${escapeXml(m)}</text>`;
    });

    svg += `<rect x="${margin.l}" y="${margin.t}" width="10" height="10" fill="#10ac84"/><text x="${margin.l + 14}" y="${margin.t + 9}" font-size="9" fill="#475569">${escapeXml(labelIncome)}</text>`;
    svg += `<rect x="${margin.l + 90}" y="${margin.t}" width="10" height="10" fill="#ee5253"/><text x="${margin.l + 104}" y="${margin.t + 9}" font-size="9" fill="#475569">${escapeXml(labelExpenses)}</text>`;

    svg += '</svg>';
    return svg;
}

export function svgVerticalBars(
    labels: string[],
    values: number[],
    opts: {
        width: number;
        height: number;
        barColor: string;
        formatAxis: (n: number) => string;
    }
): string {
    const { width: W, height: H, barColor, formatAxis } = opts;
    const margin = { l: 40, r: 8, t: 12, b: labels.length > 14 ? 40 : 32 };
    const innerW = W - margin.l - margin.r;
    const innerH = H - margin.t - margin.b;
    const n = values.length;
    if (!n) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="8" y="20" fill="#94a3b8">—</text></svg>`;
    }
    const maxY = Math.max(1, ...values);
    const barW = Math.max(2, (innerW - 4) / n - 2);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    const y0 = margin.t + innerH;
    for (let i = 0; i < 3; i++) {
        const v = (maxY * i) / 2;
        const yy = y0 - (v / maxY) * innerH;
        svg += `<line x1="${margin.l}" y1="${yy.toFixed(1)}" x2="${W - margin.r}" y2="${yy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
        svg += `<text x="${margin.l - 4}" y="${(yy + 3).toFixed(1)}" font-size="7" fill="#9ca3af" text-anchor="end">${escapeXml(formatAxis(v))}</text>`;
    }
    for (let i = 0; i < n; i++) {
        const v = values[i] ?? 0;
        const h = (v / maxY) * innerH;
        const x = margin.l + 2 + i * (barW + 2);
        svg += `<rect x="${x.toFixed(1)}" y="${(y0 - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${escapeXml(barColor)}" rx="2"/>`;
        if (labels[i]) {
            const rot = n > 20 ? ` transform="rotate(-55 ${x + barW / 2} ${y0 + 4})"` : '';
            svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y0 + 12).toFixed(1)}" font-size="7" fill="#64748b" text-anchor="middle"${rot}>${escapeXml(labels[i])}</text>`;
        }
    }
    svg += '</svg>';
    return svg;
}

export function svgMetaSpendPie(
    slices: { key: string; amount: number; color: string; label: string }[],
    opts: { width: number; height: number; formatCurrency: (n: number) => string }
): string {
    const { width: W, height: H, formatCurrency } = opts;
    const data = slices.filter((s) => s.amount > 0);
    const total = data.reduce((s, x) => s + x.amount, 0);
    const cx = W * 0.36;
    const cy = H / 2;
    const r = Math.min(W, H) * 0.32;
    if (total <= 0) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="8" y="20" fill="#94a3b8">—</text></svg>`;
    }

    let angle = -Math.PI / 2;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (const s of data) {
        const frac = s.amount / total;
        const a2 = angle + frac * 2 * Math.PI;
        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(a2);
        const y2 = cy + r * Math.sin(a2);
        const large = a2 - angle > Math.PI ? 1 : 0;
        svg += `<path d="M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${escapeXml(s.color)}" stroke="#fff" stroke-width="2"/>`;
        angle = a2;
    }

    let ly = cy - (data.length * 14) / 2 + 8;
    const lx = cx + r + 18;
    for (const s of data) {
        const pct = Math.round((s.amount / total) * 1000) / 10;
        svg += `<rect x="${lx}" y="${ly - 8}" width="8" height="8" rx="2" fill="${escapeXml(s.color)}"/>`;
        svg += `<text x="${lx + 12}" y="${ly}" font-size="9" fill="#334155">${escapeXml(s.label)} ${escapeXml(formatCurrency(s.amount))} (${pct}%)</text>`;
        ly += 18;
    }
    svg += '</svg>';
    return svg;
}

const USER_CHART_PIE_COLORS = [
    '#6366f1',
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ec4899',
    '#8b5cf6',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#64748b',
];

/** Pie for user-defined charts (positive slices only). */
export function svgUserChartPie(
    rows: { name: string; value: number }[],
    opts: { width: number; height: number; formatValue: (n: number) => string }
): string {
    const slices = rows
        .filter((r) => r.value > 0)
        .map((r, i) => ({
            key: r.name,
            amount: r.value,
            color: USER_CHART_PIE_COLORS[i % USER_CHART_PIE_COLORS.length],
            label: r.name,
        }));
    return svgMetaSpendPie(slices, { ...opts, formatCurrency: opts.formatValue });
}

/** Line chart; supports negative values (e.g. net by category). */
export function svgUserChartLine(
    rows: { name: string; value: number }[],
    opts: {
        width: number;
        height: number;
        formatValue: (n: number) => string;
        stroke?: string;
        formatAxis?: (n: number) => string;
    }
): string {
    const { width: W, height: H, stroke = '#6366f1' } = opts;
    const formatAxis = opts.formatAxis ?? ((n: number) => String(Math.round(n * 100) / 100));
    const margin = { l: 48, r: 10, t: 20, b: 52 };
    const innerW = W - margin.l - margin.r;
    const innerH = H - margin.t - margin.b;
    const n = rows.length;
    if (!n) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="8" y="20" fill="#94a3b8">—</text></svg>`;
    }
    const vals = rows.map((r) => r.value);
    const minV = Math.min(0, ...vals);
    const maxV = Math.max(0, ...vals);
    const span = maxV === minV ? 1 : maxV - minV;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    const y0 = margin.t + innerH;
    const yAxis = (v: number) => y0 - ((v - minV) / span) * innerH;
    for (let i = 0; i < 3; i++) {
        const v = minV + (span * i) / 2;
        const yy = yAxis(v);
        svg += `<line x1="${margin.l}" y1="${yy.toFixed(1)}" x2="${W - margin.r}" y2="${yy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
        svg += `<text x="${margin.l - 4}" y="${(yy + 3).toFixed(1)}" font-size="7" fill="#9ca3af" text-anchor="end">${escapeXml(formatAxis(v))}</text>`;
    }
    const zeroY = yAxis(0);
    svg += `<line x1="${margin.l}" y1="${zeroY.toFixed(1)}" x2="${W - margin.r}" y2="${zeroY.toFixed(1)}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 3"/>`;
    const step = n > 1 ? innerW / (n - 1) : innerW;
    const pts: string[] = [];
    rows.forEach((r, i) => {
        const x = margin.l + (n > 1 ? i * step : innerW / 2);
        const y = yAxis(r.value);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${escapeXml(stroke)}"/>`;
    });
    svg += `<polyline fill="none" stroke="${escapeXml(stroke)}" stroke-width="2" points="${pts.join(' ')}"/>`;
    rows.forEach((r, i) => {
        const x = margin.l + (n > 1 ? i * step : innerW / 2);
        const lab = r.name.length > 10 ? `${r.name.slice(0, 9)}…` : r.name;
        const rot = n > 8 ? ` transform="rotate(-50 ${x} ${y0 + 6})"` : '';
        svg += `<text x="${x.toFixed(1)}" y="${(y0 + 14).toFixed(1)}" font-size="7" fill="#64748b" text-anchor="middle"${rot}>${escapeXml(lab)}</text>`;
    });
    svg += '</svg>';
    return svg;
}
