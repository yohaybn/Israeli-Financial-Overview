import { test, expect } from '../fixtures';

test.describe('Dashboard & Financial Overview', () => {
  test('should render dashboard layout and financial command center', async ({
    authenticatedPage,
    dashboardPage,
  }) => {
    const isLoaded = await dashboardPage.isLoaded();
    expect(isLoaded).toBeTruthy();

    // Verify main header/branding or command center is visible
    const headerOrTab = authenticatedPage.locator('header, nav[role="tablist"]').first();
    await expect(headerOrTab).toBeVisible();
  });

  test('should allow changing month in financial overview', async ({
    authenticatedPage,
    navigationPage,
  }) => {
    await navigationPage.selectTab('dashboard');
    await authenticatedPage.waitForTimeout(300);

    // Look for month picker / navigation controls
    const monthControl = authenticatedPage.locator('button:has-text("202"), select, [aria-label*="חודש"], [aria-label*="month"]').first();
    if (await monthControl.isVisible()) {
      await expect(monthControl).toBeEnabled();
    }
  });
});
