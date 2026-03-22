import { Transaction } from '@app/shared';

// Built-in Israeli credit card company name patterns for detecting CC settlements
export const CC_SETTLEMENT_PATTERNS = [
    /visa/i, /ויזה/i,
    /isracard/i, /ישראכרט/i,
    /cal/i, /כאל/i,
    /max/i, /מקס/i,
    /diners/i, /דיינרס/i,
    /amex/i, /אמריקן אקספרס/i,
    /american express/i,
    /mastercard/i, /מסטרקארד/i,
    /הוראת קבע.*כרטיס/i,
    /תשלום.*כרטיס/i,
    /חיוב.*כרטיס/i,
    // General bank internal transfer patterns
    /העברה בין חשבונות/i,
    /העברה עצמית/i,
    /מחשבון.*לחשבון/i,
    /הפקדה.*פקדון/i,
    /פדיון.*פקדון/i,
    /נח"מ/i,
    /העברה.*בתוך/i,
];

/**
 * Detect if a transaction is a credit card settlement (internal transfer).
 * CC settlements appear as debits paying the card company from any account.
 */
export function isInternalTransfer(txn: Transaction, customCCKeywords: string[] = []): boolean {
    // 0. Single Source of Truth: Check if explicitly marked in DB
    if (txn.isInternalTransfer === true) return true;
    if (txn.isInternalTransfer === false) return false;

    // 1. Check if definitely internal (explicit user mark OR legacy mark)
    if (txn.txnType === 'internal_transfer' || txn.type === 'internal_transfer') return true;

    // 2. Check if explicitly marked as normal (user override to restore an auto-detected one)
    if (txn.txnType === 'normal') return false;

    // 3. Category-based classification (AI assigned or human corrected)
    const category = txn.category?.toLowerCase();
    if (category === 'העברה פנימית' || category === 'internal transfer') return true;

    const desc = txn.description || '';

    // Check built-in patterns
    const matchesBuiltIn = CC_SETTLEMENT_PATTERNS.some(pattern => pattern.test(desc));

    // Check user-defined custom keywords (case-insensitive substring match)
    const matchesCustom = customCCKeywords.length > 0 &&
        customCCKeywords.some(kw => kw.trim() && desc.toLowerCase().includes(kw.trim().toLowerCase()));

    if (!matchesBuiltIn && !matchesCustom) return false;

    // Threshold logic:
    // CC settlements are typically > 100. For specific bank transfer keywords, 
    // we bypass the threshold to be more inclusive.
    const amount = Math.abs(txn.chargedAmount || txn.amount || 0);

    // If it's a CC settlement pattern, we still expect it to be significant
    const isCCSettlement = CC_SETTLEMENT_PATTERNS.slice(0, 16).some(p => p.test(desc));
    if (isCCSettlement && amount < 100) return false;

    return true;
}

/** Mortgage / loan payment category — excluded from daily spend pace vs historical baseline. */
export function isLoanCategory(category: string | undefined): boolean {
    if (!category) return false;
    const c = category.trim();
    if (c === 'משכנתא והלוואות') return true;
    const lower = c.toLowerCase();
    return lower === 'mortgage & loans' || lower === 'mortgage and loans';
}
