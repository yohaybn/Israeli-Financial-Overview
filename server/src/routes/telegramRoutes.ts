/**
 * Telegram Bot Routes
 * Endpoints for managing Telegram bot configuration and control
 */

import { Router, Request, Response } from 'express';
import { telegramBotService } from '../services/telegramBotService.js';
import { TelegramNotifier } from '../services/notifications/telegramNotifier.js';
import { notificationService } from '../services/notifications/notificationService.js';
import { serverLogger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/telegram/config
 * Get current Telegram configuration
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const config = telegramBotService.getConfig();
    // Mask the token for security
    const maskedConfig = {
      ...config,
      botToken: config.botToken ? `***${config.botToken.slice(-10)}` : '',
    };

    // Add warning if allowedUsers is empty
    const warning = !telegramBotService.isAllowedUsersConfigured()
      ? 'No users are currently allowed to use the bot. Please add at least one user ID to allowedUsers to enable access.'
      : null;

    res.json({ success: true, data: maskedConfig, warning });
  } catch (error: any) {
    serverLogger.error('Error getting Telegram config', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram/config
 * Update Telegram configuration
 */
router.post('/config', async (req: Request, res: Response) => {
  try {
    const { botToken, enabled, adminChatIds, notificationChatIds, allowedUsers, language } = req.body;

    if (!botToken && enabled === undefined && !adminChatIds && !notificationChatIds && allowedUsers === undefined && !language) {
      return res.status(400).json({ success: false, error: 'At least one field is required' });
    }

    const config: any = {};
    if (botToken) config.botToken = botToken;
    if (enabled !== undefined) config.enabled = enabled;
    if (adminChatIds) config.adminChatIds = adminChatIds;
    if (notificationChatIds) config.notificationChatIds = notificationChatIds;
    if (allowedUsers !== undefined) config.allowedUsers = allowedUsers;
    if (language) config.language = language;

    telegramBotService.updateConfig(config);

    // If we have a valid token, notificationChatIds, or language, update the notifier
    if (botToken || notificationChatIds || language) {
      try {
        const telegramNotifier = notificationService.getNotifier('telegram') as TelegramNotifier;
        if (telegramNotifier) {
          telegramNotifier.updateConfig({
            botToken: botToken || undefined,
            chatIds: notificationChatIds || undefined,
            enabled: true,
            language: language || undefined,
          });
        }
      } catch (notifierError) {
        serverLogger.warn('Could not update telegram notifier', { notifierError });
      }
    }

    res.json({ success: true, message: 'Configuration updated' });
  } catch (error: any) {
    serverLogger.error('Error updating Telegram config', { error });
    res.status(500).json({ success: false, error: error.message || 'Failed to update config' });
  }
});

/**
 * POST /api/telegram/start
 * Start the Telegram bot
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { botToken } = req.body;

    if (!telegramBotService.isActive()) {
      // Register Telegram notifier immediately so other services can use it
      const notifier = new TelegramNotifier({
        botToken: botToken || undefined,
        chatIds: telegramBotService.getNotificationChatIds(),
        enabled: true,
      });
      try {
        notificationService.registerNotifier('telegram', notifier);
      } catch (e) {
        serverLogger.warn('Failed to register telegram notifier during start', { error: e });
      }

      // Start the bot in background and don't block the HTTP request
      telegramBotService.start(botToken).then(() => {
        serverLogger.info('Telegram bot started (background)');
      }).catch((err) => {
        serverLogger.error('Error starting Telegram bot (background)', { error: err });
      });

      // Respond immediately so UI doesn't hang waiting for launch
      res.json({ success: true, message: 'Telegram bot starting' });
    } else {
      res.json({ success: true, message: 'Bot is already running' });
    }
  } catch (error: any) {
    serverLogger.error('Error starting Telegram bot', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram/stop
 * Stop the Telegram bot
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    await telegramBotService.stop();
    res.json({ success: true, message: 'Telegram bot stopped' });
  } catch (error: any) {
    serverLogger.error('Error stopping Telegram bot', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/telegram/status
 * Get bot status and info
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const config = telegramBotService.getConfig();
    const notificationChatIds = telegramBotService.getNotificationChatIds();

    // Add warning if allowedUsers is empty
    const warning = !telegramBotService.isAllowedUsersConfigured()
      ? 'No users are currently allowed to use the bot. Please add at least one user ID to allowedUsers to enable access.'
      : null;

    res.json({
      success: true,
      data: {
        isActive: telegramBotService.isActive(),
        enabled: config.enabled,
        hasToken: !!config.botToken,
        adminChats: config.adminChatIds.length,
        notificationChats: notificationChatIds.length,
        usersConfigured: telegramBotService.isAllowedUsersConfigured(),
        lastStartError: telegramBotService.getLastStartError(),
      },
      warning,
    });
  } catch (error: any) {
    serverLogger.error('Error getting Telegram status', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram/send-test-message
 * Send a test message to notification chat(s) using the running bot.
 */
router.post('/send-test-message', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.body || {};
    const result = await telegramBotService.sendTestMessage(chatId);
    if (result.errors.length > 0 && result.sent === 0) {
      return res.status(500).json({ success: false, error: result.errors[0] });
    }
    res.json({
      success: true,
      message: result.sent > 0 ? `Test message sent to ${result.sent} chat(s).` : 'No messages sent.',
      sent: result.sent,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error: any) {
    serverLogger.error('Error sending Telegram test message', { error });
    res.status(400).json({ success: false, error: error.message || 'Failed to send test message' });
  }
});

/**
 * POST /api/telegram/test
 * Test the bot token and send a test message
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { botToken, chatId } = req.body;

    if (!botToken || !chatId) {
      return res.status(400).json({
        success: false,
        error: 'botToken and chatId are required',
      });
    }

    // Try to send a test message
    const { Telegraf } = await import('telegraf');
    const testBot = new Telegraf(botToken);

    await testBot.telegram.sendMessage(
      chatId,
      'âœ… Telegram bot configuration test successful!'
    );

    res.json({ success: true, message: 'Test message sent' });
  } catch (error: any) {
    serverLogger.error('Error testing Telegram config', { error });
    const errorMessage = error.response?.description || error.message;
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/telegram/notification-chat/add
 * Add a chat to notification list
 */
router.post('/notification-chat/add', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({ success: false, error: 'chatId is required' });
    }

    const config = telegramBotService.getConfig();
    if (!config.notificationChatIds.includes(chatId)) {
      config.notificationChatIds.push(chatId);
      telegramBotService.updateConfig(config);

      // Update notifier
      const telegramNotifier = notificationService.getNotifier('telegram') as TelegramNotifier;
      if (telegramNotifier) {
        telegramNotifier.addChatId(chatId);
      }
    }

    res.json({ success: true, message: 'Chat added to notifications' });
  } catch (error: any) {
    serverLogger.error('Error adding notification chat', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram/notification-chat/remove
 * Remove a chat from notification list
 */
router.post('/notification-chat/remove', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({ success: false, error: 'chatId is required' });
    }

    const config = telegramBotService.getConfig();
    config.notificationChatIds = config.notificationChatIds.filter(id => id !== chatId);
    telegramBotService.updateConfig(config);

    // Update notifier
    const telegramNotifier = notificationService.getNotifier('telegram') as TelegramNotifier;
    if (telegramNotifier) {
      telegramNotifier.removeChatId(chatId);
    }

    res.json({ success: true, message: 'Chat removed from notifications' });
  } catch (error: any) {
    serverLogger.error('Error removing notification chat', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/telegram/notification-chats
 * Get list of notification chats
 */
router.get('/notification-chats', async (req: Request, res: Response) => {
  try {
    const notificationChatIds = telegramBotService.getNotificationChatIds();
    res.json({ success: true, data: notificationChatIds });
  } catch (error: any) {
    serverLogger.error('Error getting notification chats', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram/user-labels
 * Best-effort display labels for user/chat IDs
 */
router.post('/user-labels', async (req: Request, res: Response) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map((id: any) => String(id)) : [];
    const uniqueIds: string[] = Array.from(new Set(ids.filter(Boolean)));

    if (uniqueIds.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const config = telegramBotService.getConfig();
    if (!config.botToken) {
      return res.json({ success: true, data: {} });
    }

    const { Telegraf } = await import('telegraf');
    const bot = new Telegraf(config.botToken);
    const labels: Record<string, string> = {};

    await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const chat = await bot.telegram.getChat(id);
          const username = (chat as any)?.username ? `@${(chat as any).username}` : null;
          const firstName = (chat as any)?.first_name || '';
          const lastName = (chat as any)?.last_name || '';
          const title = (chat as any)?.title || '';
          labels[id] = username || `${firstName} ${lastName}`.trim() || title || id;
        } catch {
          labels[id] = id;
        }
      })
    );

    res.json({ success: true, data: labels });
  } catch (error: any) {
    serverLogger.error('Error resolving telegram user labels', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// NOTE: status endpoint is defined above with detailed fields; duplicate removed

// Auto-start bot if a token is configured (start automatically when token exists)
(async () => {
  try {
    const config = telegramBotService.getConfig();
    if (config.botToken && config.botToken.trim() !== '') {
      // Register Telegram notifier so notification channels work on auto-start
      const notifier = new TelegramNotifier({
        botToken: config.botToken,
        chatIds: config.notificationChatIds || [],
        enabled: true,
        language: config.language || 'en',
      });
      try {
        notificationService.registerNotifier('telegram', notifier);
      } catch (e) {
        serverLogger.warn('Failed to register telegram notifier during auto-start', { error: e });
      }

      serverLogger.info('Auto-starting Telegram bot with configured token...');
      await telegramBotService.start(config.botToken);
      serverLogger.info('Telegram bot auto-started successfully');
    }
  } catch (error: any) {
    serverLogger.warn('Could not auto-start Telegram bot. You can start it manually via POST /api/telegram/start', { error: error?.message });
  }
})();

export const telegramRoutes = router;
