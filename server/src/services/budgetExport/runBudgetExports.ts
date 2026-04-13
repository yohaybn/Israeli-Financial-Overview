import path from 'path';
import type { PostScrapeConfig } from '@app/shared';
import type { Transaction } from '@app/shared';
import type { ScrapeRunActionRecord } from '../../utils/scrapeRunLogger.js';
import { readBudgetExportSecrets } from './budgetExportSecretsService.js';
import { transactionsForBudgetExport } from './filterTransactions.js';
import { exportToFirefly } from './fireflyExport.js';
import { exportToLunchMoney } from './lunchMoneyExport.js';
import { exportToYnab } from './ynabExport.js';
import { exportToActualBudget } from './actualExport.js';

function summarize(r: { pushed: number; skippedUnmapped: number; errors: string[] }): string {
  const parts = [`pushed=${r.pushed}`, `skipped_unmapped=${r.skippedUnmapped}`];
  if (r.errors.length) parts.push(`errors=${r.errors.length}`);
  const head = parts.join(', ');
  if (r.errors[0]) return `${head}; ${r.errors[0].slice(0, 200)}`;
  return head;
}

export async function runBudgetExports(
  cfg: PostScrapeConfig,
  transactions: Transaction[]
): Promise<ScrapeRunActionRecord[]> {
  const actions: ScrapeRunActionRecord[] = [];
  const be = cfg.budgetExports || {};
  const scoped = transactionsForBudgetExport(transactions);
  if (scoped.length === 0) {
    actions.push({ key: 'export-firefly', status: 'skipped', detail: 'no eligible transactions' });
    actions.push({ key: 'export-lunch-money', status: 'skipped', detail: 'no eligible transactions' });
    actions.push({ key: 'export-ynab', status: 'skipped', detail: 'no eligible transactions' });
    actions.push({ key: 'export-actual', status: 'skipped', detail: 'no eligible transactions' });
    return actions;
  }

  const secrets = await readBudgetExportSecrets();
  const dataDir = path.resolve(process.env.DATA_DIR || './data');

  // Firefly III
  if (!be.firefly?.enabled) {
    actions.push({ key: 'export-firefly', status: 'skipped' });
  } else if (!secrets.firefly?.baseUrl || !secrets.firefly?.token) {
    actions.push({
      key: 'export-firefly',
      status: 'skipped_no_key',
      detail: 'Firefly base URL or token not configured',
    });
  } else {
    try {
      const r = await exportToFirefly(scoped, be.firefly, secrets.firefly.baseUrl, secrets.firefly.token);
      actions.push({
        key: 'export-firefly',
        status: r.errors.length ? 'partial' : 'ok',
        detail: summarize(r),
      });
    } catch (e: any) {
      actions.push({ key: 'export-firefly', status: 'failed', detail: e?.message || String(e) });
    }
  }

  // Lunch Money
  if (!be.lunchMoney?.enabled) {
    actions.push({ key: 'export-lunch-money', status: 'skipped' });
  } else if (!secrets.lunchMoney?.token) {
    actions.push({
      key: 'export-lunch-money',
      status: 'skipped_no_key',
      detail: 'Lunch Money token not configured',
    });
  } else {
    try {
      const r = await exportToLunchMoney(scoped, be.lunchMoney, secrets.lunchMoney.token);
      actions.push({
        key: 'export-lunch-money',
        status: r.errors.length ? 'partial' : 'ok',
        detail: summarize(r),
      });
    } catch (e: any) {
      actions.push({ key: 'export-lunch-money', status: 'failed', detail: e?.message || String(e) });
    }
  }

  // YNAB
  if (!be.ynab?.enabled) {
    actions.push({ key: 'export-ynab', status: 'skipped' });
  } else if (!be.ynab?.budgetId) {
    actions.push({
      key: 'export-ynab',
      status: 'skipped',
      detail: 'YNAB budget id not set in config',
    });
  } else if (!secrets.ynab?.refreshToken || !secrets.ynab?.clientId) {
    actions.push({
      key: 'export-ynab',
      status: 'skipped_no_key',
      detail: 'YNAB OAuth not completed (client id / refresh token)',
    });
  } else {
    try {
      const r = await exportToYnab(scoped, be.ynab, be.ynab.budgetId);
      actions.push({
        key: 'export-ynab',
        status: r.errors.length ? 'partial' : 'ok',
        detail: summarize(r),
      });
    } catch (e: any) {
      actions.push({ key: 'export-ynab', status: 'failed', detail: e?.message || String(e) });
    }
  }

  // Actual Budget
  if (!be.actual?.enabled) {
    actions.push({ key: 'export-actual', status: 'skipped' });
  } else if (!secrets.actual?.serverUrl || !secrets.actual?.password || !secrets.actual?.syncId) {
    actions.push({
      key: 'export-actual',
      status: 'skipped_no_key',
      detail: 'Actual server URL, password, or sync id not configured',
    });
  } else {
    try {
      const r = await exportToActualBudget(
        scoped,
        be.actual,
        secrets.actual.serverUrl,
        secrets.actual.password,
        secrets.actual.syncId,
        dataDir
      );
      actions.push({
        key: 'export-actual',
        status: r.errors.length ? 'partial' : 'ok',
        detail: summarize(r),
      });
    } catch (e: any) {
      actions.push({ key: 'export-actual', status: 'failed', detail: e?.message || String(e) });
    }
  }

  return actions;
}
