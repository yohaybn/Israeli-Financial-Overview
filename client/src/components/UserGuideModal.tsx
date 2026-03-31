import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UserGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function UserGuideModal({ isOpen, onClose }: UserGuideModalProps) {
    const { i18n } = useTranslation();
    const [expandedSections, setExpandedSections] = useState<string[]>(['overview', 'setupWizard']);

    if (!isOpen) return null;

    const toggleSection = (sectionId: string) => {
        setExpandedSections(prev =>
            prev.includes(sectionId)
                ? prev.filter(s => s !== sectionId)
                : [...prev, sectionId]
        );
    };

    const isHebrew = i18n.language === 'he';

    const guides = {
        en: {
            title: 'User Guide',
            subtitle: 'Welcome to Financial Overview',
            getStarted: 'Getting Started',
            features: 'features',
            configuration: 'Configuration & Settings',
            sections: [
                {
                    id: 'overview',
                    title: 'What is Financial Overview?',
                    icon: '📱',
                    content: 'A secure financial data management tool that allows you to extract transactions from Israeli banks and credit cards, organize your data with AI, and export to Google Sheets or CSV.'
                },
                {
                    id: 'setupWizard',
                    title: 'Setup wizard (recommended)',
                    icon: '✨',
                    content: 'Use the in-app setup wizard (onboarding) as the preferred way to configure Telegram, Gemini, Google OAuth/Drive, and your app lock password. It keeps everything consistent and is easier than hunting settings one by one.'
                },
                {
                    id: 'requirements',
                    title: 'System Requirements',
                    icon: '⚙️',
                    content: 'Modern web browser (Chrome, Firefox, Safari, Edge), Internet connection, and JavaScript enabled. App lock (your encryption password) is required for scraping and saved profiles once configured—not for browsing the rest of the UI.'
                },
                {
                    id: 'runScrape',
                    title: 'How to Run a Scrape',
                    icon: '🔄',
                    content: 'Scraping uses the open-source israeli-bank-scrapers library (github.com/eshaham/israeli-bank-scrapers)—not AI. Credentials stay on your server.\n1. Select a Provider (your bank)\n2. Enter credentials\n3. Configure options (start date, timeout, etc.)\n4. Click Start Scrape\n5. Wait for completion and download results'
                },
                {
                    id: 'profiles',
                    title: 'Save & Use Profiles',
                    icon: '💾',
                    content: 'Save credentials as profiles to avoid re-entering them. Credentials are encrypted with a key derived from your app lock password. Check "Save Profile", name it, and unlock when app lock is on. Load profiles from the dropdown.'
                },
                {
                    id: 'explorer',
                    title: 'Results Explorer',
                    icon: '📊',
                    content: 'View all scrape results in the sidebar. Click files to load them, select multiple for aggregation, filter transactions, and categorize with AI.'
                },
                {
                    id: 'dashboard',
                    title: 'Dashboard',
                    icon: '📈',
                    content: 'Monthly overview: income and expenses, subscriptions, analytics, export, and optional AI chat. On narrow screens (<640px) main sections start collapsed. For the current month, completed income dated after today counts as expected inflow, not already received.'
                },
                {
                    id: 'logs',
                    title: 'Logs',
                    icon: '📋',
                    content: 'Server and Client logs (live text), plus structured AI and Scrape histories for debugging pipelines and post-scrape actions.'
                },
                {
                    id: 'configuration',
                    title: 'Configuration',
                    icon: '⚙️',
                    content: 'AI and memory, Insight rules (deterministic bilingual rules), Categories, Scheduler (and scheduled backups), Scrape (including fraud & alerts), Google (OAuth, Sheets, Drive), Telegram, and Maintenance (backups, port, data folder). Use deep links ?view=configuration&tab=<id> when needed (e.g. tab=insight-rules).'
                },
                {
                    id: 'telegram',
                    title: 'Telegram bot',
                    icon: '✈️',
                    content: 'Optional bot for notifications and commands (e.g. /unlock). Full instructions: docs/TELEGRAM_BOT_GUIDE.md in the repo. Configure under Configuration → Telegram or via the setup wizard.'
                },
                {
                    id: 'appLock',
                    title: 'App lock & profile encryption',
                    icon: '🔒',
                    content: 'Your app lock password (min 8 characters) derives the key that encrypts saved bank profiles. Session unlock is required to run scrapes and create/edit profiles when app lock is configured; you can still use dashboard, logs, and much of the UI without unlocking. If you forget the password, you cannot recover encrypted data—delete the profiles (files or UI), reset app lock per host docs, then create profiles again and re-enter bank credentials. Telegram /unlock may work when locked (session only).'
                },
                {
                    id: 'filters',
                    title: 'Filtering & Exclusions',
                    icon: '🔍',
                    content: 'Right-click transactions to exclude similar ones. Active filters appear in the sidebar. Toggle filters on/off with the eye icon or delete with the X.'
                },
                {
                    id: 'ai',
                    title: 'AI Features',
                    icon: '🤖',
                    content: 'Gemini categorization and analyst chat: AI does not see your encrypted profile passwords—only transaction text you send for those features. Scraping is separate (israeli-bank-scrapers, no AI). Customize categories in AI Settings.'
                },
                {
                    id: 'export',
                    title: 'Export Options',
                    icon: '📥',
                    content: 'Export as JSON (raw data), CSV (for Excel), or directly to Google Sheets. Multi-file selection exports aggregated data.'
                },
                {
                    id: 'scheduler',
                    title: 'Scheduled Scraping',
                    icon: '⏱️',
                    content: 'Automatically run scrapes on a schedule. Enable and configure this in the Configuration panel > Scheduler tab. Set time and select profiles.'
                },
                {
                    id: 'googleSetup',
                    title: 'Google Sheets Setup',
                    icon: '🔗',
                    content: 'Get OAuth credentials from Google Cloud Console. Configure in app settings, authorize with Google, and results will auto-upload.'
                },
                {
                    id: 'help',
                    title: 'Need Help?',
                    icon: '❓',
                    content: 'Check the Logs tab. Open full GUIDE.html (Help). README.md, docs/TELEGRAM_BOT_GUIDE.md, and docs/VIDEO_GUIDE.md cover deployment, the Telegram bot, and video storyboards. Verify credentials and internet connection.'
                }
            ]
        },
        he: {
            title: 'מדריך משתמש',
            subtitle: 'ברוכים הבאים למבט כלכלי',
            getStarted: 'התחלה',
            features: 'תכונות',
            configuration: 'הגדרות',
            sections: [
                {
                    id: 'overview',
                    title: 'מהו מבט כלכלי?',
                    icon: '📱',
                    content: 'כלי ניהול נתונים פיננסיים מאובטח המאפשר לך הוצאת עסקאות מבנקים וכרטיסי אשראי ישראליים, ארגון הנתונים שלך עם AI וייצוא ל-Google Sheets או CSV.'
                },
                {
                    id: 'setupWizard',
                    title: 'אשף התקנה (מומלץ)',
                    icon: '✨',
                    content: 'מומלץ להשתמש באשף ההתקנה (Onboarding) כדרך הראשית להגדרת Telegram, Gemini, Google OAuth/Drive וסיסמת נעילת האפליקציה — עקבי ונוח יותר מלחפש כל הגדרה בנפרד.'
                },
                {
                    id: 'requirements',
                    title: 'דרישות מערכת',
                    icon: '⚙️',
                    content: 'דפדפן מודרני, חיבור אינטרנט ו-JavaScript. נעילת אפליקציה (סיסמת ההצפנה) נדרשת לסריקה ולפרופילים שמורים כשהיא מוגדרת — לא לצפייה בשאר הממשק.'
                },
                {
                    id: 'runScrape',
                    title: 'כיצד להפעיל סריקה',
                    icon: '🔄',
                    content: 'הסריקה מבוססת על israeli-bank-scrapers (קוד פתוח, לא AI). האישורים נשארים בשרת שלך.\n1. בחר ספק (בנק שלך)\n2. הזן אישורים\n3. הגדר אפשרויות (תאריך התחלה, timeout וכו\')\n4. לחץ על Start Scrape\n5. חכה לסיום והורד תוצאות'
                },
                {
                    id: 'profiles',
                    title: 'שמור והשתמש בפרופילים',
                    icon: '💾',
                    content: 'שמור אישורים כפרופילים; הם מוצפנים במפתח מסיסמת נעילת האפליקציה. סמן "Save Profile", תן שם, ושחרר כשנעילה פעילה. טען פרופילים מהתפריט.'
                },
                {
                    id: 'explorer',
                    title: 'סייר התוצאות',
                    icon: '📊',
                    content: 'הצג את כל תוצאות הסריקה בסרגל הצד. לחץ על קבצים כדי לטעון אותם, בחר מרובים לאיחוד, סנן עסקאות וסווג עם AI.'
                },
                {
                    id: 'dashboard',
                    title: 'דשבורד',
                    icon: '📈',
                    content: 'סיכום חודשי: הכנסות והוצאות, מנויים, אנליטיקה, ייצוא וצ\'אט AI אופציונלי. במסכים צרים (<640px) אזורים מרכזיים מתחילים מכווצים. בחודש הנוכחי, הכנסה שהושלמה עם תאריך אחרי היום נספרת כצפי להגיע, לא כבר התקבלה.'
                },
                {
                    id: 'logs',
                    title: 'יומנים',
                    icon: '📋',
                    content: 'יומני שרת ולקוח (טקסט חי), וכן היסטוריות AI וסריקה מובנות לניפוי שגיאות וצינור פעולות אחרי סריקה.'
                },
                {
                    id: 'configuration',
                    title: 'הגדרות',
                    icon: '⚙️',
                    content: 'AI וזיכרון, כללי תובנות (כללים דטרמיניסטיים דו-לשוניים), קטגוריות, מתזמן (וגיבויים מתוזמנים), סריקה (כולל הונאה והתראות), גוגל (OAuth, Sheets, Drive), טלגרם, תחזוקה (גיבויים, פורט, תיקיית נתונים). קישורים עמוקים: ?view=configuration&tab=<id> (למשל tab=insight-rules).'
                },
                {
                    id: 'telegram',
                    title: 'בוט טלגרם',
                    icon: '✈️',
                    content: 'בוט אופציונלי להתראות ופקודות (למשל /unlock). מדריך מלא: docs/TELEGRAM_BOT_GUIDE.md במאגר. הגדרה תחת הגדרות → Telegram או דרך אשף ההתקנה.'
                },
                {
                    id: 'appLock',
                    title: 'נעילה והצפנת פרופילים',
                    icon: '🔒',
                    content: 'סיסמת נעילת האפליקציה (מינימום 8 תווים) מפיקה את מפתח ההצפנה לפרופילי בנק. כשנעילה מוגדרת, נדרש שחרור סשן לסריקה וליצירה/עריכת פרופילים; אפשר עדיין להשתמש בדשבורד, יומנים ורוב הממשק בלי לשחרר. אם שכחת את הסיסמה — אין שחזור לנתונים מוצפנים: מחק פרופילים (קבצים או בממשק), אפס נעילה לפי תיעוד המארח, צור פרופילים מחדש והזן מחדש פרטי בנק. ב-Telegram /unlock לסשן בלבד.'
                },
                {
                    id: 'filters',
                    title: 'סינון והחרגות',
                    icon: '🔍',
                    content: 'לחץ בעכבר ימין על עסקאות כדי להחריג דומים. מסננים פעילים מופיעים בסרגל הצד. הבדל מסננים עם סמל העיניים או מחק עם ה-X.'
                },
                {
                    id: 'ai',
                    title: 'תכונות AI',
                    icon: '🤖',
                    content: 'Gemini לסיווג וצ\'אט: ל-AI אין גישה לסיסמאות פרופיל מוצפנות—רק לטקסט עסקאות לתכונות אלה. הסריקה נפרדת (israeli-bank-scrapers, ללא AI). התאם קטגוריות בהגדרות AI.'
                },
                {
                    id: 'export',
                    title: 'אפשרויות ייצוא',
                    icon: '📥',
                    content: 'ייצוא כ-JSON (נתונים גולמיים), CSV (עבור Excel), או ישירות ל-Google Sheets. בחירה מרובה של קבצים מייצאת נתונים מאוחדים.'
                },
                {
                    id: 'scheduler',
                    title: 'תזמון סריקות',
                    icon: '⏱️',
                    content: 'הפעל באופן אוטומטי סריקות בלוח זמנים. הפעל והגדר זאת בחלונית הגדרות > כרטיסיית מתזמן. קבע זמן ובחר פרופילים.'
                },
                {
                    id: 'googleSetup',
                    title: 'הגדרת Google Sheets',
                    icon: '🔗',
                    content: 'קבל אישורי OAuth מקונסולת Google Cloud. הגדר בהגדרות האפליקציה, אשר עם Google, והתוצאות יעלו באופן אוטומטי.'
                },
                {
                    id: 'help',
                    title: 'צריך עזרה?',
                    icon: '❓',
                    content: 'בדוק את לשונית יומנים. GUIDE.html המלא (עזרה). README, docs/TELEGRAM_BOT_GUIDE.md ו-docs/VIDEO_GUIDE.md. אמת אישורים וחיבור אינטרנט.'
                }
            ]
        }
    };

    const content = isHebrew ? guides.he : guides.en;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300 ${isHebrew ? 'direction-rtl' : ''}`}>
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-black text-white mb-1">{content.title}</h2>
                        <p className="text-blue-100 text-sm">{content.subtitle}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-blue-800 p-2 rounded-lg transition-colors flex-shrink-0"
                        title={isHebrew ? 'סגור' : 'Close'}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1 p-6">
                    <div className="space-y-3">
                        {content.sections.map((section) => (
                            <div
                                key={section.id}
                                className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                            >
                                <button
                                    onClick={() => toggleSection(section.id)}
                                    className={`w-full px-4 py-3.5 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors ${expandedSections.includes(section.id) ? 'bg-blue-50 border-b border-gray-200' : ''}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{section.icon}</span>
                                        <span className="font-semibold text-gray-800">{section.title}</span>
                                    </div>
                                    <svg
                                        className={`w-5 h-5 text-gray-600 transition-transform ${expandedSections.includes(section.id) ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                    </svg>
                                </button>

                                {expandedSections.includes(section.id) && (
                                    <div className="px-4 py-3 bg-white text-sm text-gray-700 whitespace-pre-line">
                                        {section.content}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Footer Info */}
                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-blue-800">
                            <strong>💡 {isHebrew ? 'טיפ:' : 'Tip:'}</strong>{' '}
                            {isHebrew
                                ? 'למדריך מלא (עברית/אנגלית), README, ומדריך וידאו (docs/VIDEO_GUIDE.md) — פתח את המדריך המלא בלשונית חדשה למטה.'
                                : 'For the full bilingual guide (GUIDE.html), README, and video storyboard (docs/VIDEO_GUIDE.md), open the full guide in a new tab below.'}
                        </p>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-between gap-3">
                    <a
                        href={`${import.meta.env.BASE_URL}GUIDE.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        {isHebrew ? 'פתח מדריך מלא' : 'Open Full Guide'}
                    </a>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        {isHebrew ? 'סגור' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
}
