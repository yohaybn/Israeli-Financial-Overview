import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UserGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function UserGuideModal({ isOpen, onClose }: UserGuideModalProps) {
    const { i18n } = useTranslation();
    const [expandedSections, setExpandedSections] = useState<string[]>(['overview']);

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
            subtitle: 'Welcome to Israeli Bank Scraper',
            getStarted: 'Getting Started',
            features: 'features',
            configuration: 'Configuration & Settings',
            sections: [
                {
                    id: 'overview',
                    title: 'What is the Israeli Bank Scraper?',
                    icon: '📱',
                    content: 'A secure financial data management tool that allows you to extract transactions from Israeli banks and credit cards, organize your data with AI, and export to Google Sheets or CSV.'
                },
                {
                    id: 'requirements',
                    title: 'System Requirements',
                    icon: '⚙️',
                    content: 'Modern web browser (Chrome, Firefox, Safari, Edge), Internet connection, JavaScript enabled, and a Master Key (secure password you create).'
                },
                {
                    id: 'runScrape',
                    title: 'How to Run a Scrape',
                    icon: '🔄',
                    content: '1. Select a Provider (your bank)\n2. Enter credentials\n3. Configure options (start date, timeout, etc.)\n4. Click Start Scrape\n5. Wait for completion and download results'
                },
                {
                    id: 'profiles',
                    title: 'Save & Use Profiles',
                    icon: '💾',
                    content: 'Save credentials as profiles to avoid re-entering them. Check "Save Profile", name it, enter your Master Key. Load profiles anytime by selecting from the dropdown.'
                },
                {
                    id: 'explorer',
                    title: 'Results Explorer',
                    icon: '📊',
                    content: 'View all scrape results in the sidebar. Click files to load them, select multiple for aggregation, filter transactions, and categorize with AI.'
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
                    content: 'Automatically categorize transactions with AI, or chat with the AI Analyst to get spending insights. Customize categories in AI Settings.'
                },
                {
                    id: 'export',
                    title: 'Export Options',
                    icon: '📥',
                    content: 'Export as JSON (raw data), CSV (for Excel), or directly to Google Sheets. Multi-file selection exports aggregated data.'
                },
                {
                    id: 'scheduler',
                    title: 'Automation & Scheduler',
                    icon: '⏱️',
                    content: 'Automatically run scrapes on a schedule. Set time, select profiles, enable auto-save to Google Sheets. Test with "Run Now".'
                },
                {
                    id: 'googleSetup',
                    title: 'Google Sheets Setup',
                    icon: '🔗',
                    content: 'Get OAuth credentials from Google Cloud Console. Configure in app settings, authorize with Google, and results will auto-upload.'
                },
                {
                    id: 'security',
                    title: 'Security & Master Key',
                    icon: '🔐',
                    content: 'Your Master Key encrypts all saved profiles. Never share it. Use a strong password and keep it safe. If lost, profiles cannot be decrypted.'
                },
                {
                    id: 'help',
                    title: 'Need Help?',
                    icon: '❓',
                    content: 'Check the Logs tab for execution details. Look for connection errors or timeout messages. Verify credentials and internet connection. This guide is always available via the help button.'
                }
            ]
        },
        he: {
            title: 'מדריך משתמש',
            subtitle: 'ברוכים הבאים לסורק בנקים ישראלי',
            getStarted: 'התחלה',
            features: 'תכונות',
            configuration: 'הגדרות',
            sections: [
                {
                    id: 'overview',
                    title: 'מהו סורק הבנקים הישראלי?',
                    icon: '📱',
                    content: 'כלי ניהול נתונים פיננסיים מאובטח המאפשר לך הוצאת עסקאות מבנקים וכרטיסי אשראי ישראליים, ארגון הנתונים שלך עם AI וייצוא ל-Google Sheets או CSV.'
                },
                {
                    id: 'requirements',
                    title: 'דרישות מערכת',
                    icon: '⚙️',
                    content: 'דפדפן אינטרנט מודרני (Chrome, Firefox, Safari, Edge), חיבור אינטרנט, JavaScript מופעל, ומפתח ראשי (סיסמה מאובטחת שאתה יוצר).'
                },
                {
                    id: 'runScrape',
                    title: 'כיצד להפעיל סריקה',
                    icon: '🔄',
                    content: '1. בחר ספק (בנק שלך)\n2. הזן אישורים\n3. הגדר אפשרויות (תאריך התחלה, timeout וכו\')\n4. לחץ על Start Scrape\n5. חכה לסיום והורד תוצאות'
                },
                {
                    id: 'profiles',
                    title: 'שמור והשתמש בפרופילים',
                    icon: '💾',
                    content: 'שמור אישורים כפרופילים כדי להימנע מהזנת אותם שוב. סמן "Save Profile", תן לו שם, הזן את המפתח הראשי שלך. טען פרופילים בכל עת על ידי בחירה מהתפריט הנפתח.'
                },
                {
                    id: 'explorer',
                    title: 'סייר התוצאות',
                    icon: '📊',
                    content: 'הצג את כל תוצאות הסריקה בסרגל הצד. לחץ על קבצים כדי לטעון אותם, בחר מרובים לאיחוד, סנן עסקאות וסווג עם AI.'
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
                    content: 'סווג באופן אוטומטי עסקאות עם AI, או צ\'אט עם אנליסט AI כדי לקבל תובנות הוצאה. התאם קטגוריות בהגדרות AI.'
                },
                {
                    id: 'export',
                    title: 'אפשרויות ייצוא',
                    icon: '📥',
                    content: 'ייצוא כ-JSON (נתונים גולמיים), CSV (עבור Excel), או ישירות ל-Google Sheets. בחירה מרובה של קבצים מייצאת נתונים מאוחדים.'
                },
                {
                    id: 'scheduler',
                    title: 'אוטומציה ותזמון',
                    icon: '⏱️',
                    content: 'הפעל באופן אוטומטי סריקות בלוח שנה. הגדר זמן, בחר פרופילים, הפעל שמירה אוטומטית ל-Google Sheets. בדוק עם "Run Now".'
                },
                {
                    id: 'googleSetup',
                    title: 'הגדרת Google Sheets',
                    icon: '🔗',
                    content: 'קבל אישורי OAuth מקונסולת Google Cloud. הגדר בהגדרות האפליקציה, אשר עם Google, והתוצאות יעלו באופן אוטומטי.'
                },
                {
                    id: 'security',
                    title: 'ביטחון ומפתח ראשי',
                    icon: '🔐',
                    content: 'המפתח הראשי שלך מצפין את כל הפרופילים השמורים. לא תשתף אותו. השתמש בסיסמה חזקה ושמור עליה בטוח. אם הוא אבוד, לא ניתן להצפין פרופילים.'
                },
                {
                    id: 'help',
                    title: 'צריך עזרה?',
                    icon: '❓',
                    content: 'בדוק את כרטיסייה Logs לפרטי הביצוע. חפש שגיאות חיבור או הודעות timeout. אמת אישורים וחיבור אינטרנט. מדריך זה זמין תמיד דרך כפתור העזרה.'
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
                        title="Close"
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
                            <strong>💡 Tip:</strong> For complete details with setup instructions and screenshots, open the full guide in a new tab using the button below!
                        </p>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-between gap-3">
                    <a
                        href="/GUIDE.html"
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
