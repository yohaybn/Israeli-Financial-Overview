import axios from 'axios';
import type { BudgetExportSecrets } from '@app/shared';
import {
  readBudgetExportSecrets,
  readBudgetExportSecretsFromDisk,
  writeBudgetExportSecretsPatch,
} from './budgetExportSecretsService.js';

const TOKEN_URL = 'https://app.ynab.com/oauth/token';
const AUTHORIZE_URL = 'https://app.ynab.com/oauth/authorize';

export function buildYnabAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

export async function exchangeYnabAuthorizationCode(
  code: string,
  redirectUri: string,
  ynab: NonNullable<BudgetExportSecrets['ynab']>
): Promise<{ refresh_token: string; access_token: string; expires_in: number }> {
  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('client_id', ynab.clientId!);
  params.set('redirect_uri', redirectUri);
  if (ynab.clientSecret) params.set('client_secret', ynab.clientSecret);

  const res = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  });
  return res.data;
}

/** Valid access token, refreshing and persisting when needed. */
export async function getValidYnabAccessToken(): Promise<string> {
  const secrets = await readBudgetExportSecrets();
  const yn = secrets.ynab;
  if (!yn?.refreshToken || !yn?.clientId) {
    throw new Error('YNAB OAuth not configured (missing refresh token or client id)');
  }

  const bufferMs = 120_000;
  if (yn.accessToken && yn.expiresAt && yn.expiresAt > Date.now() + bufferMs) {
    return yn.accessToken;
  }

  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', yn.refreshToken);
  params.set('client_id', yn.clientId);
  if (yn.clientSecret) params.set('client_secret', yn.clientSecret);

  const res = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  });

  const data = res.data;
  const expiresAt = Date.now() + (Number(data.expires_in) || 7200) * 1000;
  const disk = await readBudgetExportSecretsFromDisk();
  const nextRefresh = (data.refresh_token as string) || yn.refreshToken;
  await writeBudgetExportSecretsPatch({
    ynab: {
      ...disk.ynab,
      refreshToken: nextRefresh,
      accessToken: data.access_token,
      expiresAt,
    },
  });

  return data.access_token as string;
}
