import { isLoanExpenseCategory } from '@app/shared';

export { isInternalTransfer, CC_SETTLEMENT_PATTERNS } from '@app/shared';

/** Mortgage / loan payment category — excluded from daily spend pace vs historical baseline. */
export function isLoanCategory(category: string | undefined): boolean {
    return isLoanExpenseCategory(category);
}
