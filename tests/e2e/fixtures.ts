import { test as base, Page } from '@playwright/test';
import { AppLockPage } from './pages/AppLockPage';
import { NavigationPage } from './pages/NavigationPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { DashboardPage } from './pages/DashboardPage';

export interface UserProfileSummary {
  id?: string;
  name: string;
  companyId: string;
  hasCredentials?: boolean;
}

type CustomFixtures = {
  appLockPassword: string;
  appLockPage: AppLockPage;
  navigationPage: NavigationPage;
  profilesPage: ProfilesPage;
  dashboardPage: DashboardPage;
  userProfiles: UserProfileSummary[];
  authenticatedPage: Page;
};

export const test = base.extend<CustomFixtures>({
  appLockPassword: [
    async ({}, use) => {
      const password = process.env.APP_LOCK_PASSWORD || '';
      await use(password);
    },
    { auto: true },
  ],

  appLockPage: async ({ page }, use) => {
    await use(new AppLockPage(page));
  },

  navigationPage: async ({ page }, use) => {
    await use(new NavigationPage(page));
  },

  profilesPage: async ({ page }, use) => {
    await use(new ProfilesPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  userProfiles: async ({ request }, use) => {
    let profiles: UserProfileSummary[] = [];
    try {
      const res = await request.get('/api/profiles');
      if (res.ok()) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          profiles = json.data.map((p: any) => ({
            id: p.id,
            name: p.name || p.companyId,
            companyId: p.companyId,
            hasCredentials: !!p.credentials,
          }));
        }
      }
    } catch {
      // Backend may not be reachable or locked
    }
    await use(profiles);
  },

  authenticatedPage: async ({ page, appLockPassword }, use) => {
    // Pre-seed completed onboarding and tour flags in localStorage so modal dialogs don't block tests
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'bank-scraper-onboarding-v1',
          JSON.stringify({
            v: 1,
            completed: true,
            minimized: false,
            stepId: 'done',
            wizardLayoutVersion: 6,
          })
        );
        localStorage.setItem(
          'bank-scraper-getting-started-v1',
          JSON.stringify({
            v: 2,
            completed: true,
            step: 7,
            minimized: false,
          })
        );
      } catch {
        // In case localStorage is restricted
      }
    });

    await page.goto('/');
    const appLock = new AppLockPage(page);

    // If app lock is required and password is provided, attempt unlock
    if (appLockPassword) {
      const isGate = await appLock.isBlockerGateVisible();
      const isBanner = await appLock.isBannerVisible();
      if (isGate || isBanner) {
        await appLock.unlock(appLockPassword);
      }
    }

    await use(page);
  },
});

export { expect } from '@playwright/test';
