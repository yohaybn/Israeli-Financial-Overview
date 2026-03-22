export { isInternalTransfer, CC_SETTLEMENT_PATTERNS } from '@app/shared';

/** Mortgage / loan payment category — excluded from daily spend pace vs historical baseline. */
export function isLoanCategory(category: string | undefined): boolean {
    if (!category) return false;
    const c = category.trim();
    if (c === 'משכנתא והלוואות') return true;
    const lower = c.toLowerCase();
    return lower === 'mortgage & loans' || lower === 'mortgage and loans';
}
