import fs from 'fs-extra';
import path from 'path';
import type { BudgetExportSecrets } from '@app/shared';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const SECRETS_PATH = path.join(DATA_DIR, 'config', 'budget_export_secrets.json');

function mergeEnv(secrets: BudgetExportSecrets): BudgetExportSecrets {
  const out: BudgetExportSecrets = { ...secrets };
  const ff = { ...out.firefly };
  if (process.env.FIREFLY_BASE_URL) ff.baseUrl = process.env.FIREFLY_BASE_URL;
  if (process.env.FIREFLY_TOKEN) ff.token = process.env.FIREFLY_TOKEN;
  if (ff.baseUrl || ff.token) out.firefly = ff;

  const lm = { ...out.lunchMoney };
  if (process.env.LUNCHMONEY_TOKEN) lm.token = process.env.LUNCHMONEY_TOKEN;
  if (lm.token) out.lunchMoney = lm;

  const yn = { ...out.ynab };
  if (process.env.YNAB_CLIENT_ID) yn.clientId = process.env.YNAB_CLIENT_ID;
  if (process.env.YNAB_CLIENT_SECRET) yn.clientSecret = process.env.YNAB_CLIENT_SECRET;
  if (process.env.YNAB_REDIRECT_URI) yn.redirectUri = process.env.YNAB_REDIRECT_URI;
  if (process.env.YNAB_REFRESH_TOKEN) yn.refreshToken = process.env.YNAB_REFRESH_TOKEN;
  if (yn.clientId || yn.refreshToken) out.ynab = yn;

  const ac = { ...out.actual };
  if (process.env.ACTUAL_SERVER_URL) ac.serverUrl = process.env.ACTUAL_SERVER_URL;
  if (process.env.ACTUAL_PASSWORD) ac.password = process.env.ACTUAL_PASSWORD;
  if (process.env.ACTUAL_SYNC_ID) ac.syncId = process.env.ACTUAL_SYNC_ID;
  if (ac.serverUrl || ac.password || ac.syncId) out.actual = ac;

  return out;
}

export async function readBudgetExportSecretsFromDisk(): Promise<BudgetExportSecrets> {
  try {
    if (await fs.pathExists(SECRETS_PATH)) {
      return (await fs.readJson(SECRETS_PATH)) as BudgetExportSecrets;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export async function readBudgetExportSecrets(): Promise<BudgetExportSecrets> {
  const base = await readBudgetExportSecretsFromDisk();
  return mergeEnv(base);
}

/** Merge patch into existing file-backed secrets and persist (undefined omits that key in spread). */
export async function writeBudgetExportSecretsPatch(patch: BudgetExportSecrets): Promise<void> {
  const current = await readBudgetExportSecretsFromDisk();
  const merged: BudgetExportSecrets = {
    firefly: { ...current.firefly, ...patch.firefly },
    lunchMoney: { ...current.lunchMoney, ...patch.lunchMoney },
    ynab: { ...current.ynab, ...patch.ynab },
    actual: { ...current.actual, ...patch.actual },
  };
  await fs.ensureDir(path.dirname(SECRETS_PATH));
  await fs.writeJson(SECRETS_PATH, merged, { spaces: 2 });
}

/** Status for UI: which destinations have non-empty secret material (masked). */
export async function getBudgetExportSecretsStatus(): Promise<{
  firefly: boolean;
  lunchMoney: boolean;
  ynab: { configured: boolean; oauthReady: boolean };
  actual: boolean;
}> {
  const s = await readBudgetExportSecrets();
  return {
    firefly: Boolean(s.firefly?.baseUrl && s.firefly?.token),
    lunchMoney: Boolean(s.lunchMoney?.token),
    ynab: {
      configured: Boolean(s.ynab?.refreshToken),
      oauthReady: Boolean(s.ynab?.clientId && s.ynab?.redirectUri),
    },
    actual: Boolean(s.actual?.serverUrl && s.actual?.password && s.actual?.syncId),
  };
}
