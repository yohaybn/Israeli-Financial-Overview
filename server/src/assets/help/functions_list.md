# Available User Functions by Screen

Here is a comprehensive list of all functionalities available to the user in the app, organized by the screens they are located on, along with their deep links.

## 1. Dashboard (Financial Command Center)
**Deep Link:** `/?view=dashboard`
*   **Change Displayed Month:** Navigate between different months to view historical or current financial data.
*   **Export/Download Data:** Download all transactions or a specific month's transactions in CSV or JSON formats.
*   **Set Credit Card Payment Date:** Configure custom credit card payment collection dates for better forecasting.
*   **Income Progress:** View tracking for already received income versus expected monthly inflow.
*   **Expense Progress:** Track already spent funds, remaining planned spending, and a calculated variable forecast based on historical behavior.
*   **Subscription Management:** View active subscriptions detected from your statements, and categorize them.
*   **Monthly Transactions View:** Inspect all transactions for the selected month, with the ability to edit their categories.
*   **Detailed Analytics:** View visual charts, Category Pie distributions, Monthly Trends, and Top Merchants.
*   **AI Financial Chat:** Use the floating **indigo** button (bottom-right) on **any** main tab (Dashboard, Scrape, Logs, Configuration) when Gemini is configured—same analyst chat everywhere, scoped to your transactions.
*   **Top insights:** View merged high-score cards from the AI analyst and from **insight rules** (badged **AI** vs **Rule**); dismiss removes that card (rule dismissals use rule-fire storage, not AI memory).

## 2. Scrape Workspace
**Deep Link:** `/?view=scrape`
*   **Start New Scrape:** Choose bank providers, date ranges, and scraping methods to automatically pull new transactions from financial institutions.
*   **Scrape Settings:** Adjust technical behaviors such as the scraper engine configuration.
*   **Import Data Manually:** Upload existing CSV files with transaction data instead of scraping.
*   **View Scrape Progress:** Watch live logs of ongoing scraping tasks in the background.
*   **Results Explorer:** View the resulting data files and outcomes generated from previous scrapes.

## 3. Configuration Panel
**Deep Link:** `/?view=configuration`
*   **AI Settings (`/?view=configuration&configTab=ai`):** Set up language models (LLMs) used for auto-categorization and configure custom categories.
*   **AI Memory Settings (`/?view=configuration&configTab=memory`):** Manage persistent facts, scored insights, and alerts from the unified analyst chat; retention pruning applies to those items.
*   **Insight rules (`/?view=configuration&tab=insight-rules`):** Define bilingual (EN/HE) deterministic rules over transactions (JSON v1), test them, optionally draft new rules with Gemini inside **Add rule**, export rule packs, and **import** pasted packs with a **review** step to align categories and numbers before saving. **Share** a saved rule to offer it for the community catalog (credit name + optional note). **Community catalog** lists published rules to import: opens the same rule editor as **Add rule** so you can adjust the copy before saving. Re-evaluate rule fires for the dashboard **Top insights** strip.
*   **Scheduler Settings (`/?view=configuration&configTab=scheduler`):** Configure the app to run scraping tasks fully automatically on a recurring schedule.
*   **Scraper Global Options (`/?view=configuration&configTab=scrape`):** General configurations related to how browser automation connects to banking websites.
*   **Fraud & alerts (under Scrape, `/?view=configuration&tab=scrape`):** Threshold alerts for potential duplicate charges or fraudulent activity warnings.
*   **Google Sheets Sync (`/?view=configuration&configTab=sheets`):** Link the app to Google Sheets to automatically export matched and categorized transactions to the cloud.
*   **Telegram Settings (`/?view=configuration&configTab=telegram`):** Set up chatbot integration so the app can send you daily summaries or scraping results via Telegram.
*   **Runtime settings** are edited in-app under **AI** (Gemini), **Google** (OAuth / Drive folder id), and **Maintenance** (port, data directory); values persist in `runtime-settings.json` under your data folder.
*   **System Maintenance (`/?view=configuration&configTab=maintenance`):** Tools for re-running global transaction recategorizations or wiping local databases.

## 4. System Logs
**Deep Link:** `/?view=logs`
*   **Server Logs (`/?view=logs&logType=server`):** Review internal application events and errors.
*   **Client Logs (`/?view=logs&logType=client`):** Review front-end user interface activity.
*   **AI Logs (`/?view=logs&logType=ai`):** See exactly what prompts, requests, and categorization decisions the AI has been processing.
*   **Scrape Logs (`/?view=logs&logType=scrape`):** Read detailed console footprints left by the automated browser instances.
*   **Filter & Clear Logs:** Filter by severity (Debug, Info, Warn, Error), change line counts, or clear outdated logs out of the database.
