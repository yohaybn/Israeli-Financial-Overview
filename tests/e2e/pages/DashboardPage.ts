import { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly monthSelector: Locator;
  readonly quickSummaries: Locator;
  readonly portfolioSection: Locator;

  constructor(page: Page) {
    this.page = page;
    this.monthSelector = page.locator('button:has-text("202"), select, [aria-label*="month"], [aria-label*="חודש"]').first();
    this.quickSummaries = page.locator('.grid, [data-testid="summary-cards"]');
    this.portfolioSection = page.locator('text="תיק השקעות", text="Portfolio", text="נכסים"').first();
  }

  async isLoaded(): Promise<boolean> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    return (await this.page.locator('h1, h2, nav[role="tablist"]').first().isVisible());
  }

  async getHeadingText(): Promise<string> {
    const heading = this.page.locator('h1, h2').first();
    if (await heading.isVisible()) {
      return (await heading.innerText()).trim();
    }
    return '';
  }
}
