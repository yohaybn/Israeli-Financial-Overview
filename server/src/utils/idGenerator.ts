import * as crypto from 'crypto';
import { Transaction } from '@app/shared';

/**
 * Generates a deterministic unique ID for a transaction based on its primary fields.
 * This helps in deduplicating transactions imported from different sources or multiple times.
 */
export function generateTransactionId(transaction: {
    accountNumber: string;
    date: string;
    originalAmount: number;
    description: string;
}): string {
    const dataToHash = `${transaction.accountNumber}-${transaction.date}-${transaction.originalAmount}-${transaction.description}`;
    return crypto.createHash('md5').update(dataToHash).digest('hex').substring(0, 12);
}
