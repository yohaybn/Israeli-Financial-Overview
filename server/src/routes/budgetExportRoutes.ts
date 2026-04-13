import { Router } from 'express';
import type { BudgetExportsConfig, BudgetExportSecrets, GlobalScrapeConfig } from '@app/shared';
import { StorageService } from '../services/storageService.js';
import {
  getBudgetExportSecretsStatus,
  readBudgetExportSecretsFromDisk,
  writeBudgetExportSecretsPatch,
} from '../services/budgetExport/budgetExportSecretsService.js';
import { buildYnabAuthorizeUrl, exchangeYnabAuthorizationCode } from '../services/budgetExport/ynabAuth.js';
import {
  consumeYnabOAuthState,
  createYnabOAuthState,
} from '../services/budgetExport/ynabOAuthStateStore.js';
import { serverLogger } from '../utils/logger.js';

const storageService = new StorageService();

/** Only http(s) origins — avoids odd schemes if redirect URI in secrets is malformed. */
function originFromRedirectUri(redirectUri: string): string {
  try {
    const u = new URL(redirectUri);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

function deepMergeBudgetExports(
  current: GlobalScrapeConfig['postScrapeConfig']['budgetExports'],
  patch: BudgetExportsConfig
): BudgetExportsConfig {
  return {
    ...current,
    ...patch,
    firefly: {
      ...current?.firefly,
      ...patch.firefly,
      accountMap: { ...current?.firefly?.accountMap, ...patch.firefly?.accountMap },
    },
    lunchMoney: {
      ...current?.lunchMoney,
      ...patch.lunchMoney,
      accountMap: { ...current?.lunchMoney?.accountMap, ...patch.lunchMoney?.accountMap },
    },
    ynab: {
      ...current?.ynab,
      ...patch.ynab,
      accountMap: { ...current?.ynab?.accountMap, ...patch.ynab?.accountMap },
    },
    actual: {
      ...current?.actual,
      ...patch.actual,
      accountMap: { ...current?.actual?.accountMap, ...patch.actual?.accountMap },
    },
  };
}

export function createBudgetExportRoutes(): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    try {
      const status = await getBudgetExportSecretsStatus();
      res.json({ success: true, data: status });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || String(e) });
    }
  });

  router.get('/public-config', async (_req, res) => {
    try {
      const global = await storageService.getGlobalScrapeConfig();
      res.json({ success: true, data: global.postScrapeConfig.budgetExports || {} });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || String(e) });
    }
  });

  router.put('/public-config', async (req, res) => {
    try {
      const patch = req.body as BudgetExportsConfig;
      const global = await storageService.getGlobalScrapeConfig();
      global.postScrapeConfig = {
        ...global.postScrapeConfig,
        budgetExports: deepMergeBudgetExports(global.postScrapeConfig.budgetExports, patch || {}),
      };
      const next = await storageService.updateGlobalScrapeConfig(global);
      res.json({ success: true, data: next.postScrapeConfig.budgetExports || {} });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || String(e) });
    }
  });

  router.post('/secrets', async (req, res) => {
    try {
      const patch = req.body as BudgetExportSecrets;
      await writeBudgetExportSecretsPatch(patch || {});
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || String(e) });
    }
  });

  router.get('/ynab/authorize-url', async (_req, res) => {
    try {
      const disk = await readBudgetExportSecretsFromDisk();
      const yn = disk.ynab;
      if (!yn?.clientId || !yn?.redirectUri) {
        return res.status(400).json({
          success: false,
          error: 'YNAB client id and redirect URI must be saved in secrets first',
        });
      }
      const state = createYnabOAuthState();
      const url = buildYnabAuthorizeUrl(yn.clientId, yn.redirectUri, state);
      res.json({ success: true, data: { url, state } });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || String(e) });
    }
  });

  router.get('/ynab/callback', async (req, res) => {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!code || !state) {
        return res.status(400).send('Missing code or state');
      }
      if (!consumeYnabOAuthState(state)) {
        return res.status(400).send('Invalid or expired OAuth state');
      }
      const disk = await readBudgetExportSecretsFromDisk();
      const yn = disk.ynab;
      if (!yn?.clientId || !yn?.redirectUri) {
        return res.status(400).send('YNAB not configured');
      }
      const tokenPayload = await exchangeYnabAuthorizationCode(code, yn.redirectUri, yn);
      const expiresAt = Date.now() + (Number(tokenPayload.expires_in) || 7200) * 1000;
      await writeBudgetExportSecretsPatch({
        ynab: {
          ...disk.ynab,
          refreshToken: tokenPayload.refresh_token,
          accessToken: tokenPayload.access_token,
          expiresAt,
        },
      });
      const origin = originFromRedirectUri(yn.redirectUri);
      const target = origin
        ? `${origin}/?view=configuration&tab=budget-exports&ynab=connected`
        : '/?view=configuration&tab=budget-exports&ynab=connected';
      res.redirect(302, target);
    } catch (e: unknown) {
      serverLogger.error('YNAB OAuth callback failed', { error: e });
      res
        .status(500)
        .type('text/plain')
        .send('YNAB authorization failed. Try again from the app, or check server logs if the problem continues.');
    }
  });

  return router;
}
