import { Page, Locator, expect } from '@playwright/test';

export class AppLockPage {
  readonly page: Page;
  readonly blockerGate: Locator;
  readonly blockerPasswordInput: Locator;
  readonly blockerUnlockButton: Locator;
  readonly bannerAlert: Locator;
  readonly bannerPasswordInput: Locator;
  readonly bannerUnlockButton: Locator;
  readonly lockNowButton: Locator;
  readonly setupPasswordInput: Locator;
  readonly setupConfirmInput: Locator;
  readonly setupSaveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.blockerGate = page.locator('text=App Locked, text=נעילת האפליקציה, .bg-slate-900.z-\\[9999\\]').first();
    this.blockerPasswordInput = page.locator('input#password');
    this.blockerUnlockButton = page.locator('form button[type="submit"]');

    this.bannerAlert = page.locator('role=alert, [role="alert"]').filter({ hasText: /נעול|lock|restricted/i }).first();
    this.bannerPasswordInput = page.locator('input#app-unlock-password');
    this.bannerUnlockButton = page.locator('form button:has-text("פתח נעילה"), form button:has-text("Unlock")').first();

    this.lockNowButton = page.locator('button:has-text("נעילה כעת"), button:has-text("Lock now")').first();
    this.setupPasswordInput = page.locator('input[placeholder*="סיסמה חדשה"], input[placeholder*="new_password"]').first();
    this.setupConfirmInput = page.locator('input[placeholder*="אימות"], input[placeholder*="confirm"]').first();
    this.setupSaveButton = page.locator('button:has-text("שמירת סיסמה"), button:has-text("Save")').first();
  }

  async isBlockerGateVisible(): Promise<boolean> {
    return await this.blockerPasswordInput.isVisible().catch(() => false);
  }

  async isBannerVisible(): Promise<boolean> {
    return (await this.bannerPasswordInput.isVisible().catch(() => false)) ||
           (await this.bannerAlert.isVisible().catch(() => false));
  }

  async isLockConfigured(): Promise<boolean> {
    const response = await this.page.request.get('/api/app-lock/status').catch(() => null);
    if (!response || !response.ok()) return false;
    const json = await response.json();
    return !!json.data?.lockConfigured;
  }

  async isRestricted(): Promise<boolean> {
    const response = await this.page.request.get('/api/app-lock/status').catch(() => null);
    if (!response || !response.ok()) return false;
    const json = await response.json();
    return !!json.data?.restricted;
  }

  async unlock(password: string): Promise<boolean> {
    if (await this.isBlockerGateVisible()) {
      await this.blockerPasswordInput.fill(password);
      await this.blockerUnlockButton.click();
      await this.page.waitForTimeout(500);
      return !(await this.isBlockerGateVisible());
    }

    if (await this.bannerPasswordInput.isVisible()) {
      await this.bannerPasswordInput.fill(password);
      await this.bannerUnlockButton.click();
      await this.page.waitForTimeout(500);
      return !(await this.bannerPasswordInput.isVisible());
    }

    // Direct API unlock fallback / verification
    const res = await this.page.request.post('/api/app-lock/unlock', {
      data: { password }
    }).catch(() => null);

    if (res && res.ok()) {
      const data = await res.json();
      if (data.token) {
        await this.page.evaluate((token) => {
          localStorage.setItem('app_session_token', token);
        }, data.token);
      }
      await this.page.goto('/', { waitUntil: 'domcontentloaded' });
      return true;
    }
    return false;
  }

  async lock(): Promise<void> {
    if (await this.lockNowButton.isVisible()) {
      await this.lockNowButton.click();
      await this.page.waitForTimeout(500);
    } else {
      await this.page.request.post('/api/app-lock/lock');
      await this.page.evaluate(() => localStorage.removeItem('app_session_token'));
      await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    }
  }

  async getErrorMessage(): Promise<string | null> {
    const errorEl = this.page.locator('.text-red-700, .text-red-600, .bg-red-50').first();
    if (await errorEl.isVisible()) {
      return await errorEl.innerText();
    }
    return null;
  }
}
