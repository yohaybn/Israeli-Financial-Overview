import axios from 'axios';
import * as crypto from 'crypto';
import type { BudgetExportsConfig } from '@app/shared';
import type { Transaction } from '@app/shared';
import { localAccountKey } from './accountKey.js';
import { getValidYnabAccessToken } from './ynabAuth.js';

function isoDate(d: string): string {
  return (d || '').split('T')[0] || d;
}

/** YNAB import_id max 36 characters */
function ynabImportId(txnId: string): string {
  return crypto.createHash('sha256').update(txnId).digest('hex').slice(0, 36);
}

/** Amount in YNAB milliunits (e.g. ₪10.00 → 10000). */
function toMilliunits(amountIls: number): number {
  return Math.round(amountIls * 1000);
}

export async function exportToYnab(
  transactions: Transaction[],
  cfg: NonNullable<BudgetExportsConfig['ynab']>,
  budgetId: string
): Promise<{ pushed: number; skippedUnmapped: number; errors: string[] }> {
  const token = await getValidYnabAccessToken();
  const client = axios.create({
    baseURL: 'https://api.youneedabudget.com/v1',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  });

  const map = cfg.accountMap || {};
  let pushed = 0;
  let skippedUnmapped = 0;
  const errors: string[] = [];

  for (const txn of transactions) {
    const key = localAccountKey(txn);
    const accountId = map[key];
    if (!accountId) {
      skippedUnmapped++;
      continue;
    }

    const amt = Number(txn.chargedAmount ?? txn.amount);
    const milli = toMilliunits(amt);
    const desc = [txn.description, txn.memo].filter(Boolean).join(' — ') || 'Imported';

    const body = {
      transactions: [
        {
          account_id: accountId,
          date: isoDate(txn.date),
          amount: milli,
          payee_name: txn.description?.slice(0, 200) || 'Imported',
          memo: desc.slice(0, 500),
          cleared: 'cleared',
          approved: true,
          import_id: ynabImportId(txn.id),
        },
      ],
    };

    try {
      await client.post(`/budgets/${budgetId}/transactions`, body);
      pushed++;
    } catch (e: any) {
      const msg =
        e?.response?.data?.error?.detail ||
        e?.response?.data?.error?.id ||
        e?.message ||
        String(e);
      errors.push(`YNAB ${txn.id}: ${msg}`);
    }
  }

  return { pushed, skippedUnmapped, errors };
}
