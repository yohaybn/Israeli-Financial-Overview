/**
 * Telegram Notifier Implementation
 * Sends pipeline notifications to Telegram using MarkdownV2 formatting
 */

import { BaseNotifier } from './baseNotifier.js';
import { NotificationPayload, NotifierConfig } from './types.js';
import axios from 'axios';
import { serverLogger } from '../../utils/logger.js';
import {
  externalOutcomeFromAxiosError,
  logExternal,
  TELEGRAM_API_HOST,
} from '../../utils/externalServiceLog.js';
import { splitTelegramPlainText } from '../../utils/telegramTextSplit.js';
import { toMarkdown, unescapeMDV2 } from './formatter.js';

export interface TelegramNotifierConfig extends Omit<NotifierConfig, 'enabled'> {
  enabled?: boolean;
  botToken?: string;
  chatIds?: string[];
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  language?: 'en' | 'he';
}

export class TelegramNotifier extends BaseNotifier {
  private botToken: string;
  private chatIds: string[];
  private telegramApiUrl: string;
  private parseMode: 'HTML' | 'Markdown' | 'MarkdownV2';
  private language: 'en' | 'he';

  constructor(config: TelegramNotifierConfig = {}) {
    super('telegram', { enabled: config.enabled ?? false, ...config });
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatIds = config.chatIds || [];
    this.parseMode = 'MarkdownV2';
    this.language = config.language || 'en';
    this.telegramApiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Send notification to all configured chat IDs
   */
  async send(payload: NotificationPayload): Promise<void> {
    if (!this.botToken) {
      serverLogger.debug('Telegram notifier missing botToken - skipping send');
      return;
    }
    if (this.chatIds.length === 0) {
      serverLogger.debug('Telegram notifier has no configured chat IDs - skipping send');
      return;
    }

    const message = toMarkdown(payload, this.language);
    const chunks = splitTelegramPlainText(message, 3800);

    for (const chatId of this.chatIds) {
      let sent = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const useParseMode = i === 0;
        const textToSend = useParseMode ? chunk : unescapeMDV2(chunk);
        try {
          await this.sendMessage(chatId, textToSend, useParseMode);
          sent++;
        } catch (error) {
          serverLogger.warn(`Telegram chunk ${i + 1}/${chunks.length} failed for chat ${chatId}`, { error: (error as Error).message });
          this.onError(error as Error, payload);
        }
      }
      if (sent > 0) {
        serverLogger.debug(`Telegram notification sent to chat ${chatId} (${sent}/${chunks.length} chunks)`);
      }
    }
  }

  /**
   * Send a message to a specific chat.
   * @param useParseMode - if false, send as plain text (used for continuation chunks so Telegram doesn't reject them)
   */
  private async sendMessage(chatId: string, message: string, useParseMode: boolean = true): Promise<void> {
    const t0 = Date.now();
    try {
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text: message,
      };
      if (useParseMode) {
        payload.parse_mode = this.parseMode;
      }
      const response = await axios.post(`${this.telegramApiUrl}/sendMessage`, payload);
      const durationMs = Date.now() - t0;

      if (!response.data.ok) {
        const desc = response.data.description || 'Unknown error';
        logExternal({
          service: 'telegram',
          operation: 'send_message',
          host: TELEGRAM_API_HOST,
          method: 'POST',
          path: '/bot<token>/sendMessage',
          outcome: 'error',
          durationMs,
          httpStatus: response.status,
          errorMessage: String(desc),
          extra: { parseMode: useParseMode },
        });
        throw new Error(`Telegram API error: ${desc}`);
      }
      logExternal({
        service: 'telegram',
        operation: 'send_message',
        host: TELEGRAM_API_HOST,
        method: 'POST',
        path: '/bot<token>/sendMessage',
        outcome: 'ok',
        durationMs,
        httpStatus: response.status,
        extra: { parseMode: useParseMode, textChars: message.length },
      });
    } catch (error) {
      const durationMs = Date.now() - t0;
      if (axios.isAxiosError(error)) {
        const { outcome, httpStatus, errorMessage } = externalOutcomeFromAxiosError(error);
        logExternal({
          service: 'telegram',
          operation: 'send_message',
          host: TELEGRAM_API_HOST,
          method: 'POST',
          path: '/bot<token>/sendMessage',
          outcome,
          durationMs,
          httpStatus,
          errorMessage,
          extra: { parseMode: useParseMode },
        });
        throw new Error(`Failed to send Telegram message: ${error.response?.data?.description || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate Telegram configuration
   */
  validate(config: TelegramNotifierConfig): boolean {
    const isEnabled = config.enabled ?? this.config?.enabled ?? false;
    const fullConfig: NotifierConfig = { ...config, enabled: isEnabled };
    const baseValid = super.validate(fullConfig);
    if (!baseValid) return false;

    if (isEnabled) {
      const hasToken = config.botToken || this.botToken || process.env.TELEGRAM_BOT_TOKEN;
      return !!hasToken;
    }

    return true;
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(config: Partial<TelegramNotifierConfig>): void {
    (this.config as any) = { ...this.config, ...config };
    if (config.botToken) this.botToken = config.botToken;
    if (config.chatIds) this.chatIds = config.chatIds;
    if (config.parseMode) this.parseMode = config.parseMode;
    if (config.language) this.language = config.language;
  }

  /**
   * Add a chat ID
   */
  addChatId(chatId: string): void {
    if (!this.chatIds.includes(chatId)) {
      this.chatIds.push(chatId);
      (this.config as any).chatIds = this.chatIds;
    }
  }

  /**
   * Remove a chat ID
   */
  removeChatId(chatId: string): void {
    this.chatIds = this.chatIds.filter(id => id !== chatId);
    (this.config as any).chatIds = this.chatIds;
  }

  /**
   * Get configured chat IDs
   */
  getChatIds(): string[] {
    return [...this.chatIds];
  }
}
