import axios from 'axios';
import type { BudgetExportDestinationConfig } from '@app/shared';
import type { Transaction } from '@app/shared';
import { localAccountKey } from './accountKey.js';

function isoDate(d: string): string {
  return (d || '').split('T')[0] || d;
}

function trimExternalId(id: string, max = 255): string {
  return id.length <= max ? id : id.slice(0, max);
}

export async function exportToFirefly(
  transactions: Transaction[],
  cfg: NonNullable<BudgetExportDestinationConfig & { expenseAccountName?: string }>,
  baseUrl: string,
  token: string
): Promise<{ pushed: number; skippedUnmapped: number; errors: string[] }> {
  const base = baseUrl.replace(/\/+$/, '');
  const client = axios.create({
    baseURL: `${base}/api/v1`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
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
    const sourceIdRaw = map[key];
    if (!sourceIdRaw) {
      skippedUnmapped++;
      continue;
    }
    const sourceId = parseInt(String(sourceIdRaw), 10);
    if (!Number.isFinite(sourceId)) {
      errors.push(`Firefly: invalid source_id for ${key}`);
      skippedUnmapped++;
      continue;
    }

    const amt = Number(txn.chargedAmount ?? txn.amount);
    const isIncome = amt > 0;
    const absStr = Math.abs(amt).toFixed(2);
    const desc = [txn.description, txn.memo].filter(Boolean).join(' — ') || 'Imported';

    const payload: Record<string, unknown> = {
      error_if_duplicate_hash: true,
      transactions: [
        {
          type: isIncome ? 'deposit' : 'withdrawal',
          date: isoDate(txn.date),
          amount: absStr,
          description: desc.slice(0, 1024),
          external_id: trimExternalId(txn.id),
          ...(cfg.expenseAccountName && !isIncome ? { destination_name: cfg.expenseAccountName } : {}),
          ...(txn.category ? { category_name: txn.category.slice(0, 1024) } : {}),
          ...(isIncome
            ? { destination_id: sourceId }
            : { source_id: sourceId }),
        },
      ],
    };

    try {
      await client.post('/transactions', payload);
      pushed++;
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.errors?.[0]?.message ||
        e?.message ||
        String(e);
      errors.push(`Firefly ${txn.id}: ${msg}`);
    }
  }

  return { pushed, skippedUnmapped, errors };
}
