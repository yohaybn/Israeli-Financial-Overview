/**
 * Category colors for analytics treemap / Telegram pie (single source of truth).
 * Unknown categories use a large distinct palette with deterministic hashing.
 */

export const CATEGORY_COLORS: Record<string, string> = {
    // English
    'Food & Dining': '#FF6B6B',
    Shopping: '#4ECDC4',
    Transport: '#FFE66D',
    Entertainment: '#ff9f43',
    Health: '#FF8C94',
    Education: '#54a0ff',
    Travel: '#00d2d3',
    Utilities: '#48dbfb',
    Housing: '#ee5253',
    Insurance: '#5f27cd',
    Gifts: '#ff9ff3',
    Income: '#1dd1a1',
    Investments: '#10ac84',
    Other: '#C7CEEA',
    Transfers: '#2563eb',
    Supermarket: '#dc2626',
    // Hebrew — common defaults + frequent custom labels
    מזון: '#FF6B6B',
    קניות: '#4ECDC4',
    תחבורה: '#FFE66D',
    'פנאי ובידור': '#ff9f43',
    בריאות: '#FF8C94',
    חינוך: '#54a0ff',
    'חופשות וטיולים': '#00d2d3',
    חשבונות: '#48dbfb',
    דיור: '#ee5253',
    ביטוח: '#5f27cd',
    ביטוחים: '#7c3aed',
    מתנות: '#ff9ff3',
    הכנסה: '#1dd1a1',
    השקעות: '#10ac84',
    אחר: '#C7CEEA',
    'ללא קטגוריה': '#B0BEC5',
    העברות: '#2563eb',
    סופרמרקט: '#dc2626',
    מגורים: '#b91c1c',
    'משכנתא והלוואות': '#64748b',
};

/**
 * Fallback palette: many visually distinct hues (avoids repeating the same blue/red for different categories).
 */
export const CATEGORY_COLOR_PALETTE: readonly string[] = [
    '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#7c3aed', '#8b5cf6', '#a855f7', '#d946ef', '#c026d3', '#db2777',
    '#ec4899', '#f43f5e', '#fb7185', '#fdba74', '#fde047', '#bef264', '#4ade80', '#2dd4bf',
    '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#f472b6',
    '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#00d2d3', '#1dd1a1', '#5f27cd',
    '#ff9f43', '#ee5253', '#0abde3', '#10ac84', '#576574', '#0d9488', '#0284c7', '#ca8a04',
    '#ea580c', '#be123c', '#4f46e5', '#0369a1', '#15803d', '#713f12',
];

function mixHash(category: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < category.length; i++) {
        h ^= category.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function getColorForCategory(category: string): string {
    const fixed = CATEGORY_COLORS[category];
    if (fixed) return fixed;
    const idx = mixHash(category) % CATEGORY_COLOR_PALETTE.length;
    return CATEGORY_COLOR_PALETTE[idx];
}
