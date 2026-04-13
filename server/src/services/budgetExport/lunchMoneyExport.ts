import axios from 'axios';
import type { BudgetExportDestinationConfig } from '@app/shared';
import type { Transaction } from '@app/shared';
import { localAccountKey } from './accountKey.js';

const LM_BASE = 'https://dev.lunchmoney.app/v1';

function isoDate(d: string): string {
  return (d || '').split('T')[0] || d;
}

/** Lunch Money external_id max length — trim if needed */
function externalId(id: string): string {
  return id.length <= 75 ? id : id.slice(0, 75);
}

export async function exportToLunchMoney(
  transactions: Transaction[],
  cfg: BudgetExportDestinationConfig,
  token: string
): Promise<{ pushed: number; skippedUnmapped: number; errors: string[] }> {
  const client = axios.create({
    baseURL: LM_BASE,
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
    const assetRaw = map[key];
    if (!assetRaw) {
      skippedUnmapped++;
      continue;
    }
    const assetId = parseInt(String(assetRaw), 10);
    if (!Number.isFinite(assetId)) {
      errors.push(`Lunch Money: invalid asset_id for ${key}`);
      skippedUnmapped++;
      continue;
    }

    const amt = Number(txn.chargedAmount ?? txn.amount);
    const desc = [txn.description, txn.memo].filter(Boolean).join(' — ') || 'Imported';

    const body = {
      transactions: [
        {
          date: isoDate(txn.date),
          amount: amt,
          currency: 'ils',
          asset_id: assetId,
          notes: desc.slice(0, 350),
          external_id: externalId(txn.id),
          status: 'cleared',
        },
      ],
    };

    try {
      await client.post('/transactions', body);
      pushed++;
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        String(e);
      errors.push(`Lunch Money ${txn.id}: ${msg}`);
    }
  }

  return { pushed, skippedUnmapped, errors };
}
