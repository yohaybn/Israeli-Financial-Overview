# Financial Overview (מבט כלכלי) - User Guide

---

## TABLE OF CONTENTS

### English
- [Getting Started](#getting-started-english)
- [Feature Guide](#feature-guide-english)
- [Configuration](#configuration-english)

### עברית
- [התחלה](#התחלה-עברית)
- [מדריך תכונות](#מדריך-תכונות-עברית)
- [הגדרות](#הגדרות-עברית)

---

---

## ENGLISH VERSION

### Getting Started (English)

#### What is Financial Overview?

Financial Overview is a secure financial data management tool that allows you to:
- Extract transactions from Israeli banks and credit cards
- Organize and categorize your financial data with AI
- Export results to Google Sheets or download as CSV/JSON
- Automate recurring scraping jobs
- Analyze spending patterns with built-in analytics

#### System Requirements

- **Web Browser**: Modern browser (Chrome, Firefox, Safari, Edge)
- **Internet Connection**: Required to connect to your bank and Google services
- **JavaScript Enabled**: Must be enabled in your browser
- **Master Key**: A secure password you create (keep this safe!)

#### First-Time Setup

1. **Open the Application**
   - Navigate to `http://localhost:3000` in your web browser
   - You should see the main dashboard with several panels

2. **Select Your Language**
   - Click the language selector (top-right corner)
   - Choose between English (EN) or Hebrew (עברית)

3. **Authorize Google (Optional but Recommended)**
   - Click the "Google Services" or settings icon
   - Click "Connect with Google"
   - Follow the OAuth flow to authorize Google Sheets access
   - This allows automatic upload of scrape results

---

### Feature Guide (English)

#### 1. RUNNING A SCRAPE

##### Step 1: Select a Provider
- Click the **Provider** dropdown in the "New Scrape" section
- Choose your bank or credit card company (e.g., Bank Hapoalim, Leumi, Isracard, Discount)
- The interface will automatically display required credential fields

##### Step 2: Enter Credentials
- Fill in your username/password for the selected bank
- **Security Note**: Credentials are sent only to the local backend and never stored in plain text

##### Step 3: Optional - Use a Saved Profile
- Instead of entering credentials each time, save them as a **Profile**
- Check the "Save Profile" checkbox
- Enter a profile name (e.g., "My Hapoalim Account")
- Enter your **Master Key** (a strong password of your choice)
- Click **Save Profile**

##### Step 4: Configure Scrape Options
- **Start Date** (Optional): Defaults to 30 days ago. Enter a specific date to go further back
- **Timeout**: How long (in milliseconds) to wait for the scraper (default: 120,000 ms = 2 minutes)
- **Show Browser** (Debug): Enable to see the browser automation in action
- **Combine Installments**: Merge installment payments into single entries
- **Future Months**: Number of future months to include in scrape

##### Step 5: Execute the Scrape
- Click **Start Scrape** button
- You will see a live log of the scraping process
- Once complete, a success message appears with transaction count

##### Step 6: Handle Results
- **Save to Google Sheets** (optional): The "Save to Sheets" checkbox auto-uploads results
- **Download Results**: Click "Download JSON" or "Download CSV" to export locally
- Results are automatically saved to your history for later review

---

#### 2. PROFILES & SAVED CREDENTIALS

##### Create a Profile
1. Fill in credentials for a bank
2. Check "Save Profile"
3. Enter a name and Master Key
4. Click "Save Profile"

##### Load a Saved Profile
1. Click "Start from Profile" dropdown
2. Select your saved profile name
3. Credentials auto-fill (you only need the Master Key)
4. Proceed with scraping

##### Delete a Profile
1. Select the profile from the dropdown
2. Click the **Delete Profile** button
3. Confirm deletion (cannot be undone)

**Master Key**: 
- Used to encrypt saved credentials
- Never share your Master Key
- If forgotten, profiles cannot be decrypted (you'll need to save new profiles with a new key)

---

#### 3. RESULTS EXPLORER

The Results Explorer is where you view and manage all scrape results.

##### Viewing Results
- **Sidebar (Left Panel)**: Shows list of all scrape files
- Click any file to load it
- Main panel displays transactions in a table format

##### Multi-File Selection
- Check multiple files in the sidebar to combine them
- The "Multi-Source View" aggregates transactions from selected files
- Combine data from different time periods or accounts

##### Summary Cards
- **Accounts**: Total number of accounts across selected results
- **Net Balance**: Total balance from all accounts
- **Viewable Txns**: Count of transactions shown (after filters applied)

##### Transaction Table
- **Search**: Use the search box to find transactions by description or amount
- **Sort**: Click column headers to sort (date, amount, category, etc.)
- **Select Columns**: Choose which columns to display
- **Exclude Transaction Type**: Right-click any transaction to exclude similar ones
- **Categorize**: Manually set category for each transaction

---

#### 4. TRANSACTION FILTERING & EXCLUSIONS

##### Create Exclusion Filters
- Right-click a transaction description
- Select "Exclude transactions like this"
- Confirm the pattern to exclude
- The filter applies immediately

##### View Active Filters
- Active exclusion filters appear in the sidebar under "Active Exclusions"
- Each filter shows the pattern and an eye icon

##### Toggle Filters On/Off
- Click the **eye icon** (👁️) to hide/show a filter
- Click the **X icon** (✕) to delete a filter
- "Show All" button displays all transactions regardless of filters

---

#### 5. AI-POWERED FEATURES

##### AI Categorization

**What it does**: Automatically assigns expense categories to transactions based on their description.

**How to use**:
1. Load a scrape result
2. Click the **"Categorize with AI"** button
3. Wait while the AI processes transactions
4. Each transaction is assigned a category (Food, Transportation, Shopping, etc.)

**Customizing Categories**:
1. Click the **Settings cog icon** in the sidebar
2. Click "AI Settings"
3. View current categories list
4. Add new categories by typing and clicking **Add**
5. Remove categories by clicking the X next to them
6. Click **Save Settings**

##### AI Analyst

**What it does**: Chat with an AI about your transactions to get insights.

**How to use**:
1. Load a scrape result
2. Switch to "Analytics" tab or click the AI Analyst panel (right side)
3. Ask questions like:
   - "What's my top spending category?"
   - "How much did I spend on food this month?"
   - "What was my largest payment?"
4. Type your question in the input box
5. Wait for the AI response
6. Continue the conversation

---

#### 6. ANALYTICS DASHBOARD

**Accessing Analytics**:
1. Load a scrape result
2. Click the **Analytics** tab
3. View charts and insights

**Available Analytics**:
- **Total Income**: Sum of all positive transactions
- **Total Expenses**: Sum of all negative transactions
- **Spending by Category**: Pie/bar chart breakdown
- **Monthly Spending Trend**: Line chart showing spending over time
- **Top Merchants**: Table showing where you spent most

**Filtering Analytics**:
- Active exclusion filters affect analytics
- Use "Show All" to include previously excluded transactions
- Multi-file selection combines analytics from multiple sources

---

#### 7. IMPORTING EXTERNAL DATA

##### Supported File Formats
- Excel files (XLS, XLSX)
- PDF statements from banks

##### How to Import
1. Click the **Import button** (upload icon) in Results Explorer sidebar
2. Click "Select Files" or drag-and-drop files
3. Check "Use AI for Parsing" if files are complex PDFs
4. Click **Import**
5. Imported transactions appear in your results history

---

#### 8. EXPORTING DATA

##### Export Options

**JSON Export**:
1. Select result file(s)
2. Click **Export → JSON**
3. Save raw transaction data (preserves all fields)
4. Filename: `results_YYYY-MM-DD.json` or `aggregated_results.json`

**CSV Export**:
1. Select result file(s)
2. Click **Export → CSV**
3. Import to Excel, Google Sheets, or accounting software
4. Includes: Date, Description, Amount, Currency, Category, Status, Memo

**Google Sheets Upload**:
1. Configure Google OAuth first (see Configuration section)
2. Check "Save to Sheets" before running scrape
3. Results auto-upload to Google Drive
4. Sheet name follows pattern: `profile_YYYY-MM-DD`

---

#### 9. SCHEDULER & AUTOMATION

**What it does**: Automatically runs scrapes on a schedule (e.g., daily, weekly).

##### Accessing Scheduler
1. Click **Automation** tab in main navigation
2. Scroll to **Scheduler** section

##### Configure Scheduler
1. **Enable Schedule**: Toggle the scheduler on/off
2. **Scheduled Time**: Set the time of day (e.g., 8:00 AM)
3. **Select Profiles**: Check which profiles to scrape automatically
4. **Save Results**: Toggle auto-save to Google Sheets
5. Click **Save Settings**

##### Run Scheduler Manually
1. Click **Run Now** button to execute immediately
2. Useful for testing before scheduling

##### View Scheduler Logs
1. Click **Logs** tab to see execution history
2. Monitor success/failure status

---

#### 10. PIPELINE CONTROLLER

**What it does**: Orchestrates complex multi-step data processing workflows for advanced users.

##### Basic Pipeline Setup
1. Click **Automation** tab
2. Select "Pipeline Controller"
3. **Execution Mode**: Choose "Sequential" (one after another) or "Parallel" (all at once)
4. **Select Profiles**: Choose which profiles to include
5. **Define Stages**: Add processing stages (scrape, categorize, export)
6. **Settings**: Configure notification details and result persistence
7. Click **Execute Pipeline**

##### Pipeline Stages (Common Examples)
- **Stage 1**: Scrape transactions
- **Stage 2**: Categorize with AI
- **Stage 3**: Upload to Google Sheets
- **Stage 4**: Generate analytics report

##### Monitor Pipeline Execution
- Live progress updates shown in panel
- See which stage is running
- Monitor for errors or completions

---

#### 11. LOGS & DEBUGGING

##### Accessing Logs
1. Click **Logs** tab in main navigation
2. Scroll through execution history
3. View timestamps and operation details

##### Log Levels
- **INFO**: Standard operations (e.g., "Scrape started")
- **SUCCESS**: Completed operations (e.g., "Scraping completed")
- **ERROR**: Failed operations (e.g., "Connection failed")

##### Troubleshooting Tips
- Check logs if a scrape fails
- Look for connection errors or timeout messages
- Verify credentials are correct
- Ensure internet connection is active

---

### Configuration (English)

#### 1. APPLICATION SETTINGS

##### Language Selection
- Top-right dropdown: Choose English or עברית (Hebrew)
- Interface updates instantly

##### Browser Display
- Some advanced options allow showing browser automation (debug mode)
- Useful for troubleshooting scraper issues

---

#### 2. GOOGLE SHEETS CONFIGURATION

**Why?** Automatically upload scrape results to your Google Drive.

##### Prerequisites
- Google account
- Access to Google Cloud Console

##### How to Set Up

**Step 1: Get Google Credentials**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Google Drive API" and "Google Sheets API"
4. Create an OAuth 2.0 Client ID (Application type: Web)
5. Add redirect URI: `http://localhost:3000/oauth2callback`
6. Copy your Client ID and Client Secret

**Step 2: Configure in Application**
1. Click settings icon (gear icon)
2. Select "Google Services" or "External Services"
3. Enter your Client ID and Client Secret
4. Click "Test Configuration" to verify
5. Click "Authorize" and follow OAuth flow
6. Grant permission for Google Sheets access

**Step 3: Verify Setup**
- After authorization, you should see a success message
- Try running a scrape with "Save to Sheets" enabled
- Check your Google Drive for a new folder (folder ID from settings)

##### Google Settings Fields
- **Client ID**: From Google Console (looks like `xxx.apps.googleusercontent.com`)
- **Client Secret**: From Google Console (keep this secret!)
- **Redirect URI**: Must match Google Console setting exactly
  - Default: `http://localhost:3000/oauth2callback`

---

#### 3. AI SETTINGS

##### Categorization Model
- Selects which AI model processes transactions
- Default: Google Gemini Flash (fast and free)
- Options depend on available API keys

##### Analyst Model
- AI model for chat/insights queries
- Default: Same as categorization model

##### Default Category
- Fallback category if AI cannot classify a transaction
- Default: "Other" or "אחר" (Hebrew)

##### Allowed Categories
- List of valid expense categories
- Add custom categories as needed
- Examples: Food, Transportation, Shopping, Subscriptions, Health, Housing, Entertainment, Salary, Transfers, Bills, Clothing, Education, Other, Mortgage & Loans, Charity

---

#### 4. ENCRYPTION & SECURITY

##### Master Key Protection
- Your Master Key encrypts all saved profiles
- Profiles cannot be accessed without the correct Master Key
- If you forget your Master Key, saved profiles are lost

**Best Practice**:
- Use a strong password (12+ characters, mixed case, numbers, symbols)
- Write it down and store safely (password manager recommended)
- Never share your Master Key

##### Credential Storage
- Credentials are encrypted using your Master Key
- Local storage only (never transmitted to external servers)
- Decryption happens only when needed

---

#### 5. SUPPORTED BANKS & PROVIDERS

The application supports scraping from the following Israeli financial institutions:

- **Banks**:
  - Bank Hapoalim (בנק הפועלים)
  - Bank Leumi (בנק לאומי)
  - Discount Bank (בנק דיסקונט)
  - Mizrachi Tefahot (בנק מזרחי טפחות)
  - And others available in the library

- **Credit Cards**:
  - Isracard (קארט ישראל)
  - Visacard (ויזה כרט)
  - And other card issuers

- **Other Providers**:
  - May include additional fintech and payment providers

**To check current list**: 
1. Run the application
2. Click the Provider dropdown
3. All supported providers are listed

---

#### 6. ADVANCED SETTINGS

##### Timeout Configuration
- **Default**: 120,000 milliseconds (2 minutes)
- **Change to**: Longer timeout for slow connections or complex queries
- Set in scrape options before running

##### Custom Filename Patterns
- Use `{profile}` to include profile name
- Use `{date}` for current date
- Example: `{profile}_{date}.json` → `MyProfile_2024-01-15.json`

##### Test Mode
- Useful for testing without actual bank credentials
- Generates mock transactions
- Helps you explore the UI without credential risks

---

#### 7. TROUBLESHOOTING SETTINGS

##### Issues & Solutions

| Issue | Possible Causes | Solution |
|-------|-----------------|----------|
| "Credentials rejected" | Wrong username/password | Verify bank credentials manually |
| "Timeout error" | Bank server slow | Increase timeout value in settings |
| "AI categorization fails" | API key missing | Check AI Settings configuration |
| "Google Sheets upload fails" | OAuth not authorized | Re-authorize Google in settings |
| "Cannot decrypt profile" | Wrong Master Key | Verify Master Key is typed correctly |

---

---

## עברית

### התחלה (עברית)

#### מהו מבט כלכלי?

מבט כלכלי הוא כלי ניהול נתונים פיננסיים מאובטח שמאפשר לך:
- הוצאת עסקאות מבנקים וכרטיסי אשראי ישראליים
- ארגון וסיווג נתונים פיננסיים באמצעות AI
- ייצוא תוצאות ל-Google Sheets או הורדה כ-CSV/JSON
- אוטומציה של עבודות סריקה חוזרות
- ניתוח דפוסי הוצאות עם אנליטיקה מובנית

#### דרישות מערכת

- **דפדפן אינטרנט**: דפדפן מודרני (Chrome, Firefox, Safari, Edge)
- **חיבור לאינטרנט**: נדרש לחיבור לבנק שלך וליצירת קשר עם שירותי Google
- **JavaScript מופעל**: חייב להיות מופעל בדפדפן שלך
- **מפתח ראשי**: סיסמה מאובטחת שאתה יוצר (שמור אותה בטוח!)

#### הגדרה ראשונה

1. **פתח את היישום**
   - עבור ל-`http://localhost:3000` בדפדפן האינטרנט שלך
   - אתה אמור לראות את הלוח הראשי עם מספר פנלים

2. **בחר את השפה שלך**
   - לחץ על בחירת השפה (פינה עליונה שמאלית)
   - בחר בין English (EN) או עברית (עברית)

3. **אשר Google (אופציונלי אך מומלץ)**
   - לחץ על סמל "Google Services" או הגדרות
   - לחץ על "Connect with Google"
   - עקוב אחר זרימת OAuth כדי להרשות גישה ל-Google Sheets
   - זה מאפשר העלאה אוטומטית של תוצאות סריקה

---

### מדריך תכונות (עברית)

#### 1. הפעלת סריקה

##### שלב 1: בחר ספק
- לחץ על תפריט **ספק** בחלק "סריקה חדשה"
- בחר את הבנק או חברת כרטיס האשראי שלך (למשל, בנק הפועלים, לאומי, קארט ישראל, דיסקונט)
- הממשק יציג באופן אוטומטי את שדות האישור הנדרשים

##### שלב 2: הזן אישורים
- מלא את שם המשתמש/הסיסמה שלך לבנק הנבחר
- **הערה אבטחה**: האישורים נשלחים רק לשרת המקומי ולא מאוחסנים בטקסט רגיל

##### שלב 3: אופציונלי - השתמש בפרופיל שמור
- במקום להזין אישורים בכל פעם, שמור אותם כ-**פרופיל**
- סמן את תיבת הסימון "Save Profile"
- הזן שם פרופיל (למשל, "My Hapoalim Account")
- הזן את **המפתח הראשי** שלך (סיסמה חזקה של בחירתך)
- לחץ על **Save Profile**

##### שלב 4: הגדר אפשרויות סריקה
- **תאריך התחלה** (אופציונלי): ברירת המחדל היא 30 ימים אחורה. הזן תאריך ספציפי כדי ללכת רחוק יותר אחורה
- **Timeout**: כמה זמן (במילישניות) לחכות עבור הסורק (ברירת מחדל: 120,000 ms = 2 דקות)
- **הצג דפדפן** (ניקוי שגיאות): הפעל כדי לראות את אוטומציית הדפדפן בפעולה
- **אחד תשלומים**: מזג תשלומי קנייה בתשלומים לרשומות בודדות
- **חודשים עתידיים**: מספר חודשים עתידיים לכללול בסריקה

##### שלב 5: בצע את הסריקה
- לחץ על כפתור **Start Scrape**
- תראה יומן חי של תהליך הסריקה
- לאחר השלמה, הודעת הצלחה מופיעה עם ספירת עסקאות

##### שלב 6: טפל בתוצאות
- **שמור ל-Google Sheets** (אופציונלי): תיבת הסימון "Save to Sheets" מעלה באופן אוטומטי תוצאות
- **הורד תוצאות**: לחץ על "Download JSON" או "Download CSV" כדי לייצא מקומית
- התוצאות נשמרות באופן אוטומטי לרשימת ההיסטוריה שלך לבדיקה מאוחרת יותר

---

#### 2. פרופילים ואישורים שמורים

##### יוצר פרופיל
1. מלא אישורים לבנק
2. סמן "Save Profile"
3. הזן שם ומפתח ראשי
4. לחץ על "Save Profile"

##### טען פרופיל שמור
1. לחץ על תפריט "Start from Profile"
2. בחר את שם הפרופיל השמור שלך
3. אישורים מתמלאים באופן אוטומטי (אתה צריך רק את המפתח הראשי)
4. המשך בסריקה

##### מחק פרופיל
1. בחר את הפרופיל מהתפריט הנפתח
2. לחץ על כפתור **Delete Profile**
3. אשר מחיקה (לא יכול להיות בטל)

**מפתח ראשי**: 
- משמש להצפנת אישורים שמורים
- לא תשתף אי פעם את המפתח הראשי שלך
- אם שכחת, לא ניתן להצפין פרופילים (תצטרך לחסוך פרופילים חדשים עם מפתח חדש)

---

#### 3. סייר התוצאות

סייר התוצאות הוא המקום בו אתה צופה וניהול כל תוצאות הסריקה.

##### צפה בתוצאות
- **סרגל הצד (פנל שמאל)**: מציג רשימה של כל קבצי הסריקה
- לחץ על קובץ כלשהו כדי לטעון אותו
- הפנל הראשי מציג עסקאות בתבנית טבלה

##### בחירה מרובה של קבצים
- סמן מספר קבצים בסרגל הצד כדי להשלבם
- ה-"Multi-Source View" משלבת עסקאות מקבצים שנבחרו
- משלב נתונים מתקופות שונות או חשבונות

##### כרטיסי סיכום
- **חשבונות**: מספר כולל של חשבונות בתוצאות שנבחרו
- **יתרה נטו**: יתרה כוללת מכל החשבונות
- **עסקאות לצפייה**: ספירת עסקאות המוצגות (לאחר יישום מסננים)

##### טבלת עסקאות
- **חיפוש**: השתמש בתיבת החיפוש כדי למצוא עסקאות לפי תיאור או סכום
- **מיון**: לחץ על כותרות עמודה כדי למיין (תאריך, סכום, קטגוריה וכו ')
- **בחר עמודות**: בחר אילו עמודות להציג
- **החריג סוג עסקה**: לחץ בעכבר ימין על כל עסקה כדי להחריג דומים
- **סווג**: הגדר ידנית קטגוריה לכל עסקה

---

#### 4. סינון עסקאות והחרגות

##### יצור מסננים הצעה

- לחץ בעכבר ימין על תיאור עסקה
- בחר "Exclude transactions like this"
- אשר את הדפוס להחרגה
- המסנן חל מיד

##### הצג מסננים פעילים

- מסננים פעילים להחרגה מופיעים בסרגל הצד תחת "Active Exclusions"
- כל מסנן מציג את הדפוס וסמל עיניים

##### הבדל מסננים פעילים/כבויים

- לחץ על סמל **עיניים** (👁️) כדי להסתיר/להציג מסנן
- לחץ על סמל **X** (✕) כדי למחוק מסנן
- כפתור "Show All" מציג את כל העסקאות ללא קשר למסננים

---

#### 5. תכונות מופעלות על ידי AI

##### קטגוריה AI

**מה זה עושה**: מקצה באופן אוטומטי קטגוריות הוצאה לעסקאות על סמך תיאורן.

**כיצד להשתמש**:
1. טען תוצאת סריקה
2. לחץ על כפתור **"Categorize with AI"**
3. המתן בזמן שה-AI מעבד עסקאות
4. לכל עסקה מוקצית קטגוריה (Food, Transportation, Shopping וכו ')

**התאמה של קטגוריות**:
1. לחץ על סמל **הגדרות שיניים** בסרגל הצד
2. לחץ על "AI Settings"
3. צפה במודל AI שמשמש כרגע
4. הוסף קטגוריות חדשות על ידי הקלדה וערך של **הוסף**
5. הסר קטגוריות על ידי לחיצה על X ליד שלהם
6. לחץ על **Save Settings**

##### אנליסט AI

**מה זה עושה**: צ'אט עם AI לקבלת תובנות על העסקאות שלך.

**כיצד להשתמש**:
1. טען תוצאת סריקה
2. עבור לכרטיסייה "Analytics" או לחץ על פנל AI Analyst (צד ימין)
3. שאל שאלות כמו:
   - "מה קטגוריית ההוצאה הגדולה ביותר שלי?"
   - "כמה הם הוציאו על אוכל החודש הזה?"
   - "מה היתה ההחזقה הגדולה ביותר שלי?"
4. הקלד את שאלתך בתיבת הקלט
5. חכה לתגובת AI
6. המשך בשיחה

---

#### 6. לוח בקרה אנליטיקה

**גישה לאנליטיקה**:
1. טען תוצאת סריקה
2. לחץ על כרטיסייה **Analytics**
3. צפה בתרשימים ותובנות

**אנליטיקה זמינה**:
- **הכנסה כוללת**: סכום של כל העסקאות החיוביות
- **הוצאות כוללות**: סכום של כל העסקאות השליליות
- **הוצאות לפי קטגוריה**: תרשים עוגה/בר בדירוג
- **מגמת הוצאות חודשית**: תרשים קו המציג הוצאות לאורך זמן
- **הסוחבים מובילים**: שולחן המציג היכן זה הוציא את רוב

**סינון אנליטיקה**:
- מסננים פעילים להחרגה משפיעים על אנליטיקה
- השתמש ב-"Show All" כדי לכלול עסקאות שהוחרגו בעבר
- בחירה מרובה של קבצים משלבת אנליטיקה ממקורות מרובים

---

#### 7. ייבוא נתונים חיצוניים

##### תבניות קבצים נתמכות
- קבצי Excel (XLS, XLSX)
- הצהרות PDF מבנקים

##### כיצד להיכנס

1. לחץ על **כפתור ייבוא** (סמל העלאה) בסרגל צד סייר התוצאות
2. לחץ על "בחר קבצים" או גרור ושחרר קבצים
3. סמן "Use AI for Parsing" אם הקבצים הם קובצי PDF מורכבים
4. לחץ על **Import**
5. עסקאות המיובאות מופיעות בהיסטוריית התוצאות שלך

---

#### 8. ייצוא נתונים

##### אפשרויות ייצוא

**ייצוא JSON**:
1. בחר קבצי תוצאה
2. לחץ על **ייצוא → JSON**
3. שמור נתוני עסקה גולמיים (משמר את כל השדות)
4. שם קובץ: `results_YYYY-MM-DD.json` או `aggregated_results.json`

**ייצוא CSV**:
1. בחר קבצי תוצאה
2. לחץ על **ייצוא → CSV**
3. ייבוא ל-Excel, Google Sheets או תוכנת חשבונאות
4. כולל: תאריך, תיאור, סכום, מטבע, קטגוריה, סטטוס, הערה

**Google Sheets העלאה**:
1. הגדר OAuth של Google תחילה (ראה סעיף הגדרות)
2. סמן "Save to Sheets" לפני הפעלת סריקה
3. תוצאות מעלה באופן אוטומטי ל-Google Drive
4. שם גיליון עוקב אחר דפוס: `profile_YYYY-MM-DD`

---

#### 9. מתזמן ואוטומציה

**מה זה עושה**: באופן אוטומטי מפעיל סריקות בחוזה (למשל, יומי, שבועי).

##### גישה לתזמן

1. לחץ על כרטיסייה **Automation** בניווט ראשי
2. גלול לחלק **Scheduler**

##### הגדר תזמן

1. **הפעל לוח השנה**: עבורת התזמן פעולה/כבויה
2. **זמן מתוזמן**: הגדר את זמן היום (למשל, 8:00 בבוקר)
3. **בחר פרופילים**: סמן אילו פרופילים לסרוק באופן אוטומטי
4. **שמור תוצאות**: הובלה שמירה אוטומטית ל-Google Sheets
5. לחץ על **Save Settings**

##### הפעל תזמן ידנית

1. לחץ על כפתור **Run Now** כדי בצע מיד
2. שימושי לבדיקה לפני תזמון

##### צפה ביומני התזמן

1. לחץ על כרטיסייה **Logs** כדי לראות רשומת ביצוע
2. עקוב אחר סטטוס הצלחה/כישלון

---

#### 10. בקר צנרור

**מה זה עושה**: מריץ תפקידים מורכבים ניהול נתונים מרובי שלב עבור משתמשי מתקדמים.

##### הגדרת צנרור בסיסי

1. לחץ על כרטיסייה **Automation**
2. בחר "Pipeline Controller"
3. **מצב ביצוע**: בחר "Sequential" (אחד אחרי השני) או "Parallel" (כולם בו-זמנית)
4. **בחר פרופילים**: בחר אילו פרופילים לכללול
5. **הגדר שלבים**: הוסף שלבי עיבוד (סורק, סווג, ייצוא)
6. **הגדרות**: קונפיגור פרטי הודעות ותיקיית תוצאות
7. לחץ על **Execute Pipeline**

##### שלבי צנרור (דוגמאות נפוצות)

- **שלב 1**: סורק עסקאות
- **שלב 2**: סווג עם AI
- **שלב 3**: העלאה ל-Google Sheets
- **שלב 4**: ייצור דוח אנליטיקה

##### צפה בביצוע צנרור

- עדכוני התקדמות חי המוצגים בפנל
- ראה איזה שלב רץ
- עקוב אחר שגיאות או השלמות

---

#### 11. יומנים וניקוי שגיאות

##### גישה ליומנים

1. לחץ על כרטיסייה **Logs** בניווט ראשי
2. גלול דרך רשומת היסטוריה
3. צפה בחותם הזמן ופרטי הפעולה

##### רמות יומן

- **INFO**: פעולות סטנדרטיות (למשל, "סריקה התחילה")
- **SUCCESS**: פעולות הושלמו (למשל, "סריקה הושלמה")
- **ERROR**: פעולות שכשלו (למשל, "חיבור נכשל")

##### טיפים לפתרון בעיות

- בדוק יומנים אם סריקה נכשלת
- חפש שגיאות חיבור או הודעות זמן זמן
- אשר אישורים נכונים
- וודא שחיבור האינטרנט פעיל

---

### הגדרות (עברית)

#### 1. הגדרות יישום

##### בחירת שפה

- תפריט נפתח עליון שמאל: בחר בתוך English או עברית
- הממשק עדכונים מיד

##### צג דפדפן

- כמה אפשרויות מתקדמות מאפשרות הצגת אוטומציית דפדפן (מצב ניקוי שגיאות)
- שימושי לפתרון בעיות סורק

---

#### 2. תצורת GOOGLE SHEETS

**למה?** העלאה אוטומטית של תוצאות סריקה ל-Google Drive שלך.

##### תנאים מוקדמים

- חשבון Google
- גישה לקונסולת Google Cloud

##### כיצד להגדיר

**שלב 1: קבל אישורי Google**

1. עבור ל- [Google Cloud Console] (https://console.cloud.google.com/)
2. צור פרויקט חדש או בחר אחד קיים
3. הפעל את "Google Drive API" ו-"Google Sheets API"
4. יוצר OAuth 2.0 Client ID (סוג יישום: Web)
5. הוסף הפניה הפניה: `http://localhost:3000/oauth2callback`
6. העתק את Client ID ו-Client Secret שלך

**שלב 2: בצע תצורה ביישום**

1. לחץ על סמל הגדרות (סמל שיניים)
2. בחר "Google Services" או "External Services"
3. הזן את Client ID ו-Client Secret שלך
4. לחץ על "Test Configuration" כדי לאמת
5. לחץ על "Authorize" ועקוב אחר זרימת OAuth
6. הקצה הרשאה לגישה ל-Google Sheets

**שלב 3: אמת הגדרה**

- לאחר הרשאה, אתה צריך לראות הודעת הצלחה
- נסה הפעלת סריקה עם "Save to Sheets" מופעל
- בדוק את Google Drive שלך עבור תיקייה חדשה (מזהה תיקייה מהגדרות)

##### שדות הגדרות Google

- **Client ID**: מקונסולת Google (נראה כמו `xxx.apps.googleusercontent.com`)
- **Client Secret**: מקונסולת Google (שמור את זה בסוד!)
- **Redirect URI**: חייב להתאים לגדרה קונסול Google בדיוק
  - ברירת מחדל: `http://localhost:3000/oauth2callback`

---

#### 3. הגדרות AI

##### דגם קטגוריה

- בחירות איזה דגם AI עיבוד עסקאות
- ברירת מחדל: Google Gemini Flash (מהיר וחינם)
- אפשרויות תלויות במפתחות API זמינים

##### דגם אנליסט

- דגם AI לשאלות/תובנות צ'אט
- ברירת מחדל: זהה לדגם קטגוריה

##### קטגוריית ברירת מחדל

- קטגוריה חיסרון אם AI לא יכול לסווג עסקה
- ברירת מחדל: "אחר"

##### קטגוריות מותר

- רשימת קטגוריות הוצאה תקויות
- הוסף קטגוריות מותאם אישית כנדרש
- דוגמאות: אוכל, תחבורה, קניות, מנויים, בריאות, מגורים, בילויים, משכורת, העברות, חשבונות, ביגוד, חינוך, אחר, משכנתא והלוואות, תרומה

---

#### 4. הצפנה וביטחון

##### הגנת מפתח ראשי

- המפתח הראשי שלך מצפין את כל הפרופילים השמורים
- לא ניתן לגשת לפרופילים ללא המפתח הראשי הנכון
- אם תשכח את המפתח הראשי שלך, הפרופילים השמורים הם אבודים

**התרגול הטוב ביותר**:
- השתמש בסיסמה חזקה (12+ תווים, תיבה מעורבבת, מספרים, סמלים)
- כתוב זאת וזכור לעתיד (מנהל סיסמה מומלץ)
- לא תשתף אי פעם את המפתח הראשי שלך

##### אחסון אישור

- אישורים מוצפנים באמצעות המפתח הראשי שלך
- אחסון מקומי בלבד (אף פעם לא מועברים לשרתים חיצוניים)
- ניתוח קורות קורות מתרחש רק כשנחוץ

---

#### 5. בנקים וספקים נתמכים

היישום תומך בסריקה מהמוסדות הפיננסיים הישראליים הבאים:

- **בנקים**:
  - בנק הפועלים
  - בנק לאומי
  - בנק דיסקונט
  - בנק מזרחי טפחות
  - ואחרים הזמינים בספרייה

- **כרטיסי אשראי**:
  - קארט ישראל
  - ויזה כרט
  - וספקי כרטיס אחרים

- **ספקים אחרים**:
  - עשוי לכלול ספקים פינטק נוספים וספקי תשלום

**כדי לבדוק רשימה עדכנית**: 

1. הפעל את היישום
2. לחץ על תפריט ספק
3. כל הספקים הנתמכים ברשימה

---

#### 6. הגדרות מתקדמות

##### תצורת Timeout

- **ברירת מחדל**: 120,000 אלפית שנייה (2 דקות)
- **שינוי ל**: זמן timeout ארוך יותר לחיבורים איטיים או שאילתות מורכבות
- הגדר באפשרויות סריקה לפני הפעלה

##### דפוסי שם קובץ מותאם

- השתמש ב-`{profile}` כדי לכלול שם פרופיל
- השתמש ב-`{date}` לתאריך נוכחי
- דוגמה: `{profile}_{date}.json` → `MyProfile_2024-01-15.json`

##### מצב בדיקה

- שימושי לבדיקה ללא אישורי בנק בעלי ערך
- ייצור עסקאות מדומה
- עוזר לך לחקור את ממשק המשתמש ללא סכנות אישור

---

#### 7. הגדרות לפתרון בעיות

##### בעיות וכללים

| בעיה | סיבות אפשריות | פתרון |
|------|-----------------|----------|
| "אישורים דחויים" | שם משתמש/סיסמה שגוי | אמת אישורים בנק באופן ידני |
| "שגיאת ממשיכה" | שרת בנק איטי | הגברת ערך הזמן בהגדרות |
| "סיווג AI נכשל" | מפתח API חסר | בדוק תצורת הגדרות AI |
| "Google Sheets העלאה נכשלת" | OAuth לא מורשה | הורשה מחדש Google בהגדרות |
| "כישלת הצפנה פרופיל" | מפתח ראשי שגוי | אמת כי מפתח ראשי מוקלד בנכונות |

---

## טיפים כלליים ל-Best Practices

### עבור שני השפות

1. **שמור על המפתח הראשי שלך**
   - זהו סיסמא לכל הפרופילים הצפנים שלך
   - אם הוא אבוד, פרופילים לא ניתן להשתמש

2. **שדרוג בעיות חיבור סריקה**
   - בדוק כניסה ישירה לאתר הבנק שלך ישירות
   - אם הבנק עצמו ירד, הסורק לא יעבוד

3. **הגן על אישורים שלך**
   - לא תשתף משהו עם משהו אחר
   - לא תשנה סיסמה בבנק בלי להעדכן בסורק

4. **השתמש בפרופילים לפשטות**
   - אם אתה מסיר כל יום, שמור פרופיל
   - זה מהיר יותר מאשר להזין אישורים בכל פעם

5. **יצוא נתונים בקביעות**
   - הורד ופיתוח תנגודים באופן תקופתי
   - זה תחזוקה טובה של גיבוי

---

## קבלת עזרה נוספת

- **יומנים**: בדוק כרטיסייה היומנים לביצוע פרטי ודיוק שגיאות
- **OAuth בעיות**: אם יש בעיות Google, אמת הגדרות קונסולת Google Cloud שלך
- **প্রশ্न טেکনিক্যাল**: בעיות טכניות רגולרית? בדוק שרת הוא פועל ו-Ports הנכון פתוח

---

*עדכון אחרון: February 2026 | Version 2.1*

