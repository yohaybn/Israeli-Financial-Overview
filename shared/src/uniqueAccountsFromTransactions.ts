import type { Transaction } from './types.js';
import { PROVIDERS } from './providers.js';

/** One row per distinct provider + account (stable sort: account number, then provider). */
export type UniqueAccountRow = { provider: string; accountNumber: string };

/**
 * Unique provider + account pairs from transactions (aligned with the transaction table account filter keys).
 */
export function uniqueAccountsFromTransactions(transactions: Transaction[]): UniqueAccountRow[] {
    const byKey = new Map<string, UniqueAccountRow>();
    for (const t of transactions) {
        const provider = t.provider ?? '';
        const accountNumber = t.accountNumber ?? '';
        const key = `${provider}|${accountNumber}`;
        if (!byKey.has(key)) {
            byKey.set(key, { provider, accountNumber });
        }
    }
    return Array.from(byKey.values()).sort((a, b) => {
        const acctCmp = a.accountNumber.localeCompare(b.accountNumber, undefined, {
            numeric: true,
            sensitivity: 'base',
        });
        if (acctCmp !== 0) return acctCmp;
        return a.provider.localeCompare(b.provider, undefined, { sensitivity: 'base' });
    });
}

function normalizeAccountGroupKey(accountNumber: string): string {
    return (accountNumber ?? '').trim().toLowerCase();
}

/**
 * Merge rows that share the same account number when one row uses a registered provider id
 * and others use imports / unknown / custom ids — keep the official provider for display.
 * If two or more distinct registered providers share the same account string, keep all rows (do not merge).
 */
export function consolidateAccountRowsForDisplay(rows: UniqueAccountRow[]): UniqueAccountRow[] {
    const officialIds = new Set(PROVIDERS.map((p) => p.id));
    const byAcct = new Map<string, UniqueAccountRow[]>();
    for (const r of rows) {
        const k = normalizeAccountGroupKey(r.accountNumber);
        const list = byAcct.get(k) ?? [];
        list.push(r);
        byAcct.set(k, list);
    }
    const out: UniqueAccountRow[] = [];
    for (const [, members] of byAcct) {
        if (members.length === 1) {
            out.push(members[0]);
            continue;
        }
        const providers = [...new Set(members.map((m) => m.provider))];
        const officialPresent = providers.map((p) => p.trim()).filter((p) => p && officialIds.has(p)).sort();
        if (officialPresent.length > 1) {
            members.sort((a, b) => a.provider.localeCompare(b.provider));
            out.push(...members);
            continue;
        }
        if (officialPresent.length === 1) {
            const canonical = officialPresent[0];
            const pick =
                members.find((m) => m.provider.trim() === canonical) ??
                members.find((m) => officialIds.has(m.provider.trim())) ??
                members[0];
            out.push({ provider: canonical, accountNumber: pick.accountNumber });
            continue;
        }
        const sortedP = [...providers].sort((a, b) => a.localeCompare(b));
        const pickP = sortedP[0] ?? '';
        out.push(members.find((m) => m.provider === pickP) ?? members[0]);
    }
    return out.sort((a, b) => {
        const acctCmp = a.accountNumber.localeCompare(b.accountNumber, undefined, {
            numeric: true,
            sensitivity: 'base',
        });
        if (acctCmp !== 0) return acctCmp;
        return a.provider.localeCompare(b.provider, undefined, { sensitivity: 'base' });
    });
}
