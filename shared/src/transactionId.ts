import md5 from 'md5';
import type { Transaction } from './types.js';

/** Bump only if the canonical string format changes (would produce different hashes). */
export const TRANSACTION_ID_HASH_VERSION = 'v1';

/**
 * MD5 hex (32 chars). Single hash primitive for all transaction ids derived from keys.
 * Uses pure-JS `md5` (UTF-8) so the same ids are produced in Node and in the browser bundle.
 */
export function hashTransactionId(key: string): string {
    return md5(key);
}

/**
 * Content-based key — must stay stable for existing scraped rows (legacy JSON + DB).
 * Format matches historical server logic: date|amount|description|accountNumber
 */
export function buildContentTransactionKey(
    txn: { date: string; amount?: number; chargedAmount?: number; description: string },
    accountNumber: string
): string {
    const dateStr = new Date(txn.date).toISOString().split('T')[0];
    const amt = txn.amount ?? txn.chargedAmount ?? 0;
    return `${dateStr}|${amt}|${txn.description}|${accountNumber}`;
}

/**
 * When the institution gives a stable reference (voucher, אסמכתא, etc.), hash this key — not the row content.
 * Format: v1|ext|provider|accountNumber|externalId
 */
export function buildExternalTransactionKey(parts: {
    provider: string;
    accountNumber: string;
    externalId: string;
}): string {
    const ext = parts.externalId.trim();
    return `${TRANSACTION_ID_HASH_VERSION}|ext|${parts.provider}|${parts.accountNumber}|${ext}`;
}

/**
 * Heuristic: keep scraper-supplied ids that look like opaque bank/reference tokens.
 * (UUIDs, short random ids, and plain numerics are not preserved here.)
 */
export function shouldPreserveScrapedTransactionId(id: string | undefined | null): boolean {
    if (!id) return false;
    if (id.includes('-')) return false;
    if (id.length <= 10) return false;
    if (!isNaN(Number(id))) return false;
    if (id.length === 9) return false;
    return true;
}

export interface AssignTransactionIdInput {
    /** Scraper/client id — may be kept when {@link shouldPreserveScrapedTransactionId} passes */
    existingId?: string | null;
    /** Bank-issued stable reference when we should not rely on content-only hashing */
    externalId?: string | null;
    /** Provenance only (import batch, filename, etc.) — never hashed */
    sourceRef?: string | null;
    provider: string;
    accountNumber: string;
    date: string;
    amount?: number;
    chargedAmount?: number;
    description: string;
}

export interface AssignTransactionIdResult {
    id: string;
    externalId?: string;
    sourceRef?: string;
}

/**
 * Assigns primary key {@link Transaction.id} and optional {@link Transaction.externalId} / {@link Transaction.sourceRef}.
 *
 * Precedence:
 * 1. Preserve existing id when it matches {@link shouldPreserveScrapedTransactionId}
 * 2. Else if externalId is set → MD5({@link buildExternalTransactionKey})
 * 3. Else → MD5({@link buildContentTransactionKey})
 */
export function assignTransactionId(input: AssignTransactionIdInput): AssignTransactionIdResult {
    const sourceRef = input.sourceRef?.trim() || undefined;

    if (input.existingId && shouldPreserveScrapedTransactionId(input.existingId)) {
        return {
            id: input.existingId,
            externalId: input.externalId?.trim() || input.existingId,
            ...(sourceRef ? { sourceRef } : {}),
        };
    }

    const ext = input.externalId?.trim();
    if (ext) {
        const key = buildExternalTransactionKey({
            provider: input.provider,
            accountNumber: input.accountNumber,
            externalId: ext,
        });
        return {
            id: hashTransactionId(key),
            externalId: ext,
            ...(sourceRef ? { sourceRef } : {}),
        };
    }

    const contentKey = buildContentTransactionKey(
        {
            date: input.date,
            amount: input.amount,
            chargedAmount: input.chargedAmount,
            description: input.description,
        },
        input.accountNumber
    );
    return {
        id: hashTransactionId(contentKey),
        ...(sourceRef ? { sourceRef } : {}),
    };
}

/**
 * Assigns {@link Transaction.id} for all rows missing one, in **array order** (one ingest batch: one scrape save, one import file, one AI parse, etc.).
 *
 * **Content-based rows** (no `externalId` on the txn): the first occurrence of a given content key in this batch uses
 * `MD5(contentKey)` — same as legacy single-row behavior. Further identical keys in the **same** batch use
 * `MD5(contentKey|1)`, `MD5(contentKey|2)`, … so two identical charges in one scrape both insert.
 *
 * A **later** batch (e.g. import) whose first occurrence matches the same content key still gets `MD5(contentKey)` for
 * its first row → `INSERT OR IGNORE` dedupes against an earlier scrape row.
 *
 * Rows with `txn.id` set (scraper opaque id) are skipped. Rows with `externalId` use {@link assignTransactionId} (no ordinal).
 */
export function assignBatchContentIdsFromTransactions(
    transactions: Transaction[],
    options?: { providerFallback?: string; accountFallback?: string }
): void {
    const seen = new Map<string, number>();
    for (const txn of transactions) {
        if (txn.id) continue;

        const prov = txn.provider || options?.providerFallback || 'unknown';
        const acc = txn.accountNumber || options?.accountFallback || 'unknown';

        const ext = txn.externalId?.trim();
        if (ext) {
            const a = assignTransactionId({
                existingId: undefined,
                externalId: ext,
                provider: prov,
                accountNumber: acc,
                date: txn.date,
                amount: txn.amount,
                chargedAmount: txn.chargedAmount,
                description: txn.description,
                sourceRef: txn.sourceRef,
            });
            txn.id = a.id;
            if (a.externalId) txn.externalId = a.externalId;
            if (a.sourceRef) txn.sourceRef = a.sourceRef;
            continue;
        }

        const key = buildContentTransactionKey(
            {
                date: txn.date,
                amount: txn.amount,
                chargedAmount: txn.chargedAmount,
                description: txn.description,
            },
            acc
        );
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        txn.id = n === 0 ? hashTransactionId(key) : hashTransactionId(`${key}|${n}`);
    }
}

/**
 * Convenience for a partial transaction during scrape/import (fills id + optional refs).
 */
export function assignTransactionIdFromTxn(
    txn: Pick<Transaction, 'date' | 'description' | 'provider' | 'accountNumber'> &
        Partial<Pick<Transaction, 'id' | 'amount' | 'chargedAmount' | 'externalId' | 'sourceRef'>>,
    options?: { sourceRef?: string | null }
): AssignTransactionIdResult {
    return assignTransactionId({
        existingId: txn.id || undefined,
        externalId: txn.externalId,
        sourceRef: options?.sourceRef ?? txn.sourceRef,
        provider: txn.provider,
        accountNumber: txn.accountNumber,
        date: txn.date,
        amount: txn.amount,
        chargedAmount: txn.chargedAmount,
        description: txn.description,
    });
}
