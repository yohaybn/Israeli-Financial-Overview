/**
 * Telegram Bot Service
 * Handles Telegram bot interactions including AI chat and scraper control
 */

import { Telegraf, Context, Markup, Input } from 'telegraf';
import { Message } from 'telegraf/types';
import path from 'path';
import fs from 'fs-extra';
import { serverLogger } from '../utils/logger.js';
import { logExternal, TELEGRAM_API_HOST } from '../utils/externalServiceLog.js';
import { AiService, type ConversationTurn } from './aiService.js';
import { ScraperService } from './scraperService.js';
import { profileService, ProfileService } from './profileService.js';
import { appLockService } from './appLockService.js';
import { StorageService } from './storageService.js';
import {
  Profile,
  ScrapeRequest,
  ScrapeResult,
  type Transaction,
  type TransactionReviewItem,
  transactionNeedsReview,
} from '@app/shared';
import { transactionsToCsv, transactionsToJson, buildCategoryExpenseSlices } from '@app/shared';
import { ConfigService } from './configService.js';
import { renderCategorySpendingPiePng } from './categoryPieImageService.js';
import { postScrapeService } from './postScrapeService.js';
import { isUserPersonaEmpty, sliceTransactionsForAnalyst } from '@app/shared';
import { buildUnifiedChatQueryWithMemory, mergeAndPersistAiMemory } from './unifiedAiChatMemory.js';
import { getTelegramMaxMessageChars, splitTelegramHtmlChunks, splitTelegramPlainText } from '../utils/telegramTextSplit.js';
import { isSafeTelegramRelativeFilePath } from '../utils/safeTelegramBotFileUrl.js';
import { getBoundSessionIdForProfile } from './oneZeroOtpSessionStore.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const TEL_CONFIG_PATH = path.join(DATA_DIR, 'config', 'telegram_config.json');
const MEMO_REPLY_MAP_PATH = path.join(DATA_DIR, 'telegram_memo_reply_map.json');
const MEMO_REPLY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Min alert score (1–100) for Telegram push notifications. Default 75. Set env AI_TELEGRAM_ALERT_MIN_SCORE to override (e.g. 85 for fewer pings, 0 for all). */
function getTelegramAiAlertMinScore(): number {
  const raw = process.env.AI_TELEGRAM_ALERT_MIN_SCORE;
  if (raw === undefined || raw === '') return 75;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 75;
  return Math.max(1, Math.min(100, Math.round(n)));
}

export interface TelegramConfig {
  botToken: string;
  enabled: boolean;
  adminChatIds: string[];
  notificationChatIds: string[];
  /** Per chat: account numbers (or *) for memo/review Telegram prompts; see resolveMemoPromptChatIds */
  notificationAccountsByChatId?: Record<string, string[]>;
  allowedUsers?: string[]; // Empty = allow all
  language?: 'en' | 'he'; // Bot UI language
}

/** Public bot profile from Telegram (getMe + optional profile photo presence). */
export interface TelegramBotIdentity {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  openTelegramUrl: string;
  hasAvatar: boolean;
}

function normalizeAccountKey(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\D/g, '');
}

function accountMatchesEntry(txnNorm: string, entryRaw: string): boolean {
  const e = String(entryRaw).trim();
  if (!e || e === '*') return false;
  const entryNorm = normalizeAccountKey(e);
  if (entryNorm.length === 0) return false;
  return txnNorm === entryNorm || txnNorm.endsWith(entryNorm) || entryNorm.endsWith(txnNorm);
}

function hasMemoAccountRouting(cfg: TelegramConfig): boolean {
  const m = cfg.notificationAccountsByChatId;
  if (!m || Object.keys(m).length === 0) return false;
  return Object.values(m).some(
    (arr) => Array.isArray(arr) && arr.some((x) => String(x).trim() !== '')
  );
}

/** Memo prompts: specific account → those chats + * chats; unmapped account → all notification chats (+ * chats redundant). */
export function resolveMemoPromptChatIds(
  cfg: TelegramConfig,
  accountNumber: string,
  notificationChatIds: string[],
  requestTgChat?: string
): string[] {
  const base = [...new Set(notificationChatIds.map(String).filter(Boolean))];
  if (!hasMemoAccountRouting(cfg)) {
    const s = new Set(base);
    if (requestTgChat) s.add(String(requestTgChat));
    return [...s];
  }

  const map = cfg.notificationAccountsByChatId || {};
  const txnNorm = normalizeAccountKey(accountNumber);

  const specificMatches: string[] = [];
  const starMatches: string[] = [];

  for (const cid of base) {
    const list = map[cid] || [];
    if (list.some((x) => String(x).trim() === '*')) {
      starMatches.push(cid);
    }
    for (const entry of list) {
      if (accountMatchesEntry(txnNorm, entry)) {
        specificMatches.push(cid);
        break;
      }
    }
  }

  let targets: string[];
  if (specificMatches.length > 0) {
    targets = [...new Set([...specificMatches, ...starMatches])];
  } else {
    targets = [...base];
  }

  if (requestTgChat) {
    targets = [...new Set([...targets, String(requestTgChat)])];
  }
  return targets;
}

