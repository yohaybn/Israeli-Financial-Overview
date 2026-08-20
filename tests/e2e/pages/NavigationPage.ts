import { Page, Locator } from '@playwright/test';

export class NavigationPage {
  readonly page: Page;
  readonly dashboardTab: Locator;
  readonly scrapeTab: Locator;
  readonly logsTab: Locator;
  readonly configTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dashboardTab = page.locator('nav[role="tablist"] button[role="tab"]').nth(0);
    this.scrapeTab = page.locator('nav[role="tablist"] button[role="tab"]').nth(1);
    this.logsTab = page.locator('nav[role="tablist"] button[role="tab"]').nth(2);
    this.configTab = page.locator('nav[role="tablist"] button[role="tab"]').nth(3);
  }

  async selectTab(tabKey: 'dashboard' | 'scrape' | 'logs' | 'configuration') {
    switch (tabKey) {
      case 'dashboard':
        await this.dashboardTab.click();
        break;
      case 'scrape':
        await this.scrapeTab.click();
        break;
      case 'logs':
        await this.logsTab.click();
        break;
      case 'configuration':
        await this.configTab.click();
        break;
    }
    await this.page.waitForTimeout(300);
  }

  async getActiveTabName(): Promise<string> {
    const activeTab = this.page.locator('nav[role="tablist"] button[aria-selected="true"]');
    return (await activeTab.innerText()).trim();
  }
}
