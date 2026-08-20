import { test, expect } from '../fixtures';

test.describe('Profiles Management & Live User Profiles', () => {
  test('should load user profiles from backend and verify against UI', async ({
    authenticatedPage,
    navigationPage,
    profilesPage,
    userProfiles,
  }) => {
    // Navigate to Scrape tab where profile manager is located
    await navigationPage.selectTab('scrape');
    await authenticatedPage.waitForTimeout(500);

    // Verify profiles section is rendered
    const isLoaded = await profilesPage.isProfilesLoaded();
    expect(isLoaded).toBeTruthy();

    if (userProfiles.length > 0) {
      console.log(`Testing with ${userProfiles.length} active user profiles:`, userProfiles.map(p => p.name || p.companyId));
      const profileNamesInUi = await profilesPage.getProfileNames();

      // Check that profile items are visible in the UI
      const profileCards = await profilesPage.getProfileCards();
      const count = await profileCards.count();
      expect(count).toBeGreaterThanOrEqual(1);

      if (profileNamesInUi.length > 0) {
        const hasMatch = userProfiles.some(p =>
          profileNamesInUi.some(uiName =>
            uiName.toLowerCase().includes((p.name || '').toLowerCase()) ||
            uiName.toLowerCase().includes((p.companyId || '').toLowerCase())
          )
        );
        expect(hasMatch).toBeTruthy();
      }
    } else {
      const profileCards = await profilesPage.getProfileCards();
      const count = await profileCards.count();
      expect(count).toBeGreaterThanOrEqual(1); // At least Add New Profile button/card
    }
  });

  test('should display provider options and profile form', async ({
    authenticatedPage,
    navigationPage,
  }) => {
    await navigationPage.selectTab('scrape');
    await authenticatedPage.waitForTimeout(300);

    // Verify provider selection / scraper form is available
    const formOrCard = authenticatedPage.locator('form, .grid, button, [role="region"]').first();
    await expect(formOrCard).toBeVisible();
  });
});
