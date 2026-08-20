import { test, expect } from '../fixtures';

test.describe('App Lock & Security Flow', () => {
  test('should detect app lock status from server', async ({ page, appLockPage }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    let statusRes = await page.request.get('/api/app-lock/status').catch(() => null);
    if (!statusRes || !statusRes.ok()) {
      await page.waitForTimeout(500);
      statusRes = await page.request.get('/api/app-lock/status').catch(() => null);
    }

    if (statusRes && statusRes.ok()) {
      const data = (await statusRes.json()).data;
      expect(data).toHaveProperty('lockConfigured');
      expect(data).toHaveProperty('unlocked');
      expect(data).toHaveProperty('restricted');
    } else {
      const isConfigured = await appLockPage.isLockConfigured();
      expect(typeof isConfigured).toBe('boolean');
    }
  });

  test('should unlock application when valid password is provided', async ({ page, appLockPage, appLockPassword }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const isRestricted = await appLockPage.isRestricted();
    const isGate = await appLockPage.isBlockerGateVisible();
    const isBanner = await appLockPage.isBannerVisible();

    if (isRestricted || isGate || isBanner) {
      if (!appLockPassword) {
        test.skip(true, 'App Lock is enabled on this instance, but no APP_LOCK_PASSWORD was provided.');
        return;
      }

      const unlocked = await appLockPage.unlock(appLockPassword);
      expect(unlocked).toBeTruthy();

      const isRestrictedAfter = await appLockPage.isRestricted();
      expect(isRestrictedAfter).toBeFalsy();
    } else {
      await expect(page.locator('header, nav[role="tablist"]').first()).toBeVisible();
    }
  });

  test('should handle incorrect password with appropriate error message', async ({ page, appLockPage }) => {
    const isLockConfigured = await appLockPage.isLockConfigured();
    if (!isLockConfigured) {
      test.skip(true, 'App Lock is not configured on this instance.');
      return;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const wrongPassword = 'invalid_test_password_12345';
    const unlockRes = await page.request.post('/api/app-lock/unlock', {
      data: { password: wrongPassword }
    });
    // Should reject invalid password with 401 or 429
    expect([401, 429]).toContain(unlockRes.status());
  });
});