// Translation strings for the bot
const BOT_STRINGS: Record<'en' | 'he', Record<string, string>> = {
  en: {
    accessDenied: '❌ <b>Access Denied</b>\n\nYou don\'t have permission to use this bot yet.',
    yourUserId: '<b>Your User ID:</b>',
    shareId: 'Please share your User ID with the manager to request access.',
    welcome: '👋 Welcome to Financial Overview Bot!\n\nI can help you with:\n• 📊 Run bank scrapers and get notifications\n• 💬 Chat with AI about your transactions\n• ⚙️ Manage your settings\n\nUse /help for available commands',
    helpText: '📖 <b>Available Commands:</b>\n\n<b>Scraping:</b>\n/scrape - Run a bank scraper\n/status - Check scraper status\n\n<b>One Zero:</b>\n/onezero_otp - SMS OTP for One Zero (token saved on server only)\n\n<b>Transactions:</b>\n/memo - Set memo on a transaction (copy id from dashboard)\n/review — List transactions that need a memo or category\n/export csv — Download all transactions as CSV\n/export json — Download all transactions as JSON\n/export csv 2026-03 — Same for one month (YYYY-MM)\n\n<b>Charts:</b>\n/card categories — Spending by category (pie) for the current month\n/card categories 2026-03 — Same for a specific month (YYYY-MM)\n\n<b>AI Chat:</b>\n/chat - Start AI chat about transactions\n\n<b>Notifications:</b>\n/subscribe - Enable notifications\n/unsubscribe - Disable notifications\n\n<b>Settings:</b>\n/settings - Manage your preferences\n\n<b>App lock:</b>\n/unlock - Enter app password when the web UI is locked\n\n<b>Help:</b>\n/help - Show this message',
    noProfiles: '❌ No profiles configured. Please set up a profile first.',
    selectProfile: '🏦 Select the profile to scrape:',
    chatModeActive: '💬 AI Chat Mode activated!\n\nAsk me questions about your transactions:\n• "What are my largest expenses?"\n• "Analyze my spending this month"\n• "Show me transactions in the food category"\n\nType /done or /cancel to exit chat mode',
    settingsMenu: '⚙️ Settings Menu:',
    settingsBtnNotif: '📬 Notifications',
    settingsBtnProfile: '👤 Profile',
    botStatus: '🤖 Bot Status:',
    botOnline: '✅ Online',
    botOffline: '❌ Offline',
    configuredFeatures: 'Configured Features:',
    notifChats: 'Notifications',
    adminChats: 'Admin Chats',
    token: 'Token',
    subscribed: '✅ You are now subscribed to notifications',
    unsubscribed: '✅ You have been unsubscribed from notifications',
    notAuthorized: '❌ You are not authorized.',
    exitedChatMode: '✅ Exited AI chat mode.',
    unknownCommand: 'Unknown command. Available commands:',
    notifEnabled: '✅ Enabled',
    notifDisabled: '⛔ Disabled',
    scraperStarting: 'Starting scraper...',
    scraperExecuting: '⏳ Executing scraper...',
    profileNotFound: '❌ Profile not found',
    scraperSuccess: '✅ Scraper executed!',
    profileLabel: 'Profile',
    accountsLabel: 'Accounts',
    transactionsLabel: 'Transactions',
    savedLabel: 'Saved',
    errorProcessing: '❌ Error processing your message',
    errorScraper: '❌ Error processing scraper request',
    thinkingMsg: '💭 Thinking...',
    comingSoon: 'Coming soon!',
    unauthorizedChat: 'You are not allowed to use chat commands.',
    unauthorizedSettings: 'You are not allowed to open settings.',
    unauthorizedSubscribe: 'You are not allowed to subscribe to notifications.',
    unauthorizedUnsubscribe: 'You are not allowed to unsubscribe from notifications.',
    errorExecutingScraper: '❌ Error executing scraper',
    errorRetrievingProfiles: '❌ Error retrieving profiles',
    invalidStartDate: 'Invalid start date',
    startDatePrompt: 'Send start date in format YYYY-MM-DD (example: 2026-01-01).',
    invalidDateFormat: 'Invalid date. Please use YYYY-MM-DD.',
    startDateSetPrefix: 'Start date set to',
    chooseWhatToScrape: 'Choose what to scrape:',
    scrapeAllLabel: 'Scrape ALL',
    unauthorizedNoPermission: 'Unauthorized - you do not have permission.',
    financialTipTitle: '🪡 <b>Financial Tip:</b>',
    financialTipLine1: 'For detailed analysis of your transactions, please use the web dashboard where you can upload and analyze your banking data.',
    yourQuestionPrefix: 'Your question:',
    financialTipLine2: 'Visit the web interface to get detailed insights and AI-powered analysis of your spending patterns!',
    aiChatErrorTitle: '❌ <b>AI request failed</b>',
    aiChatErrorCodeLabel: '<b>Code:</b>',
    aiChatErrorExplanationLabel: '<b>Details:</b>',
    noAiResponse: '❌ No response from AI',
    errorUpdatingSettings: 'Error updating settings',
    errorExitingChatMode: '❌ Error exiting chat mode',
    scrapeFailedPrefix: 'Scrape failed:',
    unlockNotConfigured: 'ℹ️ App password is not configured in the web UI yet.',
    unlockAlready: '✅ App is already unlocked.',
    unlockSendPassword:
      '🔐 Send your app password in the next message.\n\nOr use: <code>/unlock yourpassword</code>\n\n/cancel to abort.',
    unlockSendPasswordPlain: 'Send your password as a text message, or /cancel to abort.',
    unlockSuccess: '✅ Unlocked. Scraping and saved profiles work again.',
    unlockWrong: '❌ Wrong password. Try again or /cancel.',
    unlockCancelled: 'Unlock cancelled.',
    unlockError: '❌ Unlock failed (server error).',
    appLockedHint:
      '🔒 <b>Application is locked</b>\n\nScraping from Telegram is off until you unlock.\n\n<b>Unlock in this chat:</b>\n• <code>/unlock yourpassword</code>\n• or send <code>/unlock</code> alone, then your password in the next message\n\nYou can also unlock in the web dashboard (password field in the orange bar).',
    memoHelp:
      '📝 <b>Set transaction memo</b>\n\nCopy a transaction <b>ID</b> from the web dashboard (transaction table / details).\n\n<b>Reply to review notification:</b> reply to the per-transaction message with your memo text.\n\n<b>One line:</b>\n<code>/memo TRANSACTION_ID Your note here</code>\n\n<b>Two steps:</b>\n<code>/memo TRANSACTION_ID</code>\n→ then send the note as your next message.\n\n/cancel to abort.',
    memoSendNext: '📝 Send the memo text as your next message, or /cancel to abort.',
    memoSuccess: '✅ Memo saved for transaction <code>{{id}}</code>.\nPreview: {{preview}}',
    categorySuccess: '✅ Category set to <b>{{category}}</b> for transaction <code>{{id}}</code>.',
    memoNotFound: '❌ No transaction with that ID. Copy the ID from the web app (unified transaction list).',
    memoCancelled: 'Memo entry cancelled.',
    memoReplySendPlainText: 'Send your memo as plain text (not a command).',
    memoReplyCancelled: 'Cancelled.',
    exportUsage:
      '📤 <b>Export transactions</b>\n\nSend:\n• <code>/export csv</code> — spreadsheet (Excel-friendly)\n• <code>/export json</code> — full JSON (same as the web export)\n• <code>/export csv YYYY-MM</code> or <code>/export json YYYY-MM</code> — one calendar month only\n\nIncludes all unified transactions (same as the dashboard).',
    exportEmpty: '📭 No transactions to export yet.',
    exportCaption: '📤 All transactions ({{count}} rows). Unified database export.',
    exportCaptionMonth: '📤 Month {{month}} · {{count}} rows.',
    exportInvalidMonth: '❌ Invalid month. Use YYYY-MM (example: 2026-03).',
    exportFailed: '❌ Export failed. Try again or use the web dashboard.',
    cardUsage:
      '📊 <b>Card image</b>\n\n• <code>/card categories</code> — spending by category (pie), current month\n• <code>/card categories YYYY-MM</code> — same for that month (e.g. <code>2026-03</code>)',
    cardInvalidMonth: '❌ Invalid month. Use YYYY-MM (example: 2026-03).',
    cardEmpty: '📭 No expense data for that month (same filters as dashboard analytics).',
    cardFailed: '❌ Could not render the chart. Try again from the dashboard.',
    cardTitleCategories: 'Spending by category',
    /** Merged small slices in Telegram pie (distinct from a literal category named "Other") */
    cardOtherMerged: 'Other (small categories)',
    cardCaption: '📊 {{month}} · Total expenses {{total}}',
    reviewDisabled:
      'ℹ️ Transaction review reminders are turned off in Post-scrape settings (web app), or both transfer and uncategorized checks are disabled.',
    reviewEmpty: '✅ No transactions need a memo or category right now.',
    reviewHeader:
      '📝 <b>Transactions to review</b> ({{count}})\n\nUse <code>/memo ID …</code> or reply to a review message. Set category from the dashboard or send the exact category label here.',
    reviewFooter: 'Same rules as the dashboard: transfers need a memo or a different category; default category (אחר) needs a real category.',
    reviewReasonTransfers: 'Transfers',
    reviewReasonUncategorized: 'Uncategorized',
    newAiAlertTitle: '🤖 <b>New AI alert</b>',
    newAiAlertsTitle: '🤖 <b>New AI alerts</b>',
    newAiAlertScoreLine: 'Score: {{score}}/100',
    onezeroOtpNoProfiles: '❌ No <b>One Zero</b> profiles found. Add one in the web app first.',
    onezeroOtpSelectTitle: '🏦 <b>One Zero — SMS OTP</b>\n\nChoose the profile (phone must be set with +country code):',
    onezeroOtpBadPhone:
      '❌ This profile has no valid international phone in saved credentials.\n\nOpen the profile in the web app and set <b>Phone Number</b> (e.g. +972…).',
    onezeroOtpSmsSent:
      '📲 SMS sent. Reply with the <b>verification code</b> as plain digits.\n\n/cancel to abort.',
    onezeroOtpPendingWeb:
      '⏳ An OTP session is already active for this profile (SMS may have been requested from the web app).\n\nReply with the <b>verification code</b> from SMS.\n\n/cancel to abort.',
    onezeroOtpSendCode: 'Send the SMS code as digits only, or /cancel.',
    onezeroOtpSuccess:
      '✅ One Zero OTP verified. The long-term token was saved on the server for this profile (not shown here).',
    onezeroOtpCancelled: 'One Zero OTP flow cancelled.',
  },
  he: {
    accessDenied: '❌ <b>גישה נדחתה</b>\n\nאין לך הרשאה להשתמש בבוט זה עדיין.',
    yourUserId: '<b>מזהה המשתמש שלך:</b>',
    shareId: 'אנא שתף את מזהה המשתמש שלך עם המנהל כדי לבקש גישה.',
    welcome: '👋 ברוך הבא לבוט מבט כלכלי!\n\nאני יכול לעזור לך עם:\n• 📊 הרצת סורקים ושיגור התראות\n• 💬 שיחה עם AI על העסקאות שלך\n• ⚙️ ניהול ההגדרות שלך\n\nהקלד /help לרשימת הפקודות',
    helpText: '📖 <b>פקודות זמינות:</b>\n\n<b>סריקה:</b>\n/scrape - הרץ סורק בנק\n/status - בדוק סטטוס סורק\n\n<b>One Zero:</b>\n/onezero_otp - OTP ב-SMS (האסימון נשמר בשרת בלבד)\n\n<b>עסקאות:</b>\n/memo - הוסף הערה לעסקה (העתק מזהה מלוח הבקרה)\n/review — רשימת עסקאות שחסרה הערה או קטגוריה\n/export csv — הורד את כל העסקאות כ-CSV\n/export json — הורד את כל העסקאות כ-JSON\n/export csv 2026-03 — אותו דבר לחודש אחד (YYYY-MM)\n\n<b>גרפים:</b>\n/card categories — הוצאות לפי קטגוריה (עוגה) לחודש הנוכחי\n/card categories 2026-03 — אותו דבר לחודש אחר (YYYY-MM)\n\n<b>שיחת AI:</b>\n/chat - התחל שיחת AI על עסקאות\n\n<b>התראות:</b>\n/subscribe - הפעל התראות\n/unsubscribe - בטל התראות\n\n<b>הגדרות:</b>\n/settings - נהל את ההעדפות שלך\n\n<b>נעילת אפליקציה:</b>\n/unlock - הזן סיסמת אפליקציה כשהממשק נעול\n\n<b>עזרה:</b>\n/help - הצג הודעה זו',
    noProfiles: '❌ לא הוגדרו פרופילים. אנא הגדר פרופיל תחילה.',
    selectProfile: '🏦 בחר פרופיל לסריקה:',
    chatModeActive: '💬 מצב שיחת AI הופעל!\n\nשאל אותי שאלות על העסקאות שלך:\n• "מהן הוצאותיי הגדולות ביותר?"\n• "נתח את ההוצאות שלי החודש"\n• "הצג עסקאות בקטגוריית מזון"\n\nהקלד /done או /cancel ליציאה ממצב שיחה',
    settingsMenu: '⚙️ תפריט הגדרות:',
    settingsBtnNotif: '📬 התראות',
    settingsBtnProfile: '👤 פרופיל',
    botStatus: '🤖 סטטוס הבוט:',
    botOnline: '✅ פעיל',
    botOffline: '❌ לא פעיל',
    configuredFeatures: 'פיצ׳רים מוגדרים:',
    notifChats: 'התראות',
    adminChats: 'צ׳אטים של מנהלים',
    token: 'טוקן',
    subscribed: '✅ נרשמת להתראות',
    unsubscribed: '✅ בוטלה הרשמתך להתראות',
    notAuthorized: '❌ אין לך הרשאה.',
    exitedChatMode: '✅ יצאת ממצב שיחת AI.',
    unknownCommand: 'פקודה לא מוכרת. פקודות זמינות:',
    notifEnabled: '✅ מופעל',
    notifDisabled: '⛔ מבוטל',
    scraperStarting: 'מתחיל סריקה...',
    scraperExecuting: '⏳ מריץ סורק...',
    profileNotFound: '❌ פרופיל לא נמצא',
    scraperSuccess: '✅ הסריקה הושלמה!',
    profileLabel: 'פרופיל',
    accountsLabel: 'חשבונות',
    transactionsLabel: 'עסקאות',
    savedLabel: 'נשמר',
    errorProcessing: '❌ שגיאה בעיבוד ההודעה שלך',
    errorScraper: '❌ שגיאה בעיבוד בקשת הסריקה',
    thinkingMsg: '💭 חושב...',
    comingSoon: 'בקרוב!',
    unauthorizedChat: 'אין לך הרשאה להשתמש בפקודות צ׳אט.',
    unauthorizedSettings: 'אין לך הרשאה לפתוח הגדרות.',
    unauthorizedSubscribe: 'אין לך הרשאה להירשם להתראות.',
    unauthorizedUnsubscribe: 'אין לך הרשאה לבטל הרשמה להתראות.',
    errorExecutingScraper: '❌ שגיאה בהרצת הסורק',
    errorRetrievingProfiles: '❌ שגיאה בטעינת פרופילים',
    invalidStartDate: 'תאריך התחלה לא תקין',
    startDatePrompt: 'שלח תאריך התחלה בפורמט YYYY-MM-DD (דוגמה: 2026-01-01).',
    invalidDateFormat: 'תאריך לא תקין. נא להשתמש ב-YYYY-MM-DD.',
    startDateSetPrefix: 'תאריך התחלה הוגדר ל-',
    chooseWhatToScrape: 'בחר מה לסרוק:',
    scrapeAllLabel: 'סרוק הכל',
    unauthorizedNoPermission: 'אין לך הרשאה לפעולה זו.',
    financialTipTitle: '🪡 <b>טיפ פיננסי:</b>',
    financialTipLine1: 'לניתוח מפורט של העסקאות שלך, אנא השתמש בדשבורד האינטרנטי שבו ניתן להעלות ולנתח נתוני בנק.',
    yourQuestionPrefix: 'השאלה שלך:',
    financialTipLine2: 'פתח את ממשק הווב כדי לקבל תובנות מפורטות וניתוח מבוסס AI על דפוסי ההוצאה שלך!',
    aiChatErrorTitle: '❌ <b>בקשת AI נכשלה</b>',
    aiChatErrorCodeLabel: '<b>קוד:</b>',
    aiChatErrorExplanationLabel: '<b>פירוט:</b>',
    noAiResponse: '❌ לא התקבלה תשובה מ-AI',
    errorUpdatingSettings: 'שגיאה בעדכון הגדרות',
    errorExitingChatMode: '❌ שגיאה ביציאה ממצב שיחה',
    scrapeFailedPrefix: 'הסריקה נכשלה:',
    unlockNotConfigured: 'ℹ️ סיסמת אפליקציה עדיין לא הוגדרה בממשק האינטרנט.',
    unlockAlready: '✅ האפליקציה כבר לא נעולה.',
    unlockSendPassword:
      '🔐 שלח את סיסמת האפליקציה בהודעה הבאה.\n\nאו: <code>/unlock הסיסמה</code>\n\n/cancel לביטול.',
    unlockSendPasswordPlain: 'שלח את הסיסמה כטקסט, או /cancel לביטול.',
    unlockSuccess: '✅ הנעילה בוטלה. סריקות ופרופילים זמינים שוב.',
    unlockWrong: '❌ סיסמה שגויה. נסה שוב או /cancel.',
    unlockCancelled: 'ביטול נעילה בוטל.',
    unlockError: '❌ ביטול הנעילה נכשל (שגיאת שרת).',
    appLockedHint:
      '🔒 <b>האפליקציה נעולה</b>\n\nסריקה מטלגרם כבויה עד שתבטל את הנעילה.\n\n<b>ביטול נעילה בצ׳אט:</b>\n• <code>/unlock הסיסמה</code>\n• או שלח <code>/unlock</code> לבד, ואז את הסיסמה בהודעה הבאה\n\nאפשר גם לבטל נעילה בדשבורד האינטרנט (שדה סיסמה בשורה הכתומה).',
    memoHelp:
      '📝 <b>הוספת הערה לעסקה</b>\n\nהעתק את <b>מזהה העסקה</b> מלוח הבקרה (טבלת עסקאות / פרטים).\n\n<b>תשובה להתראה:</b> השב להודעה שמציגה עסקה אחת והקלד את ההערה.\n\n<b>בשורה אחת:</b>\n<code>/memo מזהה_עסקה הטקסט שלך</code>\n\n<b>בשתי שליחות:</b>\n<code>/memo מזהה_עסקה</code>\n→ ואז שלח את ההערה בהודעה הבאה.\n\n/cancel לביטול.',
    memoSendNext: '📝 שלח את טקסט ההערה בהודעה הבאה, או /cancel לביטול.',
    memoSuccess: '✅ ההערה נשמרה לעסקה <code>{{id}}</code>.\nתצוגה: {{preview}}',
    categorySuccess: '✅ הקטגוריה הוגדרה ל-<b>{{category}}</b> לעסקה <code>{{id}}</code>.',
    memoNotFound: '❌ לא נמצאה עסקה עם המזהה הזה. העתק את המזהה מהאפליקציה (רשימת עסקאות מאוחדת).',
    memoCancelled: 'הזנת ההערה בוטלה.',
    memoReplySendPlainText: 'שלח את ההערה כטקסט רגיל (לא פקודה).',
    memoReplyCancelled: 'בוטל.',
    exportUsage:
      '📤 <b>ייצוא עסקאות</b>\n\nשלח:\n• <code>/export csv</code> — גיליון (מתאים ל-Excel)\n• <code>/export json</code> — JSON מלא (כמו בייצוא מהאתר)\n• <code>/export csv YYYY-MM</code> או <code>/export json YYYY-MM</code> — חודש קלנדרי אחד בלבד\n\nכולל את כל העסקאות המאוחדות (כמו בלוח הבקרה).',
    exportEmpty: '📭 אין עדיין עסקאות לייצוא.',
    exportCaption: '📤 כל העסקאות ({{count}} שורות). ייצוא ממסד הנתונים המאוחד.',
    exportCaptionMonth: '📤 חודש {{month}} · {{count}} שורות.',
    exportInvalidMonth: '❌ חודש לא תקין. השתמש ב-YYYY-MM (לדוגמה: 2026-03).',
    exportFailed: '❌ הייצוא נכשל. נסה שוב או השתמש בייצוא מהדשבורד.',
    cardUsage:
      '📊 <b>תמונת כרטיס</b>\n\n• <code>/card categories</code> — הוצאות לפי קטגוריה (עוגה), חודש נוכחי\n• <code>/card categories YYYY-MM</code> — אותו דבר לחודש (למשל <code>2026-03</code>)',
    cardInvalidMonth: '❌ חודש לא תקין. השתמש ב-YYYY-MM (לדוגמה: 2026-03).',
    cardEmpty: '📭 אין נתוני הוצאות לחודש הזה (אותם מסננים כמו בניתוח בדשבורד).',
    cardFailed: '❌ לא ניתן ליצור את התרשים. נסה שוב מהדשבורד.',
    cardTitleCategories: 'הוצאות לפי קטגוריה',
    cardOtherMerged: 'אחר (קטנים)',
    cardCaption: '📊 {{month}} · סה״כ הוצאות {{total}}',
    reviewDisabled:
      'ℹ️ תזכורות לסקירת עסקאות כבויות בהגדרות אחרי־סריקה (באתר), או ששני סוגי הבדיקה (העברות / לא מסווג) כבויים.',
    reviewEmpty: '✅ אין עכשיו עסקאות שחסרה להן הערה או קטגוריה.',
    reviewHeader:
      '📝 <b>עסקאות לסקירה</b> ({{count}})\n\nהשתמש ב־<code>/memo מזהה …</code> או השב להודעת סקירה. שינוי קטגוריה מהדשבורד או שליחת שם קטגוריה מדויק כאן.',
    reviewFooter: 'אותם כללים כמו בדשבורד: העברות דורשות הערה או קטגוריה אחרת; קטגוריית ברירת מחדל (אחר) דורשת קטגוריה אמיתית.',
    reviewReasonTransfers: 'העברות',
    reviewReasonUncategorized: 'לא מסווג',
    newAiAlertTitle: '🤖 <b>התראת AI חדשה</b>',
    newAiAlertsTitle: '🤖 <b>התראות AI חדשות</b>',
    newAiAlertScoreLine: 'ציון: {{score}}/100',
    onezeroOtpNoProfiles: '❌ לא נמצאו פרופילי <b>One Zero</b>. הוסיפו פרופיל בממשק האינטרנט.',
    onezeroOtpSelectTitle: '🏦 <b>One Zero — OTP ב-SMS</b>\n\nבחרו פרופיל (חובה מספר טלפון בינלאומי עם +):',
    onezeroOtpBadPhone:
      '❌ לפרופיל אין מספר טלפון בינלאומי תקין בשמירה.\n\nפתחו את הפרופיל באתר והגדירו <b>מספר טלפון</b> (למשל +972…).',
    onezeroOtpSmsSent: '📲 נשלח SMS. שלחו את <b>קוד האימות</b> כספרות בלבד.\n\n/cancel לביטול.',
    onezeroOtpPendingWeb:
      '⏳ כבר יש סשן OTP פעיל לפרופיל הזה (אולי ביקשתם SMS מהאתר).\n\nשלחו את <b>קוד האימות</b> מה-SMS.\n\n/cancel לביטול.',
    onezeroOtpSendCode: 'שלחו את קוד ה-SMS כספרות בלבד, או /cancel.',
    onezeroOtpSuccess: '✅ האימות הצליח. האסימון לטווח ארוך נשמר בשרת לפרופיל (לא מוצג כאן).',
    onezeroOtpCancelled: 'תהליך OTP של One Zero בוטל.',
  },
};

