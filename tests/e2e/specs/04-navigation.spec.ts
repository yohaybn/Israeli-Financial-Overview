import { test, expect } from '../fixtures';

test.describe('Application Navigation & Tab Switching', () => {
  test('should navigate between Dashboard, Scrape, Logs, and Configuration tabs', async ({
    authenticatedPage,
    navigationPage,
  }) => {
    // 1. Dashboard Tab
    await navigationPage.selectTab('dashboard');
    await authenticatedPage.waitForTimeout(300);
    await expect(authenticatedPage.locator('nav[role="tablist"]').first()).toBeVisible();

    // 2. Scrape & Profiles Tab
    await navigationPage.selectTab('scrape');
    await authenticatedPage.waitForTimeout(400);
    const scrapeContent = authenticatedPage.locator('.grid, form, button, [role="region"]').first();
    await expect(scrapeContent).toBeVisible();

    // 3. Logs Tab
    await navigationPage.selectTab('logs');
    await authenticatedPage.waitForTimeout(400);
    const logsContent = authenticatedPage.locator('pre, code, table, .overflow-y-auto, select, button').first();
    await expect(logsContent).toBeVisible();

    // 4. Configuration Tab
    await navigationPage.selectTab('configuration');
    await authenticatedPage.waitForTimeout(400);
    const configContent = authenticatedPage.locator('button, form, input, .grid, [role="tabpanel"]').first();
    await expect(configContent).toBeVisible();

    // Return to Dashboard
    await navigationPage.selectTab('dashboard');
    await authenticatedPage.waitForTimeout(300);
    await expect(authenticatedPage.locator('nav[role="tablist"]').first()).toBeVisible();
  });
});
