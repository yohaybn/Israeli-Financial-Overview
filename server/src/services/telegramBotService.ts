/**
 * Telegram Bot Service
 * Handles Telegram bot interactions including AI chat and scraper control
 */

import { Telegraf, Context, Markup } from 'telegraf';
import { Message } from 'telegraf/types';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { serverLogger } from '../utils/logger.js';
import { AiService, type ConversationTurn } from './aiService.js';
import { ScraperService } from './scraperService.js';
import { profileService, ProfileService } from './profileService.js';
import { appLockService } from './appLockService.js';
import { StorageService } from './storageService.js';
import { Profile, ScrapeRequest, ScrapeResult } from '@app/shared';
import { postScrapeService } from './postScrapeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const TEL_CONFIG_PATH = path.join(DATA_DIR, 'config', 'telegram_config.json');

export interface TelegramConfig {
  botToken: string;
  enabled: boolean;
  adminChatIds: string[];
  notificationChatIds: string[];
  allowedUsers?: string[]; // Empty = allow all
  language?: 'en' | 'he'; // Bot UI language
  /** After a successful scrape, send a short budget / anomaly digest to Telegram (deduped by fingerprint). */
  spendingDigestEnabled?: boolean;
}

// Translation strings for the bot
const BOT_STRINGS: Record<'en' | 'he', Record<string, string>> = {
  en: {
    accessDenied: '❌ <b>Access Denied</b>\n\nYou don\'t have permission to use this bot yet.',
    yourUserId: '<b>Your User ID:</b>',
    shareId: 'Please share your User ID with the manager to request access.',
    welcome: '👋 Welcome to Israeli Bank Scraper Bot!\n\nI can help you with:\n• 📊 Run bank scrapers and get notifications\n• 💬 Chat with AI about your transactions\n• ⚙️ Manage your settings\n\nUse /help for available commands',
    helpText: '📖 <b>Available Commands:</b>\n\n<b>Scraping:</b>\n/scrape - Run a bank scraper\n/status - Check scraper status\n\n<b>AI Chat:</b>\n/chat - Start AI chat about transactions\n\n<b>Notifications:</b>\n/subscribe - Enable notifications\n/unsubscribe - Disable notifications\n\n<b>Settings:</b>\n/settings - Manage your preferences\n\n<b>App lock:</b>\n/unlock - Enter app password when the web UI is locked\n\n<b>Help:</b>\n/help - Show this message',
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
  },
  he: {
    accessDenied: '❌ <b>גישה נדחתה</b>\n\nאין לך הרשאה להשתמש בבוט זה עדיין.',
    yourUserId: '<b>מזהה המשתמש שלך:</b>',
    shareId: 'אנא שתף את מזהה המשתמש שלך עם המנהל כדי לבקש גישה.',
    welcome: '👋 ברוך הבא לבוט סריקת הבנקים הישראלי!\n\nאני יכול לעזור לך עם:\n• 📊 הרצת סורקים ושיגור התראות\n• 💬 שיחה עם AI על העסקאות שלך\n• ⚙️ ניהול ההגדרות שלך\n\nהקלד /help לרשימת הפקודות',
    helpText: '📖 <b>פקודות זמינות:</b>\n\n<b>סריקה:</b>\n/scrape - הרץ סורק בנק\n/status - בדוק סטטוס סורק\n\n<b>שיחת AI:</b>\n/chat - התחל שיחת AI על עסקאות\n\n<b>התראות:</b>\n/subscribe - הפעל התראות\n/unsubscribe - בטל התראות\n\n<b>הגדרות:</b>\n/settings - נהל את ההעדפות שלך\n\n<b>נעילת אפליקציה:</b>\n/unlock - הזן סיסמת אפליקציה כשהממשק נעול\n\n<b>עזרה:</b>\n/help - הצג הודעה זו',
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
}

export class TelegramBotService {
  private bot: Telegraf | null = null;
  private config: TelegramConfig;
  private chatStates: Map<string, TelegramChatState>;
  private aiService: AiService | null = null;
  private scraperService: ScraperService | null = null;
  private isRunning: boolean = false;
  private lastStartError: string | null = null;

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
      ['/chat', '/scrape', '/status'],
      ['/subscribe', '/unsubscribe', '/settings'],
      ['/unlock', '/help']
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
      allowedUsers: [],
      language: 'en',
      spendingDigestEnabled: false,
    };
    try {
      if (fs.existsSync(TEL_CONFIG_PATH)) {
        const file = fs.readJsonSync(TEL_CONFIG_PATH) as Partial<TelegramConfig>;
        serverLogger.info('Loaded Telegram config from file');
        return { ...defaults, ...file };
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
      this.bot = new Telegraf(token);
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
        const me = await this.bot.telegram.getMe();
        serverLogger.info('Telegram bot launched and reachable', { bot_username: me.username, bot_id: me.id });
      } catch (meErr) {
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
          const known = ['/scrape', '/chat', '/settings', '/status', '/subscribe', '/unsubscribe', '/help', '/start', '/done', '/cancel', '/unlock'];
          const cmd = rawText.split(' ')[0];
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
    for (const profile of profiles) {
      const result = await this.executeScrapeForProfile(ctx, profile, userId, startDate, true);
      if (result) results.push(result);
    }

    if (results.length > 0) {
      try {
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

      // Build a context query similar to the web UI unified chat
      const contextQuery = `\nContext Rules:\n- History transactions: Older than the current month. Used for baselines and averages.\n- Current month transactions: The focus of immediate budget tracking.\n- Internal transfers/credit card payments should ideally be marked as "Internal Transfer" using the category/type tools to avoid double counting expenses.\n- Ignored transactions: should be fully excluded from calculations.\n\nUser Query: ${message}`;

      const state = this.chatStates.get(chatIdNum.toString());
      const chatHistory = state?.chatHistory ?? [];

      const aiService = this.getAiService();
      let response = '';
      try {
        response = await aiService.analyzeData(contextQuery, transactions, {
          conversationHistory: chatHistory,
          temperature: 0.7
        });
      } catch (err) {
        serverLogger.error('AI analyzeData failed for Telegram chat', { error: err });
        response = `${this.t('financialTipTitle')}\n${this.t('financialTipLine1')}\n\n${this.t('yourQuestionPrefix')} "${message}"\n\n${this.t('financialTipLine2')}`;
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

      // If response already contains HTML tags, use as-is; otherwise convert Markdown to HTML
      const looksLikeHtml = /<\/?\w+[^>]*>/.test(response);
      const htmlResponse = looksLikeHtml ? response : this.convertMarkdownToHtml(response);

      if (htmlResponse.length > 4096) {
        const chunks = htmlResponse.match(/[\s\S]{1,4096}/g) || [];
        // Edit first chunk into the thinking message
        try {
          // @ts-ignore
          await ctx.telegram.editMessageText(chatIdNum, thinkingMsg.message_id, undefined, chunks[0], { parse_mode: 'HTML' });
        } catch (e) {
          // If edit fails, send as a new message
          await ctx.reply(String(chunks[0]), { parse_mode: 'HTML' });
        }
        for (let i = 1; i < chunks.length; i++) {
          await ctx.reply(String(chunks[i]), { parse_mode: 'HTML' });
        }
      } else {
        try {
          // @ts-ignore
          await ctx.telegram.editMessageText(chatIdNum, thinkingMsg.message_id, undefined, htmlResponse, { parse_mode: 'HTML' });
        } catch (e) {
          await ctx.reply(String(htmlResponse), { parse_mode: 'HTML' });
        }
      }
    } catch (error) {
      serverLogger.error('Error in AI chat', { error });
      await ctx.reply(this.t('errorProcessing'));
    }
  }

  /**
   * Get AI response for chat message
   */
  private async getAIResponse(message: string, _chatId: string): Promise<string> {
    try {
      const aiService = this.getAiService();
      const transactions = await this.loadUnifiedTransactionsForAiChat();
      const contextQuery = `\nContext Rules:\n- History transactions: Older than the current month. Used for baselines and averages.\n- Current month transactions: The focus of immediate budget tracking.\n- Internal transfers/credit card payments should ideally be marked as "Internal Transfer" using the category/type tools to avoid double counting expenses.\n- Ignored transactions: should be fully excluded from calculations.\n\nUser Query: ${message}`;

      // Try to call the AI analysis with unified DB context (same as /chat mode). If AI provider isn't configured
      // or the call fails, fall back to a helpful tip directing the user to the web UI.
      try {
        const aiResponse = await aiService.analyzeData(contextQuery, transactions, { temperature: 0.7 });
        if (aiResponse && aiResponse.trim().length > 0) {
          return aiResponse;
        }
      } catch (aiError) {
        serverLogger.warn('AI analyzeData failed or GEMINI not configured, falling back', { error: aiError });
      }

      // Fallback helpful tip when AI provider is not configured or no data available
      const financialTips = `${this.t('financialTipTitle')}\n${this.t('financialTipLine1')}\n\n${this.t('yourQuestionPrefix')} "${message}"\n\n${this.t('financialTipLine2')}`;
      return financialTips;
    } catch (error) {
      serverLogger.error('Error getting AI response', { error });
      return this.t('errorProcessing');
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

      try {
        const profile = await this.getProfileService().getProfile(profileId);
        if (!profile) {
          await ctx.reply(this.t('profileNotFound'));
          return;
        }
        await this.executeScrapeForProfile(ctx, profile, userId, startDate);

      } catch (scraperError: any) {
        serverLogger.error('Scraper execution failed', { scraperError });
        await ctx.reply(`${this.t('errorScraper')}: ${scraperError.message}`);
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
  private async executeScrapeForProfile(ctx: Context, profile: Profile, userId: string, startDate?: string, isPartOfBatch?: boolean): Promise<ScrapeResult | null> {
    const scraperService = this.getScraperService();
    const scrapeRequest: ScrapeRequest = {
      companyId: profile.companyId,
      credentials: profile.credentials,
      profileId: profile.id,
      profileName: profile.name,
      options: {
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
        await ctx.reply(`${this.t('scrapeFailedPrefix')} ${result.error || this.t('errorScraper')}`);
      }
      return result;
    }
    const txnCount = result.transactions?.length || 0;

    // Persist the scrape result (so DB has transactions for "current" / "all" scope)
    try {
      const storage = this.getStorageService();
      const provider = (profile && (profile.name || profile.companyId)) || 'telegram';
      const savedFilename = await storage.saveScrapeResult(result, provider);
      serverLogger.info('Saved scrape result from Telegram', { filename: savedFilename, profileId: profile.id });
    } catch (saveErr) {
      serverLogger.warn('Failed to save scrape result from Telegram', { error: saveErr });
    }

    if (!isPartOfBatch) {
      serverLogger.info('Telegram scrape completed; aggregated Telegram notification is sent by post-scrape flow', {
        profileId: profile.id,
        transactionCount: txnCount,
        startDate: startDate || 'global-default',
      });
    }
    return result;
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
      if (state) {
        state.conversationContext = undefined;
        state.chatHistory = undefined; // Clear so next /chat starts fresh
        this.chatStates.set(chatId, state);
      }

      await ctx.reply(wasPendingUnlock ? this.t('unlockCancelled') : this.t('exitedChatMode'));
    } catch (error) {
      serverLogger.error('Error handling done command', { error });
      await ctx.reply(this.t('errorExitingChatMode'));
    }
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
   * Send a test message to the given chat(s). If chatId is provided, send only to that chat;
   * otherwise send to all notification chat IDs.
   */
  async sendTestMessage(chatId?: string): Promise<{ sent: number; errors: string[] }> {
    if (!this.bot || !this.isRunning) {
      throw new Error('Telegram bot is not running. Start the bot first.');
    }
    const targetIds = chatId ? [chatId] : this.config.notificationChatIds;
    if (targetIds.length === 0) {
      throw new Error('No notification chats configured. Add at least one user to the Notification column.');
    }
    const text = '✅ Test message from Israeli Bank Scraper. If you see this, notifications are working.';
    const errors: string[] = [];
    let sent = 0;
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
}

// Export singleton instance
export const telegramBotService = new TelegramBotService();