const MAX_CHAT_HISTORY_TURNS = 10;

export interface TelegramChatState {
  chatId: string;
  userId: string;
  isNotificationEnabled: boolean;
  isAdmin: boolean;
  conversationContext?: string;
  pendingScrapeStartDate?: string;
  /** Bounded conversation history for AI chat to reduce repetition (last N turns) */
  chatHistory?: ConversationTurn[];
  /** After `/memo <id>` with no text, user sends memo body in the next message */
  pendingMemoTxnId?: string;
  /** One Zero OTP: profile id whose SMS step was started or is pending (e.g. web trigger) */
  pendingOneZeroProfileId?: string;
}

export class TelegramBotService {
  private bot: Telegraf | null = null;
  private config: TelegramConfig;
  private chatStates: Map<string, TelegramChatState>;
  private aiService: AiService | null = null;
  private scraperService: ScraperService | null = null;
  private isRunning: boolean = false;
  private lastStartError: string | null = null;

  /** Maps `${chatId}_${messageId}` → memo reply prompt for "reply with memo" notifications */
  private memoReplyMap: Map<string, { txnId: string; at: number }> = new Map();
  private memoReplyMapLoaded = false;

  private dashboardConfigService: ConfigService | null = null;

  private getDashboardConfigService(): ConfigService {
    if (!this.dashboardConfigService) this.dashboardConfigService = new ConfigService();
    return this.dashboardConfigService;
  }

  /** Translate a key using the configured bot language */
  private t(key: string): string {
    const lang = this.config?.language || 'en';
    return BOT_STRINGS[lang]?.[key] ?? BOT_STRINGS['en']?.[key] ?? key;
  }

  constructor() {
    this.config = this.loadConfig();
    this.chatStates = new Map();
    // Lazy-load services on demand
    // If a token is configured on disk, attempt to auto-start the bot in background
    if (this.config.botToken && this.config.botToken.trim() !== '') {
      setImmediate(() => {
        serverLogger.info('TelegramBotService: token found in config, attempting auto-start');
        this.start().then(() => {
          serverLogger.info('Telegram bot auto-started from service constructor');
        }).catch((err) => {
          serverLogger.warn('TelegramBotService auto-start failed', { error: err });
        });
      });
    }
  }

  /**
   * Get AI service instance (lazy-loaded)
   */
  private getAiService(): AiService {
    if (!this.aiService) {
      this.aiService = new AiService();
    }
    return this.aiService;
  }

  /**
   * Get scraper service instance (lazy-loaded)
   */
  private getScraperService(): ScraperService {
    if (!this.scraperService) {
      this.scraperService = new ScraperService();
    }
    return this.scraperService;
  }

  /**
   * Get profile service instance (lazy-loaded)
   */
  private getProfileService(): ProfileService {
    return profileService;
  }

  private getStorageService(): StorageService {
    // lazy-load storage service to avoid startup heavy IO
    // @ts-ignore
    if (!(this as any).storageService) {
      // @ts-ignore
      (this as any).storageService = new StorageService();
    }
    // @ts-ignore
    return (this as any).storageService as StorageService;
  }

  /**
   * Unified DB (same as web /results/all + /ai/chat/unified scope=all). Falls back to largest scrape JSON only if DB is empty.
   */
  private async loadUnifiedTransactionsForAiChat(): Promise<any[]> {
    let transactions: any[] = [];
    try {
      const storage = this.getStorageService();
      transactions = await storage.getAllTransactions(true);

      if (transactions.length > 0) {
        serverLogger.info('Telegram AI chat: context from unified DB', {
          rowCount: transactions.length,
          includeIgnored: true,
        });
      } else {
        const files = await storage.listScrapeResults();
        if (files && files.length > 0) {
          files.sort((a: any, b: any) => (b.transactionCount || 0) - (a.transactionCount || 0));
          const filename = files[0].filename;
          const result = await storage.getScrapeResult(filename);
          const n = result?.transactions?.length ?? 0;
          if (result && Array.isArray(result.transactions) && n > 0) {
            transactions = result.transactions;
            serverLogger.info('Telegram AI chat: unified DB empty — using largest scrape JSON as fallback', {
              filename,
              rowCount: n,
              filesConsidered: files.length,
            });
          } else {
            serverLogger.info('Telegram AI chat: unified DB empty and no usable scrape file', {
              filesConsidered: files.length,
            });
          }
        } else {
          serverLogger.info('Telegram AI chat: unified DB empty, no scrape JSON files');
        }
      }
    } catch (e) {
      serverLogger.warn('Failed to load transactions for AI chat, continuing without context', { error: e });
    }
    return transactions;
  }

  /**
   * Check if a user is authorized to use the bot
   */
  private isUserAuthorized(userId: string): boolean {
    // If allowedUsers is empty, do NOT allow any users
    if (!this.config.allowedUsers || this.config.allowedUsers.length === 0) {
      return false;
    }
    // Otherwise, check if user is in the allowed list
    return this.config.allowedUsers.includes(userId);
  }

  private isAppLocked(): boolean {
    return appLockService.isLockConfigured() && !appLockService.isUnlocked();
  }

  /** Plain message / command: reply with unlock instructions if app lock is active. */
  private async replyIfAppLocked(ctx: Context): Promise<boolean> {
    if (!this.isAppLocked()) return false;
    await ctx.reply(this.t('appLockedHint'), { parse_mode: 'HTML' });
    return true;
  }

  /** Inline button callback: answer query and reply with unlock instructions. */
  private async replyIfAppLockedCallback(ctx: Context): Promise<boolean> {
    if (!this.isAppLocked()) return false;
    try {
      await ctx.answerCbQuery();
    } catch (e) {
      serverLogger.debug('answerCbQuery when app locked', { error: e });
    }
    await ctx.reply(this.t('appLockedHint'), { parse_mode: 'HTML' });
    return true;
  }

  /** Reply keyboard with common commands (bot language is independent of this). */
  private buildCommandKeyboard(oneTime: boolean) {
    const kb = Markup.keyboard([
      ['/chat', '/scrape', '/memo'],
      ['/export', '/review', '/status'],
      ['/subscribe', '/settings', '/unlock'],
      ['/unsubscribe', '/help'],
    ]).resize();
    return oneTime ? kb.oneTime() : kb;
  }

  /**
   * Check if allowed users list is configured
   */
  isAllowedUsersConfigured(): boolean {
    return !!(this.config.allowedUsers && this.config.allowedUsers.length > 0);
  }

  /**
   * Log unauthorized request attempt
   */
  private logUnauthorizedAttempt(ctx: Context, command: string): void {
    const userId = ctx.from?.id.toString() || 'unknown';
    const username = ctx.from?.username || 'no-username';
    const chatId = ctx.chat?.id.toString() || 'unknown';
    const chatType = ctx.chat?.type || 'unknown';

    serverLogger.warn('UNAUTHORIZED_TELEGRAM_REQUEST', {
      userId,
      username,
      chatId,
      chatType,
      command,
      timestamp: new Date().toISOString(),
      allowedUsersCount: this.config.allowedUsers?.length || 0,
    });
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): TelegramConfig {
    const defaults: TelegramConfig = {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      enabled: false,
      adminChatIds: [],
      notificationChatIds: [],
      notificationAccountsByChatId: {},
      allowedUsers: [],
      language: 'en',
    };
    try {
      if (fs.existsSync(TEL_CONFIG_PATH)) {
        const file = fs.readJsonSync(TEL_CONFIG_PATH) as Partial<TelegramConfig> & { spendingDigestEnabled?: boolean };
        const { spendingDigestEnabled: _removed, ...rest } = file as Record<string, unknown>;
        serverLogger.info('Loaded Telegram config from file');
        return { ...defaults, ...rest } as TelegramConfig;
      }
    } catch (error) {
      serverLogger.warn('Failed to load Telegram config, using defaults', { error });
    }

    return defaults;
  }

  /**
   * Save configuration to file
   */
  private saveConfig(): void {
    try {
      fs.ensureDirSync(path.dirname(TEL_CONFIG_PATH));
      fs.writeJsonSync(TEL_CONFIG_PATH, this.config, { spaces: 2 });
    } catch (error) {
      serverLogger.error('Failed to save Telegram config', { error });
    }
  }

  /**
   * Initialize and start the bot
   */
  async start(botToken?: string): Promise<void> {
    try {
      const token = botToken || this.config.botToken || process.env.TELEGRAM_BOT_TOKEN;

      if (!token || token.trim() === '') {
        throw new Error('Telegram bot token not provided. Please configure a valid token from @BotFather.');
      }

      // Basic token format validation
      if (!token.includes(':')) {
        throw new Error('Invalid Telegram bot token format. Token should contain a colon (:). Format: <bot_id>:<bot_token>');
      }

      // Log startup attempt (mask token tail for safety)
      const masked = token ? `***${token.slice(-10)}` : 'none';
      serverLogger.info('Attempting to start Telegram bot', { botToken: masked, botTokenFromArg: !!botToken });
      serverLogger.debug('Telegram start - config snapshot', {
        configEnabled: this.config.enabled,
        configHasToken: !!this.config.botToken,
        envTokenPresent: !!process.env.TELEGRAM_BOT_TOKEN,
        allowedUsersCount: this.config.allowedUsers?.length || 0,
      });

      this.config.botToken = token;
      this.lastStartError = null;
      serverLogger.debug('Creating Telegraf instance');
      // Telegraf defaults handlerTimeout to 90s; scrapes often run longer, which caused
      // "Promise timed out after 90000 milliseconds". 30 minutes is enough for long scrapes while still bounding stuck handlers.
      this.bot = new Telegraf(token, { handlerTimeout: 30 * 60 * 1000 });
      serverLogger.debug('Telegraf instance created');

      // Global authorization middleware: logs unauthorized attempts and returns
      // a standardized error message for any incoming update from unauthorized users.
      this.bot.use(async (ctx, next) => {
        try {
          const userId = ctx.from?.id?.toString();
          if (!userId) return next();

          // Derive a friendly command string for logging: prefer message text or callback data
          let commandText = 'unknown';
          // Text message
          // @ts-ignore - telegraf types
          if (ctx.message && (ctx.message as any).text) {
            // Truncate long messages for logs
            const txt = (ctx.message as any).text || '';
            commandText = txt.length > 200 ? `${txt.substring(0, 200)}...` : txt;
          } else if ((ctx as any).callbackQuery && (ctx as any).callbackQuery.data) {
            commandText = (ctx as any).callbackQuery.data;
          } else if (ctx.updateType) {
            commandText = ctx.updateType;
          }

          // If allowedUsers is not configured or user not in list, block
          if (!this.isUserAuthorized(userId)) {
            this.logUnauthorizedAttempt(ctx, commandText);
            const unauthorizedMessage = `${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`;
            try { await ctx.reply(unauthorizedMessage, { parse_mode: 'HTML' }); } catch (e) { }
            return;
          }

          return next();
        } catch (err) {
          // If middleware itself fails, allow processing to continue
          serverLogger.error('Error in auth middleware', { error: (err as any) && (err as any).stack ? (err as any).stack : err });
          return next();
        }
      });

      serverLogger.debug('Auth middleware attached');

      // Setup command handlers
      this.setupCommands();

      // Setup message handlers
      this.setupMessageHandlers();

      // Launch bot
      serverLogger.info('Launching Telegram bot (calling bot.launch)');
      await this.bot.launch();

      // Attempt to get bot info for diagnostics
      try {
        const tMe = Date.now();
        const me = await this.bot.telegram.getMe();
        logExternal({
          service: 'telegram',
          operation: 'get_me',
          host: TELEGRAM_API_HOST,
          method: 'POST',
          path: '/bot<token>/getMe',
          outcome: 'ok',
          durationMs: Date.now() - tMe,
          extra: { botId: me.id },
        });
        serverLogger.info('Telegram bot launched and reachable', { bot_username: me.username, bot_id: me.id });
      } catch (meErr: any) {
        logExternal({
          service: 'telegram',
          operation: 'get_me',
          host: TELEGRAM_API_HOST,
          method: 'POST',
          path: '/bot<token>/getMe',
          outcome: 'error',
          errorMessage: meErr?.response?.description || meErr?.message || String(meErr),
          extra: { telegramErrorCode: meErr?.response?.error_code },
        });
        serverLogger.warn('Bot launched but getMe() failed', { error: (meErr as any) && (meErr as any).stack ? (meErr as any).stack : meErr });
      }

      this.isRunning = true;
      this.config.enabled = true;
      this.lastStartError = null;
      this.saveConfig();

      serverLogger.info('Telegram bot started successfully');
    } catch (error: any) {
      this.isRunning = false;
      this.config.enabled = false;

      // If error indicates another getUpdates requester is running (409), treat as running
      const msg = String(error && (error.message || error.response || ''));
      if (msg.includes('409') || msg.includes('Conflict') || msg.includes('terminated by other getUpdates')) {
        this.isRunning = true;
        this.config.enabled = true;
        try { this.saveConfig(); } catch (e) { }
        serverLogger.info('Telegram bot appears to be already running (409 Conflict). Marking as enabled.');
        return;
      }

      // Provide helpful error messages for other common issues
      let errorMessage = error.message || 'Unknown error starting Telegram bot';

      if (error.response?.error_code === 404 || error.message?.includes('Not Found')) {
        errorMessage = 'Bot not found. The bot token is invalid or the bot no longer exists. Please regenerate the token from @BotFather and try again.';
        serverLogger.error('Telegram bot token is invalid - bot not found on Telegram API', { error: error && error.response ? error.response : error, token: this.config.botToken ? `***${this.config.botToken.slice(-10)}` : null });
      } else if (error.response?.error_code === 401 || error.message?.includes('Unauthorized')) {
        errorMessage = 'Authentication failed. The bot token is invalid or expired. Please regenerate it from @BotFather.';
        serverLogger.error('Telegram bot authentication failed', { error: error && error.response ? error.response : error, token: this.config.botToken ? `***${this.config.botToken.slice(-10)}` : null });
      } else if (this.isNetworkError(error)) {
        errorMessage = 'Cannot reach Telegram servers (connection timed out or refused). Check your network and firewall.';
        serverLogger.warn('Telegram bot could not connect to API (network/firewall)', { error: error?.message || error, code: error?.code });
      } else {
        serverLogger.error('Failed to start Telegram bot', { error: error && error.stack ? error.stack : error });
      }

      this.lastStartError = errorMessage;
      throw new Error(errorMessage);
    }
  }

