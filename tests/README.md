# 🧪 End-to-End Browser Testing Suite

This directory contains the Playwright-based browser test suite for the **Israeli Financial Overview** application.

---

## 🌟 Features

- **Real Browser Execution:** Runs directly against real browser engines (Chromium) in headless or headed modes.
- **App Lock Password Integration:** Seamlessly tests locked/unlocked state using user-supplied passwords via interactive prompt, command-line arguments, or environment variables.
- **Live User Profile Validation:** Dynamically queries `/api/profiles` and verifies that active user profiles and providers appear correctly in the UI.
- **Automated Reporting:** Generates both an interactive HTML report (`playwright-report/index.html`) and a clean Markdown test summary (`test-report.md`).
- **Extensible Architecture:** Designed with the **Page Object Model (POM)** pattern and custom fixtures to make adding new tests fast and simple.

---

## 🚀 Running Tests

### 1. Interactive Runner (Recommended)
Prompts for the App Lock password (if needed) and runs the test suite:
```bash
npm run test:browser
```

### 2. Pass Password Directly
```bash
# Via argument
node scripts/run-browser-tests.mjs --password "your_secret_password"

# Via runner in UI or Headed mode
node scripts/run-browser-tests.mjs --password "your_secret_password" --headed
node scripts/run-browser-tests.mjs --password "your_secret_password" --ui

# Via environment variable (PowerShell):
$env:APP_LOCK_PASSWORD="your_secret_password"; npm run test:e2e

# Via environment variable (Bash / Linux / Mac):
APP_LOCK_PASSWORD="your_secret_password" npm run test:e2e
```

### 3. Headed Browser Mode (Watch tests run live)
```bash
npm run test:e2e:headed
```

### 4. Interactive UI Mode (Playwright UI Explorer)
```bash
npm run test:e2e:ui
```

### 5. View Test Report
```bash
npm run test:report
# or inspect the generated Markdown report:
cat test-report.md
```

---

## 🏗️ Project Structure

```text
├── playwright.config.ts           # Playwright settings, base URL, and reporters
├── scripts/
│   └── run-browser-tests.mjs      # Interactive CLI runner with password support
├── tests/
│   ├── README.md                  # This documentation
│   ├── reporters/
│   │   └── summary-reporter.ts    # Custom reporter for Markdown & console summaries
│   └── e2e/
│       ├── fixtures.ts            # Custom fixtures (authenticatedPage, userProfiles, pages)
│       ├── pages/                 # Page Object Models
│       │   ├── AppLockPage.ts     # Unlocking, blocker gate, and banner interactions
│       │   ├── DashboardPage.ts   # Dashboard stats, accounts, month switcher
│       │   ├── ProfilesPage.ts    # Profile manager, provider icons, profile cards
│       │   └── NavigationPage.ts  # Top navigation tabs switching
│       └── specs/                 # Test suites
│           ├── 01-app-lock.spec.ts   # App lock status and unlock flows
│           ├── 02-profiles.spec.ts   # Profile data and UI rendering
│           ├── 03-dashboard.spec.ts  # Financial command center & widgets
│           └── 04-navigation.spec.ts # Tab switching and layout validation
```

---

## 🧩 How to Extend the Test Suite

Adding a new test is straightforward using the built-in fixtures:

```typescript
// tests/e2e/specs/05-my-new-feature.spec.ts
import { test, expect } from '../fixtures';

test.describe('My New Feature', () => {
  test('should perform custom check using authenticated session and user profiles', async ({
    authenticatedPage,
    navigationPage,
    userProfiles,
  }) => {
    // 1. Navigate to your view
    await navigationPage.selectTab('dashboard');

    // 2. Use live profiles or page elements
    console.log('Testing with profiles:', userProfiles);

    // 3. Assert your feature
    await expect(authenticatedPage.locator('h1')).toBeVisible();
  });
});
```
