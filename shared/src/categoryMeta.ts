import { TRANSFERS_CATEGORY_LABEL } from './txnReview.js';

/** Income-style labels: excluded from fixed/variable/optimization expense analysis. */
export const INCOME_CATEGORY_LABELS = new Set<string>(['משכורת', 'קצבאות', 'הכנסות']);

export const EXPENSE_META_BUCKETS = ['fixed', 'variable', 'optimization', 'excluded'] as const;

export type ExpenseMetaCategory = (typeof EXPENSE_META_BUCKETS)[number];

const FIXED_DEFAULTS = new Set<string>([
    'מגורים',
    'חשבונות',
    'מנויים',
    'ביטוחים',
    'משכנתא והלוואות',
    'אגרות וקנסות',
]);

const VARIABLE_DEFAULTS = new Set<string>([
    'מזון',
    'תחבורה',
    'בריאות',
    'חינוך',
    'קניות',
    'ביגוד',
    'אחר',
]);

const OPTIMIZATION_DEFAULTS = new Set<string>([
    'בילויים',
    'מסעדות',
    'מסעדות ואוכל בחוץ',
    'תרומות',
]);

export function isIncomeCategoryLabel(category: string): boolean {
    return INCOME_CATEGORY_LABELS.has(category.trim());
}

export function isTransferCategoryLabel(category: string): boolean {
    return category.trim() === TRANSFERS_CATEGORY_LABEL;
}

export function isExcludedFromExpenseMetaByDefault(category: string): boolean {
    const c = category.trim();
    return isIncomeCategoryLabel(c) || isTransferCategoryLabel(c);
}

/**
 * Default bucket for a category name when not present in stored settings.
 * New user-defined categories default to `variable`.
 */
export function defaultExpenseMetaForCategory(category: string): ExpenseMetaCategory {
    const c = category.trim();
    if (isExcludedFromExpenseMetaByDefault(c)) return 'excluded';
    if (FIXED_DEFAULTS.has(c)) return 'fixed';
    if (OPTIMIZATION_DEFAULTS.has(c)) return 'optimization';
    if (VARIABLE_DEFAULTS.has(c)) return 'variable';
    return 'variable';
}

export function isValidExpenseMeta(value: unknown): value is ExpenseMetaCategory {
    return (
        value === 'fixed' ||
        value === 'variable' ||
        value === 'optimization' ||
        value === 'excluded'
    );
}

/**
 * Build a full map for every allowed category: merge stored values with defaults.
 */
export function mergeCategoryMeta(
    categories: string[],
    stored: Partial<Record<string, string>> | undefined
): Record<string, ExpenseMetaCategory> {
    const out: Record<string, ExpenseMetaCategory> = {};
    for (const cat of categories) {
        const key = cat.trim();
        if (!key) continue;
        const raw = stored?.[key];
        out[key] = isValidExpenseMeta(raw) ? raw : defaultExpenseMetaForCategory(key);
    }
    return out;
}
