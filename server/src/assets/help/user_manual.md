# Israeli Bank Scraper - Complete User Manual

Welcome to the Israeli Bank Scraper! This app acts as your personal financial command center, automatically gathering all your banking and credit card data into one place, running AI-based categorization, and helping you budget and forecast your expenses.

This manual provides detailed "how-to" descriptions of every feature and setting available in the application.

---

## 1. Dashboard (Financial Command Center)
**Location:** `/?view=dashboard`

The Dashboard is your main home screen, providing analytics and summaries based on your transaction history.

### How to use the Dashboard:
*   **Change Displayed Month:** Use the arrows next to the month name at the top to navigate back to historical data or forward to current data.
*   **Export/Download Data:** Click the **Export** button to download all transactions or just the currently selected month's transactions in CSV or JSON formats for offline use in Excel or Google Sheets.
*   **Set Credit Card Payment Date:** If your credit cards charge on a specific day (e.g., the 2nd or 10th), configure a custom payment date here so the app aligns your forecast accurately with your billing cycle.
*   **Track Income Progress:** A visual bar shows tracking for your received income versus the total expected monthly inflow, helping you see if you're on target.
*   **Track Expense Progress:** View funds you have already spent. The system generates a **Variable Forecast** predicting how much more you'll spend based on your daily burn rate and historical behavior, capping the forecast to prevent skewed data if you spend heavily early in the month.
*   **Manage Subscriptions:** Review a panel of active subscriptions detected automatically by the system. You can drill down into each to see transaction history or mark items incorrectly identified as subscriptions. Only active subscriptions with recent transactions are shown.
*   **View & Edit Transactions:** Browse all transactions for the selected month in a detailed list. You can click on transactions to manually override the AI's selected category.
*   **View Detailed Analytics:** Analyze the Category Pie chart for distribution mapping, Monthly Trends to compare against previous months, and Top Merchants to see where your money goes.
*   **Use the AI Financial Chat:** Talk with an integrated Copilot chatter box. You can ask ad-hoc questions scoped specifically to your transactions (e.g., "How much did I spend on groceries this month?").

---

## 2. Scrape Workspace
**Location:** `/?view=scrape`

The Scrape workspace is where you connect to your banks and pull new financial data.

### How to use the Scrape Workspace:
*   **Start a New Scrape:** Select your bank or credit card provider profiles, define the date ranges (e.g., last 30 days), and start a manual scrape. The automated browser will fetch your new data.
*   **Manage Profiles:** Create and save different profiles for each of your bank accounts or credit cards. The form will display saved profiles with their provider icons. Simply select a profile and click "Start Scrape" without needing to re-enter credentials every time.
*   **Import Data Manually:** If you prefer not to use the automated browser or your bank is unsupported, use the manual import function to upload CSV files downloaded directly from your bank's website.
*   **View Scrape Progress:** Watch the live console footprint of the headless browser during a scrape to see exactly what the scraper is doing.
*   **Explore Results:** Check the Results Explorer to see the data files and logs saved from your previous scraping sessions.

---

## 3. Configuration Panel
**Location:** `/?view=configuration`

This is the control center of the app. It holds all automations, rules, AI prompts, and integrations.

### 3.1 AI Settings
**Location:** `/?view=configuration&configTab=ai`

*   **Model Selection:** Choose whether the AI should use a local, faster model for basic auto-categorization or a slower, deeper "Analyst" model for chat and insights.
*   **Language Selection:** Set the primary language for AI interaction (e.g., English or Hebrew).
*   **Categories Management:** Add, delete, or rename the custom budget categories you want the AI to use.
*   **Bulk Recategorization:** A powerful tool with a single button to force the AI to re-evaluate all past transactions and apply your newest custom categories retroactively.

### 3.2 AI Memory Settings
**Location:** `/?view=configuration&configTab=memory`

The AI has a memory system to learn your specific budget habits over time.
*   **Retention Days:** Set how many days the app should keep dynamic Facts, Insights, and Alerts in its memory before deleting them.
*   **Facts Management:** View, edit, or delete the explicit rules the system has learned (e.g., "Wolt is always a 'Dining' expense").
*   **Insights & Alerts Management:** Review financial insights and fraud alerts the system has flagged. You can delete them here to clear your feed.

### 3.3 Scheduler Settings
**Location:** `/?view=configuration&configTab=scheduler`

Automate your scrapes so you don't have to launch them manually.
*   **Enable/Disable Automation:** Toggle the entire scheduler system on or off.
*   **Schedule Configuration (Cron):** Define the exact times and frequencies for automatic scrapes using a standard Cron expression (e.g., every day at 2 AM).
*   **Profile Selection:** Check boxes for which saved bank profiles should be included in the automated run.
*   **Backup Destination:** Decide if the automated scheduler should save a backup of your database locally or straight to Google Drive after scraping.

### 3.4 Scraper Settings
**Location:** `/?view=configuration&configTab=scrape`

Adjust the low-level behavior of the scraping engine and what happens immediately after a scrape finishes.
*   **Global Options:**
    *   **Show Browser:** Toggle on to make the automated browser visible during scrapes (useful for debugging 2FA or captchas).
    *   **Verbose Logging:** Keep detailed footprints of the scraper's actions.
    *   **Combine Installments:** Automatically sum up parts of installment payments into one clean record.
    *   **Timeout:** The maximum time (in milliseconds) the scraper will wait for a bank page to load before giving up.
    *   **Future Months:** Look ahead and scrape future credit card charges.
    *   **Smart Start Date:** Automatically calculate how far back to scrape based on your last successful run to prevent overlaps and save time.
    *   **Opt-In Features:** Check specific bank-related hacks (e.g., treating certain Mizrahi or Isracard transactions differently based on missing identifiers).