  getLastStartError(): string | null {
    return this.lastStartError;
  }

  /**
   * Resolve bot display info via Telegram Bot API (getMe + profile photo check).
   * Returns null if there is no token or the API call fails.
   */
  async fetchBotIdentity(): Promise<TelegramBotIdentity | null> {
    const token = this.config.botToken?.trim();
    if (!token) return null;
    const t0 = Date.now();
    try {
      const { Telegraf } = await import('telegraf');
      const api = new Telegraf(token).telegram;
      const me = await api.getMe();
      let hasAvatar = false;
      try {
        const photos = await api.getUserProfilePhotos(me.id, 0, 1);
        hasAvatar = (photos.total_count ?? 0) > 0;
      } catch {
        hasAvatar = false;
      }
      const openTelegramUrl = me.username
        ? `https://t.me/${me.username}`
        : `https://t.me/user?id=${me.id}`;
      logExternal({
        service: 'telegram',
        operation: 'bot_identity',
        host: TELEGRAM_API_HOST,
        method: 'POST',
        path: '/bot<token>/getMe+getUserProfilePhotos',
        outcome: 'ok',
        durationMs: Date.now() - t0,
        extra: { hasAvatar, botId: me.id },
      });
      return {
        id: me.id,
        firstName: me.first_name,
        lastName: me.last_name,
        username: me.username,
        openTelegramUrl,
        hasAvatar,
      };
    } catch (e: any) {
      logExternal({
        service: 'telegram',
        operation: 'bot_identity',
        host: TELEGRAM_API_HOST,
        method: 'POST',
        path: '/bot<token>/getMe+getUserProfilePhotos',
        outcome: 'error',
        durationMs: Date.now() - t0,
        errorMessage: e?.response?.description || e?.message || String(e),
        extra: { telegramErrorCode: e?.response?.error_code },
      });
      serverLogger.warn('fetchBotIdentity failed', { error: e?.message || e });
      return null;
    }
  }

  /**
   * Direct download URL for the largest profile photo (server-side only; includes token in path).
   */
  async getBotAvatarDownloadUrl(): Promise<string | null> {
    const token = this.config.botToken?.trim();
    if (!token) return null;
    const t0 = Date.now();
    try {
      const { Telegraf } = await import('telegraf');
      const api = new Telegraf(token).telegram;
      const me = await api.getMe();
      const photos = await api.getUserProfilePhotos(me.id, 0, 1);
      if (!photos.total_count || !photos.photos?.length) {
        logExternal({
          service: 'telegram',
          operation: 'bot_avatar_resolve',
          host: TELEGRAM_API_HOST,
          method: 'POST',
          path: '/bot<token>/getMe+getUserProfilePhotos+getFile',
          outcome: 'ok',
          durationMs: Date.now() - t0,
          extra: { resolved: false, reason: 'no_photos' },
        });
        return null;
      }
      const sizes = photos.photos[0];
      const largest = sizes[sizes.length - 1];
      const file = await api.getFile(largest.file_id);
      if (!file.file_path || !isSafeTelegramRelativeFilePath(file.file_path)) {
        logExternal({
          service: 'telegram',
          operation: 'bot_avatar_resolve',
          host: TELEGRAM_API_HOST,
          method: 'POST',
          path: '/bot<token>/getMe+getUserProfilePhotos+getFile',
          outcome: 'ok',
          durationMs: Date.now() - t0,
          extra: { resolved: false, reason: 'unsafe_or_missing_path' },
        });
        return null;
      }
      logExternal({
        service: 'telegram',
        operation: 'bot_avatar_resolve',
        host: TELEGRAM_API_HOST,
        method: 'POST',
        path: '/bot<token>/getMe+getUserProfilePhotos+getFile',
        outcome: 'ok',
        durationMs: Date.now() - t0,
        extra: { resolved: true },
      });
      return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    } catch (e: any) {
      logExternal({
        service: 'telegram',
        operation: 'bot_avatar_resolve',
        host: TELEGRAM_API_HOST,
        method: 'POST',
        path: '/bot<token>/getMe+getUserProfilePhotos+getFile',
        outcome: 'error',
        durationMs: Date.now() - t0,
        errorMessage: e?.response?.description || e?.message || String(e),
        extra: { telegramErrorCode: e?.response?.error_code },
      });
      serverLogger.warn('getBotAvatarDownloadUrl failed', { error: e?.message || e });
      return null;
    }
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    if (this.bot && this.isRunning) {
      await this.bot.stop();
      this.isRunning = false;
      this.config.enabled = false;
      this.lastStartError = null;
      this.saveConfig();
      serverLogger.info('Telegram bot stopped');
    }
  }

  private isNetworkError(error: any): boolean {
    const code = error?.code || '';
    const msg = String(error?.message || '');
    return (
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      code === 'ENETUNREACH' ||
      code === 'EAI_AGAIN' ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('connect ETIMEDOUT') ||
      msg.includes('reason: connect')
    );
  }

  /**
   * Setup command handlers
   */
  private setupCommands(): void {
    if (!this.bot) return;

    // Start command
    this.bot.start(async (ctx) => {
      await this.handleStart(ctx);
    });

    // Help command
    this.bot.help(async (ctx) => {
      await this.handleHelp(ctx);
    });

    // Scrape command
    this.bot.command('scrape', async (ctx) => {
      await this.handleScrapeCommand(ctx);
    });

    // Chat command
    this.bot.command('chat', async (ctx) => {
      await this.handleChatCommand(ctx);
    });

    // Settings command
    this.bot.command('settings', async (ctx) => {
      await this.handleSettings(ctx);
    });

    // Status command
    this.bot.command('status', async (ctx) => {
      await this.handleStatus(ctx);
    });

    // Subscribe command
    this.bot.command('subscribe', async (ctx) => {
      await this.handleSubscribe(ctx);
    });

    // Unsubscribe command
    this.bot.command('unsubscribe', async (ctx) => {
      await this.handleUnsubscribe(ctx);
    });

    // Done / Cancel command to exit chat mode
    this.bot.command('done', async (ctx) => {
      await this.handleDoneCommand(ctx);
    });

    this.bot.command('cancel', async (ctx) => {
      await this.handleDoneCommand(ctx);
    });

    this.bot.command('unlock', async (ctx) => {
      await this.handleUnlockCommand(ctx);
    });

    this.bot.command('memo', async (ctx) => {
      await this.handleMemoCommand(ctx);
    });

    this.bot.command('export', async (ctx) => {
      await this.handleExportCommand(ctx);
    });

    this.bot.command('card', async (ctx) => {
      await this.handleCardCommand(ctx);
    });

    this.bot.command('review', async (ctx) => {
      await this.handleReviewCommand(ctx);
    });

    this.bot.command('onezero_otp', async (ctx) => {
      await this.handleOneZeroOtpCommand(ctx);
    });
  }

