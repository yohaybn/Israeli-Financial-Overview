import type { Transaction } from './types.js';

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
 */
export function isInternalTransfer(txn: Transaction, customCCKeywords: string[] = []): boolean {
    if (txn.isInternalTransfer === true) return true;
    if (txn.isInternalTransfer === false) return false;

    if (txn.txnType === 'internal_transfer' || txn.type === 'internal_transfer') return true;

    if (txn.txnType === 'normal') return false;

    const category = txn.category?.toLowerCase();
    if (category === 'העברה פנימית' || category === 'internal transfer') return true;

    const desc = txn.description || '';

    const matchesBuiltIn = CC_SETTLEMENT_PATTERNS.some(pattern => pattern.test(desc));

    const matchesCustom = customCCKeywords.length > 0 &&
        customCCKeywords.some(kw => kw.trim() && desc.toLowerCase().includes(kw.trim().toLowerCase()));

    if (!matchesBuiltIn && !matchesCustom) return false;

    const amount = Math.abs(txn.chargedAmount || txn.amount || 0);

    const isCCSettlement = CC_SETTLEMENT_PATTERNS.slice(0, 16).some(p => p.test(desc));
    if (isCCSettlement && amount < 100) return false;

    return true;
}