*   **Post-Scrape Actions:**
    *   **Run Categorization:** Automatically pass new data to the AI to categorize immediately.
    *   **Fraud Detection:** Toggle whether fraud detection should run locally, via AI, or both. Choose its scope (Current run vs. All historical data), and specify if it should notify you.
    *   **Custom AI Query:** Instruct the app to ask the AI extra analysis questions specifically on the new batch of data.
    *   **Telegram Notification Aggregate:** Send a single bundled message to Telegram instead of many small ones.
    *   **Spending Digest:** Send a comprehensive spending digest to your notifications channels.
    *   **Transaction Review Reminders:** Automatically notify you if there are uncategorized transactions or transfer movements that need your manual review.
    *   **Notification Channels:** Select where post-scrape updates are sent (e.g., Telegram).

### 3.5 Fraud Settings
**Location:** `/?view=configuration&configTab=fraud`

Detailed settings for the local Fraud Detection engine.
*   **Fraud Mode:** Choose between 'Local' rules, 'AI' rules, or 'Both'.
*   **Local Rules Toggles:** Turn on specific mathematical detectors, such as: Outlier Amount (huge uncharacteristic expenses), New Merchant, Non-Hebrew new merchant, Rapid Repeats (same charge multiple times in an hour), and block Foreign Currency anomalies.
*   **Thresholds Configuration:** Deeply tune the rules. Set the exact minimum foreign currency amount required to trigger an alert, adjusting Z-score limits for outliers, or score severity minimums for Low, Medium, and High alerts. Choose whether to notify only on Medium+ alerts.
*   **Test Transaction:** A built-in sandbox feature. Enter a dummy transaction amount and fake history to see mathematically how the system scores it before deploying changes.
*   **Recent Findings:** A chronological list of recent fraud flags for your review.

### 3.6 Google Sheets Sync
**Location:** `/?view=configuration&configTab=sheets`

Export categorized data seamlessly to the cloud.
*   **Connect/Disconnect Google Account:** OAuth login to tie the app directly to your Google identity.
*   **Source Selection:** Select exactly which scraped batch file you want to sync.
*   **Target Spreadsheet:** Choose an existing Google Sheet in your Drive from a dropdown, or click the plus button to create a brand new spreadsheet formatted perfectly for the app.
*   **Manual Sync Button:** Force a sync push to send your records instantly.

### 3.7 Telegram Settings
**Location:** `/?view=configuration&configTab=telegram`

Link a Telegram chatbot to your app to receive daily digests or control it remotely.
*   **Bot Status Panel:** See if the bot daemon is currently running. Start or stop the bot with action buttons.
*   **Bot Language:** Select whether the Telegram bot chats with you in English or Hebrew.
*   **Bot Token Input:** Secure field to input the API token provided by Telegram's `@BotFather`. Use the 'Test Connection' button to ensure the token is valid.
*   **Users Management:** The bot is strictly private. Add your specific Telegram User ID to the "Allowed Users" whitelist here to grant access. Toggle checkboxes per user to allow chat interactions and/or receive automated notification broadcasts.
*   **Download User Manifest:** Export the whitelist setup for backup purposes.

### 3.8 Environment Settings
**Location:** `/?view=configuration&configTab=environment`

Manage sensitive system variables required for integrations.
*   **AI Integration:** Holds your Gemini API Key.
*   **Google Integration:** Complete fields for Google Client ID, Client Secret, and OAuth Redirect URIs if setting up Drive sync from scratch. Set the target Drive Folder ID.
*   **System Info:** Displays technical read-only parameters like the backend Port and local Database path.
*   **Save & Restart:** Applying changes here requires restarting the backend server via the provided button.

### 3.9 System Maintenance
**Location:** `/?view=configuration&configTab=maintenance`

Protect and repair your database files.
*   **Create Local or Drive Backup:** Perform an immediate snapshot dump of your total transaction and config database, saved locally within the app folder or uploaded to your Google Drive.
*   **Restore Local/Drive Backup:** Pick from a dropdown list of safe historical backups and instantly overwrite your corrupted database.
*   **Download Local Backup:** Extract your local database to your computer as a portable file.
*   **Upload Backup File:** Select a previously downloaded JSON backup file from your personal computer to inject back into the app.
*   **Reload Database:** Force the app to clear its cache and reload its datasets from disk without resetting anything completely.
*   **Reset All Data:** The nuclear option. Erases all AI memory, transactions, custom categories, and config setups, returning the app to day-zero out-of-the-box settings.

---

## 4. System Logs
**Location:** `/?view=logs`

The Logs Viewer helps you debug issues, verify automation success, and see what the AI is thinking behind the scenes.

*   **Server Logs (`/?view=logs&logType=server`):** Review internal backend logs and API errors. Look here if settings fail to save.
*   **Client Logs (`/?view=logs&logType=client`):** Review front-end user interface activity. Useful if a button click fails on screen.
*   **AI Logs (`/?view=logs&logType=ai`):** See transparently what prompts were generated and sent to Gemini, and read precisely how it responded to categorization requests.
*   **Scrape Logs (`/?view=logs&logType=scrape`):** A full historical console log left by the headless browsers attempting bank logins. Look here if your bank refuses to connect.
*   **Log Filtering:** Use the settings gear to filter by severity ranges (e.g., only show Errors), choose how many lines to fetch on screen, or clear outdated logs from your database instantly.
