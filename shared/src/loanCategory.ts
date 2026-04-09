/**
 * Mortgage / loan expense category — excluded from analytics spending charts (same rules as web client).
 */
export function isLoanExpenseCategory(category: string | undefined): boolean {
    if (!category) return false;
    const c = category.trim();
    if (c === 'משכנתא והלוואות') return true;
    const lower = c.toLowerCase();
    return lower === 'mortgage & loans' || lower === 'mortgage and loans';
}