  /**
   * Setup message handlers
   */
  private setupMessageHandlers(): void {
    if (!this.bot) return;

    // Handle callback queries from inline buttons
    this.bot.action(/^scrape_/, async (ctx) => {
      try {
        const callbackData = (ctx.match?.input || '') as string;
        await this.handleScrapeAction(ctx, callbackData);
      } catch (error) {
        serverLogger.error('Error handling scrape callback', { error });
        await ctx.answerCbQuery(this.t('errorExecutingScraper'));
      }
    });

    this.bot.action(/^onezero_otp_pick_(.+)$/, async (ctx) => {
      try {
        const id = ctx.match?.[1] as string;
        await this.handleOneZeroOtpProfilePick(ctx, id);
      } catch (error) {
        serverLogger.error('Error handling One Zero OTP callback', { error });
        await ctx.answerCbQuery(this.t('errorProcessing'));
      }
    });

    this.bot.action('settings_notifications', async (ctx) => {
      try {
        await this.handleSettingsNotifications(ctx);
      } catch (error) {
        serverLogger.error('Error handling settings', { error });
      }
    });

    this.bot.action('settings_profile', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await ctx.reply(this.t('comingSoon'));
      } catch (error) {
        serverLogger.error('Error handling profile settings', { error });
      }
    });

    // Handle text messages for AI chat
    this.bot.on('text', async (ctx) => {
      try {
        const chatId = ctx.chat?.id?.toString();
        if (!chatId) return;
        const state = this.chatStates.get(chatId);
        const rawText = (ctx.message as any).text || '';
        const text = rawText.trim();

        // Reply to a per-transaction "set memo" prompt (from transaction review notification)
        const replyToMsg = ctx.message?.reply_to_message as { message_id?: number } | undefined;
        if (replyToMsg && typeof replyToMsg.message_id === 'number') {
          const txnIdFromPrompt = this.getMemoReplyTarget(chatId, replyToMsg.message_id);
          if (txnIdFromPrompt) {
            const userId = ctx.from?.id.toString() || '';
            if (!this.isUserAuthorized(userId)) {
              this.logUnauthorizedAttempt(ctx, 'memo_reply_to_prompt');
              await ctx.reply(`${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>`, { parse_mode: 'HTML' });
              return;
            }
            if (text.startsWith('/')) {
              if (text.startsWith('/cancel') || text.startsWith('/done')) {
                this.removeMemoReplyTarget(chatId, replyToMsg.message_id);
                await ctx.reply(this.t('memoReplyCancelled'));
                return;
              }
              await ctx.reply(this.t('memoReplySendPlainText'), { parse_mode: 'HTML' });
              return;
            }
            await this.applyMemoFromTelegram(ctx, txnIdFromPrompt, text, {
              replyPromptMessageId: replyToMsg.message_id,
            });
            return;
          }
        }

        // App lock: waiting for password after /unlock
        if (state?.conversationContext === 'pending_unlock') {
          const userId = ctx.from?.id.toString() || '';
          if (!this.isUserAuthorized(userId)) {
            this.logUnauthorizedAttempt(ctx, 'pending_unlock');
            await ctx.reply(`${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>`, { parse_mode: 'HTML' });
            return;
          }
          if (text.startsWith('/')) {
            if (text.startsWith('/cancel') || text.startsWith('/done')) {
              await this.handleDoneCommand(ctx);
              return;
            }
            await ctx.reply(this.t('unlockSendPasswordPlain'), { parse_mode: 'HTML' });
            return;
          }
          await this.tryUnlockFromTelegram(ctx, text);
          return;
        }

        if (state?.conversationContext === 'pending_memo' && state.pendingMemoTxnId) {
          const userId = ctx.from?.id.toString() || '';
          if (!this.isUserAuthorized(userId)) {
            this.logUnauthorizedAttempt(ctx, 'pending_memo');
            await ctx.reply(`${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>`, { parse_mode: 'HTML' });
            return;
          }
          if (text.startsWith('/')) {
            if (text.startsWith('/cancel') || text.startsWith('/done')) {
              await this.handleDoneCommand(ctx);
              return;
            }
            await ctx.reply(this.t('memoSendNext'), { parse_mode: 'HTML' });
            return;
          }
          await this.applyMemoFromTelegram(ctx, state.pendingMemoTxnId, text);
          return;
        }

        if (state?.conversationContext === 'pending_onezero_otp' && state.pendingOneZeroProfileId) {
          const userId = ctx.from?.id.toString() || '';
          if (!this.isUserAuthorized(userId)) {
            this.logUnauthorizedAttempt(ctx, 'pending_onezero_otp');
            await ctx.reply(`${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>`, { parse_mode: 'HTML' });
            return;
          }
          if (text.startsWith('/')) {
            if (text.startsWith('/cancel') || text.startsWith('/done')) {
              await this.handleDoneCommand(ctx);
              return;
            }
            await ctx.reply(this.t('onezeroOtpSendCode'), { parse_mode: 'HTML' });
            return;
          }
          await this.handleOneZeroOtpCodeReply(ctx, text);
          return;
        }

        // If in chat mode, handle as AI query
        if (state?.conversationContext === 'chat') {
          await this.handleAIChat(ctx, ctx.message.text);
          return;
        }

        // If awaiting custom scrape start date input
        if (state?.conversationContext === 'scrape_start_date') {
          await this.handleCustomScrapeStartDateInput(ctx, ctx.message.text);
          return;
        }

        // If message looks like an unknown command, show command buttons
        if (rawText.startsWith('/')) {
          const known = [
            '/scrape',
            '/chat',
            '/memo',
            '/review',
            '/export',
            '/settings',
            '/status',
            '/subscribe',
            '/unsubscribe',
            '/help',
            '/start',
            '/done',
            '/cancel',
            '/unlock',
            '/onezero_otp',
          ];
          const cmd = rawText.split(/\s/)[0].split('@')[0];
          if (!known.includes(cmd)) {
            await ctx.reply(this.t('unknownCommand'), this.buildCommandKeyboard(true));
            return;
          }
        }
      } catch (error) {
        serverLogger.error('Error handling text message', { error });
      await ctx.reply(this.t('errorProcessing'));
      }
    });
  }

  /**
   * Handle /start command
   */
  private async handleStart(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id.toString() || '';

    if (!chatId || !userId) return;

    // Check authorization
    if (!this.isUserAuthorized(userId)) {
      this.logUnauthorizedAttempt(ctx, '/start');
      const unauthorizedMessage = `${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`;
      await ctx.reply(unauthorizedMessage, { parse_mode: 'HTML' });
      return;
    }

    // Initialize chat state
    this.chatStates.set(chatId, {
      chatId,
      userId,
      isNotificationEnabled: false,
      isAdmin: this.config.adminChatIds.includes(chatId),
    });

    await ctx.reply(this.t('welcome'), this.buildCommandKeyboard(false));
  }

  /**
   * Handle /help command
   */
  private async handleHelp(ctx: Context): Promise<void> {
    await ctx.reply(this.t('helpText'), { parse_mode: 'HTML' });
  }

  /**
   * Handle /scrape command
   */
  private async handleScrapeCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';

      // Check authorization
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, '/scrape');
        const unauthorizedMessage = `${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`;
        await ctx.reply(unauthorizedMessage, { parse_mode: 'HTML' });
        return;
      }

      if (await this.replyIfAppLocked(ctx)) return;

      const profiles = await this.getProfileService().getProfiles();

      if (profiles.length === 0) {
        await ctx.reply(this.t('noProfiles'));
        return;
      }

      const profileButtons = profiles.map((profile: Profile) =>
        Markup.button.callback(profile.name || profile.id, `scrape_default_${profile.id}`)
      );

      await ctx.reply(
        this.t('selectProfile'),
        Markup.inlineKeyboard([
          profileButtons,
          [Markup.button.callback(this.t('scrapeAllLabel'), 'scrape_all_default')],
          [Markup.button.callback('Custom Start Date', 'scrape_custom_start')],
        ])
      );
    } catch (error) {
      serverLogger.error('Error in scrape command', { error });
      await ctx.reply(this.t('errorRetrievingProfiles'));
    }
  }

  /**
   * Route scrape callback actions
   */
  private async handleScrapeAction(ctx: Context, callbackData: string): Promise<void> {
    if (!callbackData) return;

    if (await this.replyIfAppLockedCallback(ctx)) return;

    if (callbackData === 'scrape_custom_start') {
      await this.handleCustomScrapeStartDatePrompt(ctx);
      return;
    }

    if (callbackData === 'scrape_all_default') {
      await this.handleScrapeAllExecution(ctx);
      return;
    }

    if (callbackData.startsWith('scrape_default_')) {
      const profileId = callbackData.replace('scrape_default_', '');
      await this.handleScraperExecution(ctx, profileId);
      return;
    }

    if (callbackData.startsWith('scrape_date_')) {
      const payload = callbackData.replace('scrape_date_', '');
      const datePart = payload.substring(0, 10);
      const targetPart = payload.substring(11);

      if (!this.isValidIsoDate(datePart)) {
      await ctx.answerCbQuery(this.t('invalidStartDate'));
        return;
      }

      if (targetPart === 'all') {
        await this.handleScrapeAllExecution(ctx, datePart);
        return;
      }

      await this.handleScraperExecution(ctx, targetPart, datePart);
      return;
    }

    // Backward compatibility with old callback format.
    if (callbackData.startsWith('scrape_')) {
      const profileId = callbackData.replace('scrape_', '');
      await this.handleScraperExecution(ctx, profileId);
    }
  }

  /**
   * Prompt user for custom scrape start date.
   */
  private async handleCustomScrapeStartDatePrompt(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) return;

    const state = this.chatStates.get(chatId) || {
      chatId,
      userId: ctx.from?.id?.toString() || '',
      isNotificationEnabled: false,
      isAdmin: false,
    };
    state.conversationContext = 'scrape_start_date';
    state.pendingScrapeStartDate = undefined;
    this.chatStates.set(chatId, state);

      await ctx.reply(this.t('startDatePrompt'));
  }

  /**
   * Handle custom start date text input from chat.
   */
  private async handleCustomScrapeStartDateInput(ctx: Context, text: string): Promise<void> {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) return;
    const state = this.chatStates.get(chatId);
    if (!state) return;

    if (await this.replyIfAppLocked(ctx)) return;

    const date = (text || '').trim();
    if (!this.isValidIsoDate(date)) {
      await ctx.reply(this.t('invalidDateFormat'));
      return;
    }

    state.conversationContext = undefined;
    state.pendingScrapeStartDate = date;
    this.chatStates.set(chatId, state);

    const profiles = await this.getProfileService().getProfiles();
    if (profiles.length === 0) {
      await ctx.reply(this.t('noProfiles'));
      return;
    }

    const profileButtons = profiles.map((profile: Profile) =>
      Markup.button.callback(profile.name || profile.id, `scrape_date_${date}_${profile.id}`)
    );

    await ctx.reply(
      `${this.t('startDateSetPrefix')} ${date}. ${this.t('chooseWhatToScrape')}`,
      Markup.inlineKeyboard([
        profileButtons,
        [Markup.button.callback(this.t('scrapeAllLabel'), `scrape_date_${date}_all`)],
      ])
    );
  }

  /**
   * Execute scrape for all profiles in sequence, then run post-scrape once with all results.
   */
  private async handleScrapeAllExecution(ctx: Context, startDate?: string): Promise<void> {
    const userId = ctx.from?.id.toString() || '';
    const chatId = ctx.chat?.id?.toString();
    const chatIdNum = ctx.chat?.id;

    if (!this.isUserAuthorized(userId)) {
      this.logUnauthorizedAttempt(ctx, `scrape_all${startDate ? `_from_${startDate}` : ''}`);
      await ctx.answerCbQuery(this.t('unauthorizedNoPermission'), { show_alert: true });
      return;
    }

    if (await this.replyIfAppLockedCallback(ctx)) return;

    await ctx.answerCbQuery(this.t('scraperStarting'));

    const profiles = await this.getProfileService().getProfiles();
    if (profiles.length === 0) {
      await ctx.reply(this.t('noProfiles'));
      return;
    }

    let statusMsg: Message | undefined;
    if (chatIdNum) {
      await ctx.sendChatAction('typing');
      statusMsg = await ctx.reply(this.t('scraperExecuting'));
    }

    const batchRequest: ScrapeRequest = {
      companyId: 'batch',
      credentials: {},
      profileName: 'All profiles',
      options: {
        showBrowser: false,
        deferPostScrape: true,
        aggregateTelegramNotifications: true,
        runSource: 'telegram_bot',
        initiatedBy: `telegram:${userId}`,
        ...(startDate ? { startDate } : {}),
      } as any,
    };
    if (chatId) {
      (batchRequest.options as any).postScrape = { telegramChatId: chatId, initiatedBy: `telegram:${userId}` };
    }

    const results: ScrapeResult[] = [];
    const allNewTransactionIds: string[] = [];
    const batchSavedFilenames: string[] = [];
    const summaryLines: string[] = [];
    for (const profile of profiles) {
      const { result, newTransactionIds, savedFilename } = await this.executeScrapeForProfile(ctx, profile, userId, startDate, true);
      if (result) results.push(result);
      allNewTransactionIds.push(...newTransactionIds);
      if (savedFilename) batchSavedFilenames.push(savedFilename);
      const label = profile.name || profile.id;
      if (result?.success) {
        const n = result.transactions?.length ?? 0;
        summaryLines.push(`✅ ${label}: ${n} ${this.t('transactionsLabel')}`);
      } else {
        summaryLines.push(`❌ ${label}: ${result?.error || this.t('errorScraper')}`);
      }
    }

    if (statusMsg && chatIdNum) {
      const body = summaryLines.length > 0 ? summaryLines.join('\n') : this.t('errorScraper');
      const finalText = `${this.t('scraperSuccess')}\n\n${body}`;
      const summaryChunks = splitTelegramPlainText(finalText, getTelegramMaxMessageChars());
      await this.editTelegramStatusMessage(ctx, chatIdNum, statusMsg.message_id, summaryChunks[0]);
      for (let i = 1; i < summaryChunks.length; i++) {
        await ctx.reply(summaryChunks[i]);
      }
    }

    if (results.length > 0) {
      try {
        const reqAny = batchRequest.options as any;
        reqAny.postScrape = {
          ...(reqAny.postScrape || {}),
          newTransactionIds: allNewTransactionIds,
        };
        reqAny.batchSavedFilenames = batchSavedFilenames;
        await postScrapeService.handleBatchResults(results, batchRequest);
      } catch (err: any) {
        serverLogger.warn('Post-scrape batch failed after scrape all', { error: err?.message });
      }
    }
  }

  /**
   * Validate strict ISO date format YYYY-MM-DD.
   */
  private isValidIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.toISOString().startsWith(value);
  }

  /**
   * Handle /chat command
   */
  private async handleChatCommand(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id.toString() || '';

    if (!chatId) return;

    // Check authorization
    if (!this.isUserAuthorized(userId)) {
      this.logUnauthorizedAttempt(ctx, '/chat');
      const unauthorizedMessage = `${this.t('accessDenied')}\n\n${this.t('unauthorizedChat')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`;
      await ctx.reply(unauthorizedMessage, { parse_mode: 'HTML' });
      return;
    }

    const state = this.chatStates.get(chatId) || {
      chatId,
      userId,
      isNotificationEnabled: false,
      isAdmin: false,
    };

    state.conversationContext = 'chat';
    state.chatHistory = []; // New chat session: no prior turns
    this.chatStates.set(chatId, state);

    await ctx.reply(this.t('chatModeActive'));
  }

  /**
   * Handle /settings command
   */
  private async handleSettings(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id.toString() || '';

    if (!chatId) return;

    // Check authorization
    if (!this.isUserAuthorized(userId)) {
      this.logUnauthorizedAttempt(ctx, '/settings');
      const unauthorizedMessage = `${this.t('accessDenied')}\n\n${this.t('unauthorizedSettings')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`;
      await ctx.reply(unauthorizedMessage, { parse_mode: 'HTML' });
      return;
    }

    const state = this.chatStates.get(chatId);

    const buttons = [
      Markup.button.callback(this.t('settingsBtnNotif'), 'settings_notifications'),
      Markup.button.callback(this.t('settingsBtnProfile'), 'settings_profile'),
    ];

    await ctx.reply(
      this.t('settingsMenu'),
      Markup.inlineKeyboard([buttons])
    );
  }

  /**
   * Handle /status command
   */
  private async handleStatus(ctx: Context): Promise<void> {
    const statusStr = this.isRunning ? this.t('botOnline') : this.t('botOffline');
    const message = `${this.t('botStatus')} ${statusStr}\n\n${this.t('configuredFeatures')}\n• ${this.t('notifChats')}: ${this.config.notificationChatIds.length}\n• ${this.t('adminChats')}: ${this.config.adminChatIds.length}\n• ${this.t('token')}: ${this.config.botToken ? '✅' : '❌'}`;
    await ctx.reply(message);
  }

  /**
   * Handle /subscribe command
   */
  private async handleSubscribe(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id.toString() || '';

    if (!chatId) return;

    // Check authorization
    if (!this.isUserAuthorized(userId)) {
      this.logUnauthorizedAttempt(ctx, '/subscribe');
      const unauthorizedMessage = `${this.t('accessDenied')}\n\n${this.t('unauthorizedSubscribe')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`;
      await ctx.reply(unauthorizedMessage, { parse_mode: 'HTML' });
      return;
    }

    if (!this.config.notificationChatIds.includes(chatId)) {
      this.config.notificationChatIds.push(chatId);
      this.saveConfig();
    }

    const state = this.chatStates.get(chatId);
    if (state) {
      state.isNotificationEnabled = true;
      this.chatStates.set(chatId, state);
    }

    await ctx.reply(this.t('subscribed'));
  }

  /**
   * Handle /unsubscribe command
   */
  private async handleUnsubscribe(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id.toString() || '';

    if (!chatId) return;

    // Check authorization
    if (!this.isUserAuthorized(userId)) {
      this.logUnauthorizedAttempt(ctx, '/unsubscribe');
      const unauthorizedMessage = `${this.t('accessDenied')}\n\n${this.t('unauthorizedUnsubscribe')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`;
      await ctx.reply(unauthorizedMessage, { parse_mode: 'HTML' });
      return;
    }

    this.config.notificationChatIds = this.config.notificationChatIds.filter(id => id !== chatId);
    this.saveConfig();

    const state = this.chatStates.get(chatId);
    if (state) {
      state.isNotificationEnabled = false;
      this.chatStates.set(chatId, state);
    }

    await ctx.reply(this.t('unsubscribed'));
  }

  /**
   * Handle AI chat messages
   */
  private async handleAIChat(ctx: Context, message: string): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';

      // Check authorization
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, 'message_in_chat_mode');
        const unauthorizedMessage = `${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`;
        await ctx.reply(unauthorizedMessage, { parse_mode: 'HTML' });
        return;
      }

      await ctx.sendChatAction('typing');

      const chatIdNum = ctx.chat?.id;
      if (!chatIdNum) return;

      // Send quick 'thinking' message and later edit it with the final AI response
      const thinkingMsg = await ctx.reply(this.t('thinkingMsg'));

      const transactions = await this.loadUnifiedTransactionsForAiChat();

      const aiSettings = await this.getAiService().getSettings();
      const personaForPrompt =
          aiSettings.personaInjectionEnabled !== false &&
          aiSettings.userContext &&
          !isUserPersonaEmpty(aiSettings.userContext)
              ? aiSettings.userContext
              : undefined;
      const contextQuery = buildUnifiedChatQueryWithMemory(undefined, message, personaForPrompt);

      const state = this.chatStates.get(chatIdNum.toString());
      const chatHistory = state?.chatHistory ?? [];

      const aiService = this.getAiService();
      let response = '';
      try {
        const structured = await aiService.analyzeDataStructured(contextQuery, transactions, {
          conversationHistory: chatHistory,
        });
        const { newAlerts } = mergeAndPersistAiMemory(structured);
        void this.notifyNewAiMemoryAlerts(newAlerts, { includeChatId: chatIdNum.toString() });
        response = structured.response;
      } catch (err) {
        serverLogger.error('AI analyzeData failed for Telegram chat', { error: err });
        response = this.formatAiChatFailureMessage(err);
      }

      // Edit the thinking message with the AI response (split if too long)
      if (!response) response = this.t('noAiResponse');

      // Append this turn to history and trim to max turns
      const updatedState = this.chatStates.get(chatIdNum.toString());
      if (updatedState) {
        const newTurns: ConversationTurn[] = [...(updatedState.chatHistory ?? []), { role: 'user', text: message }, { role: 'model', text: response }];
        updatedState.chatHistory = newTurns.slice(-MAX_CHAT_HISTORY_TURNS * 2); // keep last N full turns
        this.chatStates.set(chatIdNum.toString(), updatedState);
      }

      // If response already contains HTML tags, use as-is; otherwise convert Markdown to HTML per chunk
      const looksLikeHtml = /<\/?\w+[^>]*>/.test(response);
      const htmlChunks: string[] = looksLikeHtml
        ? splitTelegramHtmlChunks(response, 4080)
        : splitTelegramPlainText(response, 3400).flatMap((ch) => {
            const h = this.convertMarkdownToHtml(ch);
            return h.length > 4080 ? splitTelegramHtmlChunks(h, 4080) : [h];
          });

      const chunks = htmlChunks.length > 0 ? htmlChunks : [this.convertMarkdownToHtml(response || this.t('noAiResponse'))];
      const firstChunk = chunks[0];
      const restChunks = chunks.slice(1);

      try {
        await ctx.telegram.editMessageText(chatIdNum, thinkingMsg.message_id, undefined, firstChunk, { parse_mode: 'HTML' });
      } catch (e) {
        await ctx.reply(String(firstChunk), { parse_mode: 'HTML' });
      }
      for (const part of restChunks) {
        await ctx.reply(String(part), { parse_mode: 'HTML' });
      }
    } catch (error) {
      serverLogger.error('Error in AI chat', { error });
      await ctx.reply(this.formatAiChatFailureMessage(error), { parse_mode: 'HTML' });
    }
  }

  /**
   * Get AI response for chat message
   */
  private async getAIResponse(message: string, _chatId: string): Promise<string> {
    try {
      const aiService = this.getAiService();
      let transactions = await this.loadUnifiedTransactionsForAiChat();
      const aiSettings = await aiService.getSettings();
      const maxRows = aiSettings.analystMaxTransactionRows ?? 0;
      transactions = sliceTransactionsForAnalyst(transactions, maxRows);
      const personaForPrompt =
          aiSettings.personaInjectionEnabled !== false &&
          aiSettings.userContext &&
          !isUserPersonaEmpty(aiSettings.userContext)
              ? aiSettings.userContext
              : undefined;
      const contextQuery = buildUnifiedChatQueryWithMemory(undefined, message, personaForPrompt);

      // Same unified context as /chat mode; on failure return code + details (no financial-tip fallback).
      try {
        const structured = await aiService.analyzeDataStructured(contextQuery, transactions);
        mergeAndPersistAiMemory(structured);
        const aiResponse = structured.response;
        if (aiResponse && aiResponse.trim().length > 0) {
          return aiResponse;
        }
      } catch (aiError) {
        serverLogger.warn('AI analyzeData failed or GEMINI not configured', { error: aiError });
        return this.formatAiChatFailureMessage(aiError);
      }

      // No AI text — surface as failure instead of a generic financial tip
      return this.formatAiChatFailureMessage(new Error(this.t('noAiResponse')));
    } catch (error) {
      serverLogger.error('Error getting AI response', { error });
      return this.formatAiChatFailureMessage(error);
    }
  }

  /**
   * Convert simple Markdown to HTML for Telegram (basic cases)
   */
  private convertMarkdownToHtml(input: string): string {
    if (!input) return '';
    // Escape HTML
    let s = input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Code blocks ``` -> <pre>
    s = s.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre>${code.replace(/</g, '&lt;')}</pre>`);
    // Inline code ` -> <code>
    s = s.replace(/`([^`]+)`/g, (_m, code) => `<code>${code.replace(/</g, '&lt;')}</code>`);
    // Bold **text** or __text__ -> <b>
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/__([^_]+)__/g, '<b>$1</b>');
    // Italic *text* or _text_ -> <i>
    s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    s = s.replace(/_([^_]+)_/g, '<i>$1</i>');
    // Links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => `<a href="${url}">${text}</a>`);

    return s;
  }

  /**
   * Edit a status placeholder message (e.g. "scraping…"); fall back to a new reply if edit fails.
   */
  private async editTelegramStatusMessage(ctx: Context, chatId: number, messageId: number, text: string): Promise<void> {
    try {
      await ctx.telegram.editMessageText(chatId, messageId, undefined, text);
    } catch (e) {
      await ctx.reply(text);
    }
  }

  /**
   * Handle scraper execution from Telegram
   */
  private async handleScraperExecution(ctx: Context, profileId: string, startDate?: string): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';

      // Check authorization
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, `scrape_profile_${profileId}`);
        await ctx.answerCbQuery(this.t('unauthorizedNoPermission'), { show_alert: true });
        return;
      }

      if (await this.replyIfAppLockedCallback(ctx)) return;

      await ctx.answerCbQuery(this.t('scraperStarting'));

      const chatIdNum = ctx.chat?.id;
      if (!chatIdNum) return;

      let statusMsg: Message | undefined;
      try {
        await ctx.sendChatAction('typing');
        statusMsg = await ctx.reply(this.t('scraperExecuting'));

        const profile = await this.getProfileService().getProfile(profileId);
        if (!profile) {
          await this.editTelegramStatusMessage(ctx, chatIdNum, statusMsg.message_id, this.t('profileNotFound'));
          return;
        }
        await this.executeScrapeForProfile(ctx, profile, userId, startDate, false, {
          chatId: chatIdNum,
          messageId: statusMsg.message_id,
        });
      } catch (scraperError: any) {
        serverLogger.error('Scraper execution failed', { scraperError });
        const errText = `${this.t('errorScraper')}: ${scraperError.message}`;
        if (statusMsg) {
          await this.editTelegramStatusMessage(ctx, chatIdNum, statusMsg.message_id, errText);
        } else {
          await ctx.reply(errText);
        }
      }
    } catch (error) {
      serverLogger.error('Error handling scrape callback', { error });
      await ctx.reply(this.t('errorScraper'));
    }
  }

  /**
   * Execute scrape for a single profile.
   * When isPartOfBatch is true, post-scrape is deferred and the result is returned for batch handling.
   */
  private async executeScrapeForProfile(
    ctx: Context,
    profile: Profile,
    userId: string,
    startDate?: string,
    isPartOfBatch?: boolean,
    statusMessage?: { chatId: number; messageId: number }
  ): Promise<{ result: ScrapeResult | null; newTransactionIds: string[]; savedFilename?: string }> {
    const scraperService = this.getScraperService();
    const scrapeRequest: ScrapeRequest = {
      companyId: profile.companyId,
      credentials: profile.credentials,
      profileId: profile.id,
      profileName: profile.name,
      options: {
        ...profile.options,
        showBrowser: false,
        aggregateTelegramNotifications: !isPartOfBatch,
        deferPostScrape: isPartOfBatch,
        runSource: 'telegram_bot',
        initiatedBy: `telegram:${userId}`,
        ...(startDate ? { startDate } : {}),
      } as any,
    };
    try {
      const chatId = ctx.chat?.id?.toString();
      if (chatId) {
        (scrapeRequest.options as any).postScrape = { telegramChatId: chatId, initiatedBy: `telegram:${userId}` };
      }
    } catch (e) { }

    serverLogger.info(`[Telegram] Starting scraper for profile: ${profile.id}`, {
      startDate: startDate || 'global-default',
      mode: 'telegram',
      isPartOfBatch: !!isPartOfBatch,
    });
    const result = await scraperService.runScrape(scrapeRequest);
    if (!result.success) {
      if (!isPartOfBatch) {
        const failText = `${this.t('scrapeFailedPrefix')} ${result.error || this.t('errorScraper')}`;
        if (statusMessage) {
          await this.editTelegramStatusMessage(ctx, statusMessage.chatId, statusMessage.messageId, failText);
        } else {
          await ctx.reply(failText);
        }
      }
      return { result, newTransactionIds: [] };
    }
    const txnCount = result.transactions?.length || 0;

    let newTransactionIds: string[] = [];
    let savedFilename: string | undefined;
    // Persist the scrape result (so DB has transactions for "current" / "all" scope)
    try {
      const storage = this.getStorageService();
      const saved = await storage.saveScrapeResult(
        result,
        profile.companyId,
        profile.name || profile.id
      );
      newTransactionIds = saved.newTransactionIds;
      savedFilename = saved.filename;
      serverLogger.info('Saved scrape result from Telegram', { filename: saved.filename, profileId: profile.id });
    } catch (saveErr) {
      serverLogger.warn('Failed to save scrape result from Telegram', { error: saveErr });
    }

    if (!isPartOfBatch) {
      serverLogger.info('Telegram scrape completed; aggregated Telegram notification is sent by post-scrape flow', {
        profileId: profile.id,
        transactionCount: txnCount,
        startDate: startDate || 'global-default',
      });
      if (statusMessage) {
        const name = profile.name || profile.id;
        const successText = `${this.t('scraperSuccess')}\n\n${this.t('profileLabel')}: ${name}\n${this.t('transactionsLabel')}: ${txnCount}`;
        await this.editTelegramStatusMessage(ctx, statusMessage.chatId, statusMessage.messageId, successText);
      }
    }
    return { result, newTransactionIds, savedFilename };
  }

  /**
   * Handle settings notifications callback
   */
  private async handleSettingsNotifications(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';

      // Check authorization
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, 'settings_notifications_callback');
        await ctx.answerCbQuery(this.t('unauthorizedNoPermission'), { show_alert: true });
        return;
      }


      const chatId = ctx.chat?.id?.toString();
      if (!chatId) return;
      const state = this.chatStates.get(chatId);

      if (!state) {
        await ctx.answerCbQuery();
        await ctx.reply(this.t('errorProcessing'));
        return;
      }

      const currentState = !state.isNotificationEnabled;
      state.isNotificationEnabled = currentState;
      this.chatStates.set(chatId, state);

      // Update config
      if (currentState && !this.config.notificationChatIds.includes(chatId)) {
        this.config.notificationChatIds.push(chatId);
      } else if (!currentState) {
        this.config.notificationChatIds = this.config.notificationChatIds.filter(id => id !== chatId);
      }
      this.saveConfig();

      const status = currentState ? this.t('notifEnabled') : this.t('notifDisabled');
      await ctx.answerCbQuery(status);
      await ctx.editMessageText(`📬 ${this.t('settingsBtnNotif')} ${status}`);
    } catch (error) {
      serverLogger.error('Error handling notification settings', { error });
      await ctx.answerCbQuery(this.t('errorUpdatingSettings'));
    }
  }

  /**
   * /unlock — enter app password (same as web UI) when app lock is active.
   */
  private async handleUnlockCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, '/unlock');
        const unauthorizedMessage = `${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`;
        await ctx.reply(unauthorizedMessage, { parse_mode: 'HTML' });
        return;
      }

      const chatId = ctx.chat?.id?.toString();
      if (!chatId) return;

      const text = (ctx.message as any)?.text || '';
      const rest = text.replace(/^\/unlock(@\S+)?\s*/i, '').trim();

      if (!appLockService.isLockConfigured()) {
        await ctx.reply(this.t('unlockNotConfigured'));
        return;
      }
      if (appLockService.isUnlocked()) {
        await ctx.reply(this.t('unlockAlready'));
        return;
      }

      if (!rest) {
        const prev = this.chatStates.get(chatId);
        this.chatStates.set(chatId, {
          chatId,
          userId,
          isNotificationEnabled: prev?.isNotificationEnabled ?? false,
          isAdmin: this.config.adminChatIds.includes(chatId),
          conversationContext: 'pending_unlock',
          chatHistory: prev?.chatHistory
        });
        await ctx.reply(this.t('unlockSendPassword'), { parse_mode: 'HTML' });
        return;
      }

      await this.tryUnlockFromTelegram(ctx, rest);
    } catch (error) {
      serverLogger.error('Error handling /unlock', { error });
      await ctx.reply(this.t('unlockError'));
    }
  }

  private async tryUnlockFromTelegram(ctx: Context, password: string): Promise<void> {
    const chatId = ctx.chat?.id?.toString();
    if (!password) {
      await ctx.reply(this.t('unlockSendPassword'), { parse_mode: 'HTML' });
      return;
    }

    try {
      const ok = appLockService.tryUnlock(password);
      if (ok) {
        await profileService.migrateFromEnvIfNeeded();
      }

      if (chatId) {
        const st = this.chatStates.get(chatId);
        if (st?.conversationContext === 'pending_unlock') {
          delete st.conversationContext;
          this.chatStates.set(chatId, st);
        }
      }

      await ctx.reply(ok ? this.t('unlockSuccess') : this.t('unlockWrong'));

      try {
        await ctx.deleteMessage();
      } catch (e) {
        serverLogger.debug('Telegram deleteMessage after unlock attempt', { error: e });
      }
    } catch (e: any) {
      serverLogger.error('Telegram tryUnlockFromTelegram failed', { error: e });
      await ctx.reply(this.t('unlockError'));
    }
  }

  /**
   * Exit chat mode (/done or /cancel)
   */
  private async handleDoneCommand(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id?.toString();
      const userId = ctx.from?.id.toString() || '';
      if (!chatId) return;

      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, '/done');
        await ctx.reply(this.t('notAuthorized'));
        return;
      }

      const state = this.chatStates.get(chatId);
      const wasPendingUnlock = state?.conversationContext === 'pending_unlock';
      const wasPendingMemo = state?.conversationContext === 'pending_memo';
      const wasPendingOneZero = state?.conversationContext === 'pending_onezero_otp';
      if (state) {
        state.conversationContext = undefined;
        state.pendingMemoTxnId = undefined;
        state.pendingOneZeroProfileId = undefined;
        state.chatHistory = undefined; // Clear so next /chat starts fresh
        this.chatStates.set(chatId, state);
      }

      const msg = wasPendingUnlock
        ? this.t('unlockCancelled')
        : wasPendingMemo
          ? this.t('memoCancelled')
          : wasPendingOneZero
            ? this.t('onezeroOtpCancelled')
            : this.t('exitedChatMode');
      await ctx.reply(msg);
    } catch (error) {
      serverLogger.error('Error handling done command', { error });
      await ctx.reply(this.t('errorExitingChatMode'));
    }
  }

  private escapeTgHtml(text: string): string {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Telegram HTML message when AI chat fails — shows code + details, not the financial-tip fallback. */
  private formatAiChatFailureMessage(err: unknown): string {
    const e = err as Record<string, unknown> | null;
    const nested =
      e && typeof e === 'object' && e.error && typeof e.error === 'object'
        ? (e.error as Record<string, unknown>)
        : null;

    const code =
      (nested?.code != null && String(nested.code)) ||
      (e && e.code != null && String(e.code)) ||
      (nested?.status != null && String(nested.status)) ||
      (e && e.status != null && String(e.status)) ||
      (e && e.statusCode != null && String(e.statusCode)) ||
      'UNKNOWN_ERROR';

    let explanation = '';
    if (nested && typeof nested.message === 'string' && nested.message.trim()) {
      explanation = nested.message.trim();
    } else if (err instanceof Error && err.message) {
      explanation = err.message.trim();
    } else if (typeof err === 'string') {
      explanation = err;
    } else {
      explanation = String(e ?? 'unknown');
    }
    if (explanation.length > 2000) explanation = `${explanation.slice(0, 2000)}…`;

    const codeEsc = this.escapeTgHtml(code);
    const expEsc = this.escapeTgHtml(explanation);

    const rl = (e as { geminiRateLimit?: { limitRequests?: string | null; remainingRequests?: string | null; remainingTokens?: string | null } })
        .geminiRateLimit;
    let extra = '';
    if (rl && (rl.limitRequests != null || rl.remainingRequests != null || rl.remainingTokens != null)) {
      const lines = [
        rl.limitRequests != null && rl.limitRequests !== '' ? `Total requests allowed: ${rl.limitRequests}` : '',
        rl.remainingRequests != null && rl.remainingRequests !== '' ? `Requests remaining: ${rl.remainingRequests}` : '',
        rl.remainingTokens != null && rl.remainingTokens !== '' ? `Tokens remaining: ${rl.remainingTokens}` : ''
      ].filter(Boolean);
      if (lines.length) extra = `\n\n${lines.map((l) => this.escapeTgHtml(l)).join('\n')}`;
    }

    return `${this.t('aiChatErrorTitle')}\n\n${this.t('aiChatErrorCodeLabel')} <code>${codeEsc}</code>\n\n${this.t('aiChatErrorExplanationLabel')}\n${expEsc}${extra}`;
  }

  private clearPendingMemoState(chatId: string | undefined): void {
    if (!chatId) return;
    const state = this.chatStates.get(chatId);
    if (!state) return;
    state.pendingMemoTxnId = undefined;
    if (state.conversationContext === 'pending_memo') state.conversationContext = undefined;
    this.chatStates.set(chatId, state);
  }

  private async applyMemoFromTelegram(
    ctx: Context,
    txnId: string,
    memo: string,
    opts?: { replyPromptMessageId?: number }
  ): Promise<void> {
    const trimmed = (memo || '').trim();
    if (!trimmed) {
      await ctx.reply(this.t('memoSendNext'), { parse_mode: 'HTML' });
      return;
    }
    const ai = this.getAiService();
    const settings = await ai.getSettings();
    const matchedCategory = settings.categories.find((c) => c === trimmed);
    if (matchedCategory) {
      const storage = this.getStorageService();
      const ok = await storage.updateTransactionCategoryUnified(txnId, matchedCategory);
      if (!ok) {
        await ctx.reply(this.t('memoNotFound'));
        this.clearPendingMemoState(ctx.chat?.id?.toString());
        return;
      }
      const msg = this.t('categorySuccess')
        .replace(/\{\{id\}\}/g, this.escapeTgHtml(txnId))
        .replace(/\{\{category\}\}/g, this.escapeTgHtml(matchedCategory));
      await ctx.reply(msg, { parse_mode: 'HTML' });
      this.clearPendingMemoState(ctx.chat?.id?.toString());
      const chatId = ctx.chat?.id?.toString();
      if (opts?.replyPromptMessageId != null && chatId) {
        this.removeMemoReplyTarget(chatId, opts.replyPromptMessageId);
      }
      return;
    }
    const storage = this.getStorageService();
    const ok = await storage.updateTransactionMemoUnified(txnId, trimmed);
    if (!ok) {
      await ctx.reply(this.t('memoNotFound'));
      this.clearPendingMemoState(ctx.chat?.id?.toString());
      return;
    }
    const preview = trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
    const msg = this.t('memoSuccess')
      .replace(/\{\{id\}\}/g, this.escapeTgHtml(txnId))
      .replace(/\{\{preview\}\}/g, this.escapeTgHtml(preview));
    await ctx.reply(msg, { parse_mode: 'HTML' });
    this.clearPendingMemoState(ctx.chat?.id?.toString());
    const chatId = ctx.chat?.id?.toString();
    if (opts?.replyPromptMessageId != null && chatId) {
      this.removeMemoReplyTarget(chatId, opts.replyPromptMessageId);
    }
  }

  private async handleMemoCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, '/memo');
        await ctx.reply(`${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`, { parse_mode: 'HTML' });
        return;
      }
      const chatId = ctx.chat?.id?.toString();
      if (!chatId) return;
      const raw = ((ctx.message as Message.TextMessage)?.text || '').trim();
      const parts = raw.split(/\s+/).filter(Boolean);
      const cmd0 = (parts[0] || '').split('@')[0];
      if (cmd0 !== '/memo') return;
      if (parts.length < 2) {
        await ctx.reply(this.t('memoHelp'), { parse_mode: 'HTML' });
        return;
      }
      const txnId = parts[1];
      const memoLine = parts.slice(2).join(' ').trim();
      const storage = this.getStorageService();
      if (!storage.transactionExists(txnId)) {
        await ctx.reply(this.t('memoNotFound'));
        return;
      }
      if (memoLine.length > 0) {
        await this.applyMemoFromTelegram(ctx, txnId, memoLine);
        return;
      }
      const state = this.chatStates.get(chatId) || {
        chatId,
        userId,
        isNotificationEnabled: false,
        isAdmin: this.config.adminChatIds.includes(chatId),
      };
      state.conversationContext = 'pending_memo';
      state.pendingMemoTxnId = txnId;
      this.chatStates.set(chatId, state);
      await ctx.reply(this.t('memoSendNext'), { parse_mode: 'HTML' });
    } catch (err) {
      serverLogger.error('Error in /memo command', { error: err });
      await ctx.reply(this.t('errorProcessing'));
    }
  }

  /** List One Zero profiles or start OTP flow (single profile skips list). */
  private async handleOneZeroOtpCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, '/onezero_otp');
        await ctx.reply(`${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`, {
          parse_mode: 'HTML',
        });
        return;
      }
      if (await this.replyIfAppLocked(ctx)) return;

      const profiles = (await this.getProfileService().getProfiles()).filter((p) => p.companyId === 'oneZero');
      if (profiles.length === 0) {
        await ctx.reply(this.t('onezeroOtpNoProfiles'), { parse_mode: 'HTML' });
        return;
      }
      if (profiles.length === 1) {
        await this.beginOneZeroOtpForProfile(ctx, profiles[0]);
        return;
      }

      const profileButtons = profiles.map((profile: Profile) =>
        Markup.button.callback(profile.name || profile.id, `onezero_otp_pick_${profile.id}`)
      );
      await ctx.reply(this.t('onezeroOtpSelectTitle'), Markup.inlineKeyboard([profileButtons]));
    } catch (error) {
      serverLogger.error('Error in /onezero_otp command', { error });
      await ctx.reply(this.t('errorRetrievingProfiles'));
    }
  }

  private async handleOneZeroOtpProfilePick(ctx: Context, profileId: string): Promise<void> {
    const userId = ctx.from?.id.toString() || '';
    if (!this.isUserAuthorized(userId)) {
      this.logUnauthorizedAttempt(ctx, 'onezero_otp_pick');
      await ctx.answerCbQuery(this.t('unauthorizedNoPermission'), { show_alert: true });
      return;
    }
    if (await this.replyIfAppLockedCallback(ctx)) return;

    await ctx.answerCbQuery();
    const profile = await this.getProfileService().getProfile(profileId);
    if (!profile || profile.companyId !== 'oneZero') {
      await ctx.reply(this.t('profileNotFound'));
      return;
    }
    await this.beginOneZeroOtpForProfile(ctx, profile);
  }

  /**
   * Send SMS unless a session is already bound (e.g. user requested SMS from the web); then prompt for OTP only.
   */
  private async beginOneZeroOtpForProfile(ctx: Context, profile: Profile): Promise<void> {
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id.toString() || '';
    if (!chatId || !userId) return;

    const phone = String(profile.credentials?.phoneNumber ?? '').trim();
    if (!phone.startsWith('+')) {
      await ctx.reply(this.t('onezeroOtpBadPhone'), { parse_mode: 'HTML' });
      return;
    }

    const state = this.chatStates.get(chatId) || {
      chatId,
      userId,
      isNotificationEnabled: false,
      isAdmin: this.config.adminChatIds.includes(chatId),
    };
    state.pendingOneZeroProfileId = profile.id;
    state.conversationContext = 'pending_onezero_otp';
    this.chatStates.set(chatId, state);

    const bound = getBoundSessionIdForProfile(profile.id);
    if (bound) {
      await ctx.reply(this.t('onezeroOtpPendingWeb'), { parse_mode: 'HTML' });
      return;
    }

    const scraperService = this.getScraperService();
    const result = await scraperService.oneZeroOtpTrigger(phone, profile.id);
    if (!result.success) {
      state.conversationContext = undefined;
      state.pendingOneZeroProfileId = undefined;
      this.chatStates.set(chatId, state);
      await ctx.reply(this.escapeTgHtml(result.error), { parse_mode: 'HTML' });
      return;
    }

    await ctx.reply(this.t('onezeroOtpSmsSent'), { parse_mode: 'HTML' });
  }

  private async handleOneZeroOtpCodeReply(ctx: Context, text: string): Promise<void> {
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id.toString() || '';
    if (!chatId || !userId) return;

    const state = this.chatStates.get(chatId);
    const profileId = state?.pendingOneZeroProfileId;
    if (!profileId) return;

    if (await this.replyIfAppLocked(ctx)) return;

    const code = text.replace(/\s+/g, '').trim();
    if (!/^\d{4,12}$/.test(code)) {
      await ctx.reply(this.t('onezeroOtpSendCode'), { parse_mode: 'HTML' });
      return;
    }

    const scraperService = this.getScraperService();
    const result = await scraperService.oneZeroOtpComplete(undefined, code, { saveToProfileId: profileId });

    if (state) {
      state.conversationContext = undefined;
      state.pendingOneZeroProfileId = undefined;
      this.chatStates.set(chatId, state);
    }

    if (!result.success) {
      await ctx.reply(this.escapeTgHtml(result.error), { parse_mode: 'HTML' });
      return;
    }

    await ctx.reply(this.t('onezeroOtpSuccess'), { parse_mode: 'HTML' });
  }

  private formatIlsForBot(amount: number): string {
    const lang = this.config?.language === 'he' ? 'he-IL' : 'en-US';
    return new Intl.NumberFormat(lang, {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private async handleCardCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, '/card');
        await ctx.reply(`${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`, { parse_mode: 'HTML' });
        return;
      }
      const raw = ((ctx.message as Message.TextMessage)?.text || '').trim();
      const parts = raw.split(/\s+/).filter(Boolean);
      const sub = (parts[1] || '').split('@')[0].toLowerCase();
      if (sub !== 'categories') {
        await ctx.reply(this.t('cardUsage'), { parse_mode: 'HTML' });
        return;
      }
      const maybeMonth = (parts[2] || '').split('@')[0];
      let monthKey: string;
      if (maybeMonth) {
        if (!/^\d{4}-\d{2}$/.test(maybeMonth)) {
          await ctx.reply(this.t('cardInvalidMonth'));
          return;
        }
        monthKey = maybeMonth;
      } else {
        const d = new Date();
        monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }

      const storage = this.getStorageService();
      let transactions = (await storage.getAllTransactions(true)) as Transaction[];
      transactions = transactions.filter((t) => typeof t.date === 'string' && t.date.startsWith(monthKey));

      const dash = await this.getDashboardConfigService().getDashboardConfig();
      const customCCKeywords = dash.customCCKeywords ?? [];

      const slices = buildCategoryExpenseSlices(transactions, customCCKeywords);
      const totalExpenses = slices.reduce((s, x) => s + x.value, 0);
      if (totalExpenses <= 0 || slices.length === 0) {
        await ctx.reply(this.t('cardEmpty'));
        return;
      }

      const png = await renderCategorySpendingPiePng({
        slices,
        title: this.t('cardTitleCategories'),
        subtitle: monthKey,
        otherLabel: this.t('cardOtherMerged'),
      });

      const caption = this.t('cardCaption')
        .replace(/\{\{month\}\}/g, monthKey)
        .replace(/\{\{total\}\}/g, this.formatIlsForBot(totalExpenses));

      await ctx.replyWithPhoto(Input.fromBuffer(png, `categories-${monthKey}.png`), {
        caption,
        parse_mode: 'HTML',
      });
    } catch (err) {
      serverLogger.error('Error in /card command', { error: err });
      await ctx.reply(this.t('cardFailed'));
    }
  }

  private async handleExportCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, '/export');
        await ctx.reply(`${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`, { parse_mode: 'HTML' });
        return;
      }
      const raw = ((ctx.message as Message.TextMessage)?.text || '').trim();
      const parts = raw.split(/\s+/).filter(Boolean);
      const arg = (parts[1] || '').split('@')[0].toLowerCase();
      if (arg !== 'csv' && arg !== 'json') {
        await ctx.reply(this.t('exportUsage'), { parse_mode: 'HTML' });
        return;
      }
      const maybeMonth = (parts[2] || '').split('@')[0];
      let monthFilter = '';
      if (maybeMonth) {
        if (!/^\d{4}-\d{2}$/.test(maybeMonth)) {
          await ctx.reply(this.t('exportInvalidMonth'));
          return;
        }
        monthFilter = maybeMonth;
      }
      const storage = this.getStorageService();
      let transactions = (await storage.getAllTransactions(true)) as Transaction[];
      if (monthFilter) {
        transactions = transactions.filter((t) => typeof t.date === 'string' && t.date.startsWith(monthFilter));
      }
      if (!transactions.length) {
        await ctx.reply(this.t('exportEmpty'));
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const count = transactions.length;
      const fileBase = monthFilter ? `transactions-${monthFilter}` : `transactions-${stamp}`;
      const caption = monthFilter
        ? this.t('exportCaptionMonth')
            .replace(/\{\{month\}\}/g, monthFilter)
            .replace(/\{\{count\}\}/g, String(count))
        : this.t('exportCaption').replace(/\{\{count\}\}/g, String(count));
      if (arg === 'json') {
        const body = transactionsToJson(transactions);
        await ctx.replyWithDocument(Input.fromBuffer(Buffer.from(body, 'utf8'), `${fileBase}.json`), {
          caption,
        });
      } else {
        const body = transactionsToCsv(transactions);
        await ctx.replyWithDocument(Input.fromBuffer(Buffer.from(body, 'utf8'), `${fileBase}.csv`), {
          caption,
        });
      }
    } catch (err) {
      serverLogger.error('Error in /export command', { error: err });
      await ctx.reply(this.t('exportFailed'));
    }
  }

  private async handleReviewCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString() || '';
      if (!this.isUserAuthorized(userId)) {
        this.logUnauthorizedAttempt(ctx, '/review');
        await ctx.reply(`${this.t('accessDenied')}\n\n${this.t('yourUserId')} <code>${userId}</code>\n\n${this.t('shareId')}`, {
          parse_mode: 'HTML',
        });
        return;
      }
      const cfg = await postScrapeService.getConfig();
      const rem = cfg.transactionReviewReminder;
      if (rem?.enabled === false) {
        await ctx.reply(this.t('reviewDisabled'), { parse_mode: 'HTML' });
        return;
      }
      const transfersOn = rem?.notifyTransfersCategory !== false;
      const uncategorizedOn = rem?.notifyUncategorized !== false;
      if (!transfersOn && !uncategorizedOn) {
        await ctx.reply(this.t('reviewDisabled'), { parse_mode: 'HTML' });
        return;
      }
      const storage = this.getStorageService();
      let transactions = (await storage.getAllTransactions(true)) as Transaction[];
      transactions = transactions.filter((t) => t.isInternalTransfer !== true);
      const lines: string[] = [];
      for (const t of transactions) {
        const reason = transactionNeedsReview(t, { transfers: transfersOn, uncategorized: uncategorizedOn });
        if (!reason) continue;
        const reasonLabel =
          reason === 'transfers' ? this.t('reviewReasonTransfers') : this.t('reviewReasonUncategorized');
        const reasonEsc = this.escapeTgHtml(reasonLabel);
        const desc = this.escapeTgHtml((t.description || '').slice(0, 80));
        const idEsc = this.escapeTgHtml(t.id);
        const dateStr = typeof t.date === 'string' ? t.date.slice(0, 10) : String(t.date);
        const dateEsc = this.escapeTgHtml(dateStr);
        const amtEsc = this.escapeTgHtml(this.formatIlsForBot(t.amount ?? t.chargedAmount ?? 0));
        lines.push(`• <b>${dateEsc}</b> · ${amtEsc} · ${desc}\n  <code>${idEsc}</code> · <i>${reasonEsc}</i>`);
      }
      if (lines.length === 0) {
        await ctx.reply(this.t('reviewEmpty'), { parse_mode: 'HTML' });
        return;
      }
      const header = this.t('reviewHeader').replace(/\{\{count\}\}/g, String(lines.length));
      const footer = this.t('reviewFooter');
      const full = `${header}\n\n${lines.join('\n\n')}\n\n${footer}`;
      const chunks = splitTelegramHtmlChunks(full, getTelegramMaxMessageChars());
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'HTML' });
      }
    } catch (err) {
      serverLogger.error('Error in /review command', { error: err });
      await ctx.reply(this.t('errorProcessing'));
    }
  }

  private ensureMemoReplyMapLoaded(): void {
    if (this.memoReplyMapLoaded) return;
    this.memoReplyMapLoaded = true;
    try {
      if (fs.existsSync(MEMO_REPLY_MAP_PATH)) {
        const raw = fs.readJsonSync(MEMO_REPLY_MAP_PATH) as { entries?: Record<string, { txnId: string; at: number }> };
        const entries = raw?.entries || {};
        const now = Date.now();
        for (const [k, v] of Object.entries(entries)) {
          if (v?.txnId && typeof v.at === 'number' && now - v.at < MEMO_REPLY_TTL_MS) {
            this.memoReplyMap.set(k, { txnId: v.txnId, at: v.at });
          }
        }
      }
    } catch (e) {
      serverLogger.warn('Failed to load telegram memo reply map', { error: (e as Error).message });
    }
  }

  private persistMemoReplyMap(): void {
    try {
      const entries: Record<string, { txnId: string; at: number }> = {};
      const now = Date.now();
      for (const [k, v] of this.memoReplyMap.entries()) {
        if (now - v.at < MEMO_REPLY_TTL_MS) entries[k] = v;
      }
      fs.ensureDirSync(path.dirname(MEMO_REPLY_MAP_PATH));
      fs.writeJsonSync(MEMO_REPLY_MAP_PATH, { entries }, { spaces: 2 });
    } catch (e) {
      serverLogger.warn('Failed to persist telegram memo reply map', { error: (e as Error).message });
    }
  }

  private getMemoReplyTarget(chatId: string, messageId: number): string | null {
    this.ensureMemoReplyMapLoaded();
    const k = `${chatId}_${messageId}`;
    const v = this.memoReplyMap.get(k);
    if (!v) return null;
    if (Date.now() - v.at > MEMO_REPLY_TTL_MS) {
      this.memoReplyMap.delete(k);
      this.persistMemoReplyMap();
      return null;
    }
    return v.txnId;
  }

  private registerMemoReplyTarget(chatId: string, messageId: number, txnId: string): void {
    this.ensureMemoReplyMapLoaded();
    const k = `${chatId}_${messageId}`;
    this.memoReplyMap.set(k, { txnId, at: Date.now() });
    this.persistMemoReplyMap();
  }

  private removeMemoReplyTarget(chatId: string, messageId: number): void {
    this.ensureMemoReplyMapLoaded();
    const k = `${chatId}_${messageId}`;
    if (this.memoReplyMap.delete(k)) this.persistMemoReplyMap();
  }

  private formatMemoReplyPrompt(it: TransactionReviewItem, lang: 'en' | 'he'): string {
    const tag =
      it.reason === 'transfers' ? (lang === 'he' ? 'העברות' : 'Transfers') : lang === 'he' ? 'אחר' : 'Other';
    const desc = this.escapeTgHtml((it.description || '').slice(0, 120));
    const idEsc = this.escapeTgHtml(it.id);
    const dateEsc = this.escapeTgHtml(it.date);
    const amt = typeof it.amount === 'number' ? it.amount.toFixed(2) : String(it.amount);
    const acctRaw = (it.accountNumber || '').trim();
    const acctEsc = this.escapeTgHtml(acctRaw || (lang === 'he' ? '—' : '—'));
    if (lang === 'he') {
      return (
        `📝 <b>תנועה לסיווג / הערה</b> (${tag})\n${desc}\n<b>סכום:</b> ₪${amt} · <b>תאריך:</b> ${dateEsc}\n<b>חשבון:</b> ${acctEsc}\n\n<code>${idEsc}</code>\n\n↩️ <b>השב להודעה זו</b> — הערה חופשית, או שם קטגוריה מדויק כמו בלוח הבקרה (הגדרות AI).`
      );
    }
    return (
      `📝 <b>Transaction — memo or category</b> (${tag})\n${desc}\n<b>Amount:</b> ₪${amt} · <b>Date:</b> ${dateEsc}\n<b>Account:</b> ${acctEsc}\n\n<code>${idEsc}</code>\n\n↩️ <b>Reply to this message</b> with a memo, or with the exact category label from your dashboard (AI settings).`
    );
  }

  /**
   * Notify subscribed Telegram chats when new AI memory alerts are persisted (from web or bot).
   */
  async notifyNewAiMemoryAlerts(
    alerts: { text: string; score: number }[],
    options?: { includeChatId?: string }
  ): Promise<void> {
    if (!alerts?.length || !this.bot || !this.isRunning) return;
    const minScore = getTelegramAiAlertMinScore();
    const filtered = alerts.filter((a) => Math.max(1, Math.min(100, Math.round(a.score))) >= minScore);
    if (filtered.length === 0) {
      serverLogger.debug('telegramBot: AI alert notify skipped (below min score)', {
        minScore,
        received: alerts.length,
      });
      return;
    }
    const cfg = this.getConfig();
    const chatIds = new Set<string>();
    for (const id of cfg.notificationChatIds || []) {
      if (id) chatIds.add(String(id));
    }
    if (options?.includeChatId) chatIds.add(String(options.includeChatId));
    if (chatIds.size === 0) {
      serverLogger.debug('telegramBot: AI alert notify skipped (no chats)');
      return;
    }

    const scoreLineHtml = (rawScore: number) => {
      const s = Math.max(1, Math.min(100, Math.round(rawScore)));
      const plain = this.t('newAiAlertScoreLine').replace(/\{\{score\}\}/g, String(s));
      return this.escapeTgHtml(plain);
    };

    let text: string;
    if (filtered.length === 1) {
      const a = filtered[0];
      const body = this.escapeTgHtml((a.text || '').slice(0, 3500));
      text = `${this.t('newAiAlertTitle')}\n<i>${scoreLineHtml(a.score)}</i>\n\n${body}`;
    } else {
      const blocks = filtered.map((a) => {
        const body = this.escapeTgHtml((a.text || '').slice(0, 1500));
        return `• <i>${scoreLineHtml(a.score)}</i>\n${body}`;
      });
      text = `${this.t('newAiAlertsTitle')}\n\n${blocks.join('\n\n')}`;
    }
    if (text.length > 4090) {
      text = `${text.slice(0, 4080)}…`;
    }

    for (const chatId of chatIds) {
      try {
        await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
      } catch (e) {
        serverLogger.warn('telegramBot: AI alert notification failed', {
          chatId,
          error: (e as Error).message,
        });
      }
    }
  }

  /**
   * Sends one Telegram message per transaction so the user can reply with memo text.
   * Called from post-scrape review reminder (Telegram channel is handled here, not via HTTP notifier).
   */
  async sendMemoReplyPromptsForReview(
    items: TransactionReviewItem[],
    request: ScrapeRequest | undefined,
    botLanguage: 'en' | 'he'
  ): Promise<void> {
    if (!this.bot || !this.isRunning) {
      serverLogger.debug('telegramBot: memo reply prompts skipped (bot not running)');
      return;
    }
    const cfg = this.getConfig();
    const baseIds = (cfg.notificationChatIds || []).map(String).filter(Boolean);
    const reqAny = request as any;
    const tgChat = reqAny?.options?.postScrape?.telegramChatId || reqAny?.options?.telegramChatId;
    if (baseIds.length === 0 && !tgChat) {
      serverLogger.debug('telegramBot: memo reply prompts skipped (no notification chat IDs)');
      return;
    }
    const lang = botLanguage === 'he' ? 'he' : 'en';
    const capped = items.slice(0, 12);
    let sendCount = 0;
    for (const it of capped) {
      const targets = resolveMemoPromptChatIds(cfg, it.accountNumber || '', baseIds, tgChat);
      for (const chatId of targets) {
        const text = this.formatMemoReplyPrompt(it, lang);
        try {
          const sent = await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
          this.registerMemoReplyTarget(chatId, sent.message_id, it.id);
          sendCount++;
        } catch (e) {
          serverLogger.warn('telegramBot: memo reply prompt send failed', {
            chatId,
            error: (e as Error).message,
          });
        }
      }
    }
    serverLogger.info('telegramBot: memo reply prompts sent', { sends: sendCount, items: capped.length });
  }

  /**
   * Get configuration
   */
  getConfig(): TelegramConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TelegramConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  /**
   * Add admin chat ID
   */
  addAdminChat(chatId: string): void {
    if (!this.config.adminChatIds.includes(chatId)) {
      this.config.adminChatIds.push(chatId);
      this.saveConfig();
    }
  }

  /**
   * Get notification chat IDs
   */
  getNotificationChatIds(): string[] {
    return [...this.config.notificationChatIds];
  }

  /**
   * Check if bot is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Deterministic long payload for exercising Telegram chunking (plain or HTML).
   */
  private buildLargeTestTelegramPayload(targetLen: number, mode: 'plain' | 'html'): string {
    const cap = Math.min(50000, Math.max(1, Math.floor(targetLen)));
    if (cap < 64) {
      return 'x'.repeat(cap);
    }
    let s = mode === 'html' ? '<b>LARGE-TEST</b>\n' : 'LARGE-TEST\n';
    let n = 0;
    while (s.length < cap) {
      const line = mode === 'html' ? `<i>${n}</i> ${'x'.repeat(32)}\n` : `LINE ${n} ${'x'.repeat(48)}\n`;
      const room = cap - s.length;
      if (line.length > room) {
        s += mode === 'html' ? 'x'.repeat(room) : line.slice(0, room);
        break;
      }
      s += line;
      n++;
    }
    return s.slice(0, cap);
  }

  /**
   * Send a test message to the given chat(s). If chatId is provided, send only to that chat;
   * otherwise send to all notification chat IDs.
   * Optional `testCharCount` (1–50000) sends a large payload split the same way as production long messages.
   */
  async sendTestMessage(
    chatId?: string,
    options?: { testCharCount?: number; mode?: 'plain' | 'html' }
  ): Promise<{ sent: number; errors: string[] }> {
    if (!this.bot || !this.isRunning) {
      throw new Error('Telegram bot is not running. Start the bot first.');
    }
    const targetIds = chatId ? [chatId] : this.config.notificationChatIds;
    if (targetIds.length === 0) {
      throw new Error('No notification chats configured. Add at least one user to the Notification column.');
    }
    const rawCount = options?.testCharCount;
    const count =
      rawCount != null && Number.isFinite(Number(rawCount)) ? Math.floor(Number(rawCount)) : 0;
    const mode = options?.mode === 'html' ? 'html' : 'plain';

    const errors: string[] = [];
    let sent = 0;
    const t0 = Date.now();
    let chunksPerTarget: number | undefined;

    try {
      if (count <= 0) {
        const text = '✅ Test message from Financial Overview. If you see this, notifications are working.';
        chunksPerTarget = 1;
        for (const id of targetIds) {
          try {
            await this.bot.telegram.sendMessage(id, text);
            sent++;
          } catch (err: any) {
            errors.push(`${id}: ${err?.message || err}`);
          }
        }
        return { sent, errors };
      }

      const payload = this.buildLargeTestTelegramPayload(count, mode);
      const chunks =
        mode === 'html'
          ? splitTelegramHtmlChunks(payload, 4080)
          : splitTelegramPlainText(payload, getTelegramMaxMessageChars());
      chunksPerTarget = chunks.length;

      for (const id of targetIds) {
        try {
          for (const chunk of chunks) {
            await this.bot.telegram.sendMessage(
              id,
              chunk,
              mode === 'html' ? { parse_mode: 'HTML' } : {}
            );
          }
          sent++;
        } catch (err: any) {
          errors.push(`${id}: ${err?.message || err}`);
        }
      }
      return { sent, errors };
    } finally {
      logExternal({
        service: 'telegram',
        operation: 'send_test_message',
        host: TELEGRAM_API_HOST,
        method: 'POST',
        path: '/bot<token>/sendMessage',
        outcome: sent === 0 && errors.length > 0 ? 'error' : 'ok',
        durationMs: Date.now() - t0,
        extra: {
          targets: targetIds.length,
          sent,
          errorLines: errors.length,
          largeMessage: count > 0,
          chunksPerTarget: chunksPerTarget ?? 0,
        },
      });
    }
  }
}

// Export singleton instance
export const telegramBotService = new TelegramBotService();

