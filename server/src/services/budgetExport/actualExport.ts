import path from 'path';
import { createRequire } from 'module';
import type { BudgetExportDestinationConfig } from '@app/shared';
import type { Transaction } from '@app/shared';
import { localAccountKey } from './accountKey.js';

const requireActual = createRequire(import.meta.url);

function isoDate(d: string): string {
  return (d || '').split('T')[0] || d;
}

/** ILS to integer minor units (agorot). */
function ilsToMinorUnits(amountIls: number): number {
  return Math.round(amountIls * 100);
}

export async function exportToActualBudget(
  transactions: Transaction[],
  cfg: BudgetExportDestinationConfig,
  serverUrl: string,
  password: string,
  syncId: string,
  dataDir: string
): Promise<{ pushed: number; skippedUnmapped: number; errors: string[] }> {
  let api: any;
  try {
    api = requireActual('@actual-app/api');
  } catch {
    return {
      pushed: 0,
      skippedUnmapped: 0,
      errors: ['@actual-app/api is not installed on the server (npm install in server folder).'],
    };
  }

  const map = cfg.accountMap || {};
  let pushed = 0;
  let skippedUnmapped = 0;
  const errors: string[] = [];

  const actualDataDir = path.join(dataDir, 'actual_api_workdir');
  const fse = await import('fs-extra');
  await fse.ensureDir(actualDataDir);

  try {
    await api.init({
      dataDir: actualDataDir,
      serverURL: serverUrl.replace(/\/+$/, ''),
      password,
    });
    await api.downloadBudget(syncId, { password });

    for (const txn of transactions) {
      const key = localAccountKey(txn);
      const accountId = map[key];
      if (!accountId) {
        skippedUnmapped++;
        continue;
      }

      const amt = Number(txn.chargedAmount ?? txn.amount);
      const desc = [txn.description, txn.memo].filter(Boolean).join(' — ') || 'Imported';

      try {
        await api.importTransactions(accountId, [
          {
            account: accountId,
            date: isoDate(txn.date),
            amount: ilsToMinorUnits(amt),
            payee_name: txn.description?.slice(0, 200) || 'Imported',
            notes: desc.slice(0, 500),
            imported_id: txn.id.slice(0, 200),
            cleared: true,
          },
        ]);
        pushed++;
      } catch (e: any) {
        errors.push(`Actual ${txn.id}: ${e?.message || String(e)}`);
      }
    }
  } catch (e: any) {
    errors.push(`Actual: ${e?.message || String(e)}`);
  } finally {
    try {
      if (api?.shutdown) await api.shutdown();
    } catch {
      /* ignore */
    }
  }

  return { pushed, skippedUnmapped, errors };
}
