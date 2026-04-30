# Financial Overview · מבט כלכלי

**מבט כלכלי (Financial Overview)** הוא תוסף (Add-on) בניהול עצמי המריץ את מערכת Financial Overview בתוך Home Assistant. הוא עוזר לכם למשוך נתוני עסקאות מבנקים וכרטיסי אשראי ישראליים, לנתח אותם בממשק משתמש אחד, לייצא נתונים (כולל ל-Google Drive), ולהשתמש (אופציונלית) בתהליכי עבודה מבוססי בינה מלאכותית — כל זאת תוך שמירת המידע על החומרה הפרטית שלכם.

תוסף זה משתמש ב-**Ingress**: לאחר ההתקנה ניתן לפתוח את האפליקציה מתפריט הצד של Home Assistant (סמל הפאנל: גרף פיננסי).

**דמו:** ממשק לדוגמה בדפדפן (נתונים לדוגמה בלבד, ללא חיבור לבנק): [Financial Overview — דמו](https://yohaybn.github.io/Israeli-Financial-Overview/)

## התקנה

1. ב-Home Assistant, עברו אל **הגדרות ← תוספים ← חנות התוספים**.
2. פתחו את תפריט ה-**⋮** ← **מאגרים (Repositories)**.
3. הוסיפו את כתובת ה-URL של מאגר ה-Git הזה ושמרו.
4. רעננו את החנות, מצאו את **Financial Overview** ולחצו על **התקנה**.

ה-Supervisor מושך את ה-Image המוכן מ-GitHub Container Registry (`image` ב-`config.yaml`). דרושה גישת אינטרנט חיצונית ל-GHCR לצורך התקנה ראשונית ועדכונים.

## הגדרות

כל השדות בתוסף הם **אופציונליים**. ניתן להשאיר את לשונית ה-**Configuration** ריקה ולהגדיר הכל מתוך הממשק באפליקציה (**הגדרות / Configuration**) אחרי הפעלה — לשונית התוסף מתאימה למי שמעדיף להזין מפתחות ו-OAuth גם דרך Supervisor.

אם תרצו, פתחו את לשונית ה-**Configuration** של התוסף והזינו כאן ערכים (שקולים להגדרות באפליקציה):

| אפשרות | מטרה |
| :--- | :--- |
| `google_client_id` | מזהה לקוח Google OAuth (עבור Drive / Sheets) |
| `google_client_secret` | סוד לקוח Google OAuth |
| `google_redirect_uri` | כתובת חזור (Callback) של OAuth |
| `drive_folder_id` | מזהה תיקייה ב-Google Drive להעלאות |
| `gemini_api_key` | מפתח API של Google Gemini (סיווג AI / צ'אט) |
| `telegram_bot_token` | טוקן בוט טלגרם להתראות / פקודות בוט |
| `eodhd_api_token` | טוקן API של EODHD (השקעות / פורטפוליו) |

לאחר מכן לחצו על **Start** והשתמשו בלחצן **Open Web UI** או בכניסה מתפריט הצד.

## Ingress ופורטים

מערכת Home Assistant מבצעת פרוקסי לממשק המשתמש דרך **Ingress** תוך שימוש בפורט פנימי **`9203`** (`ingress_port` ב-`config.yaml`). אין מיפוי פורטים נפרד הפונה למשתמש עבור ממשק האינטרנט בעת שימוש ב-Ingress; אין לשנות את פורט ההאזנה מבלי לשנות גם את `ingress_port` ובנייה מחדש/פרסום של ה-Images.

## תיעוד מלא

- קובץ README של המאגר (תכונות, אבטחה, Windows, Docker): [README.md](https://github.com/yohaybn/Israeli-Financial-Overview/blob/main/README.md)
- פריסה ומשתני סביבה: [DEPLOYMENT.md](https://github.com/yohaybn/Israeli-Financial-Overview/blob/main/DEPLOYMENT.md)

**קרדיט:** משיכת נתונים מהבנקים מבוססת על הספרייה הקהילתית [israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers).

---

# Financial Overview

**Financial Overview** is a **self-hosted** add-on that runs **Financial Overview** inside Home Assistant. It helps you pull transactions from Israeli banks and credit cards, explore them in one UI, export (including Google Drive), and optionally use AI-assisted workflows — while keeping data on your own hardware.

This add-on uses **Ingress**: after install you open the app from the Home Assistant sidebar (panel icon: finance chart).

**Demo:** Sample UI in the browser (demo data only — not connected to your bank): [Financial Overview demo](https://yohaybn.github.io/Israeli-Financial-Overview/)

## Install

1. In Home Assistant go to **Settings → Add-ons → Add-on Store**.
2. Open the **⋮** menu → **Repositories**.
3. Add this Git repository URL and save.
4. Reload the store, find **Financial Overview**, and click **Install**.

The Supervisor pulls the prebuilt image from GitHub Container Registry (`image` in `config.yaml`). You need outbound internet access to GHCR on first install and updates.

## Configure

Every option is **optional**. You can leave the add-on **Configuration** tab empty and set everything later in the app UI under **Configuration / Settings** after you start it — the Supervisor tab is only for those who prefer to supply OAuth secrets and API keys there.

If you want to pre-fill values here, open the add-on **Configuration** tab (these mirror what you can set in the app):

| Option | Purpose |
|--------|---------|
| `google_client_id` | Google OAuth client ID (Drive / Sheets) |
| `google_client_secret` | Google OAuth client secret |
| `google_redirect_uri` | OAuth callback URL (if you customize it) |
| `drive_folder_id` | Google Drive folder for uploads |
| `gemini_api_key` | Google Gemini API key (AI categorization / chat) |
| `telegram_bot_token` | Telegram bot token for notifications / bot commands |
| `eodhd_api_token` | EODHD API token (investments / portfolio) |

Then **Start** the add-on and use **Open Web UI** or the sidebar entry.

## Ingress & port

Home Assistant proxies the UI via **Ingress** using the internal port **`9203`** (`ingress_port` in `config.yaml`). There is no separate user-facing port mapping for the Web UI when using Ingress; do not change the listen port without also changing `ingress_port` and rebuilding/publishing images.

## Full documentation

- Repository README (features, security, Windows, Docker): [README.md](https://github.com/yohaybn/Israeli-Financial-Overview/blob/main/README.md)
- Deployment and environment variables: [DEPLOYMENT.md](https://github.com/yohaybn/Israeli-Financial-Overview/blob/main/DEPLOYMENT.md)

## Credits

Bank scraping builds on the community library **[israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers)**.

## Source & license

Same license as the main repository; code lives at the URL in `config.yaml`.