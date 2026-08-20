import { Page, Locator } from '@playwright/test';

export class ProfilesPage {
  readonly page: Page;
  readonly profileList: Locator;
  readonly addProfileButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileList = page.locator('.grid');
    this.addProfileButton = page.locator('text="פרופיל חדש", text="New Profile", text="Add New Profile"').first();
  }

  async getProfileCards(): Promise<Locator> {
    return this.page.locator('.grid > div');
  }

  async getProfileNames(): Promise<string[]> {
    const cards = await this.page.locator('.grid > div .font-semibold, .grid > div .font-bold, .grid > div .truncate').all();
    const names: string[] = [];
    for (const card of cards) {
      const text = (await card.innerText()).trim();
      if (text) names.push(text);
    }
    return names;
  }

  async isProfilesLoaded(): Promise<boolean> {
    return !(await this.page.locator('text="טוען פרופילים...", text="Loading profiles..."').isVisible().catch(() => false));
  }
}
