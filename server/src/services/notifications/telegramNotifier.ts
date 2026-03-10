/**
 * Telegram Notifier Implementation
 * Sends pipeline notifications to Telegram
 */

import { BaseNotifier } from './baseNotifier.js';
import { NotificationPayload, NotifierConfig } from './types.js';
import axios from 'axios';
import { serverLogger } from '../../utils/logger.js';

export interface TelegramNotifierConfig extends Omit<NotifierConfig, 'enabled'> {
  enabled?: boolean;
  botToken?: string;
  chatIds?: string[];
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

export class TelegramNotifier extends BaseNotifier {
  private botToken: string;
  private chatIds: string[];
  private telegramApiUrl: string;
  private parseMode: 'HTML' | 'Markdown' | 'MarkdownV2';

  constructor(config: TelegramNotifierConfig = {}) {
    super('telegram', { enabled: config.enabled ?? false, ...config });
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatIds = config.chatIds || [];
    this.parseMode = config.parseMode || 'HTML';
    this.telegramApiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Send notification to all configured chat IDs
   */
  async send(payload: NotificationPayload): Promise<void> {
    if (!this.botToken || this.chatIds.length === 0) {
      throw new Error('Telegram notifier not properly configured (missing botToken or chatIds)');
    }

    const message = this.formatMessage(payload);

    for (const chatId of this.chatIds) {
      try {
        await this.sendMessage(chatId, message);
        serverLogger.debug(`Telegram notification sent to chat ${chatId}`);
      } catch (error) {
        this.onError(error as Error, payload);
        throw error;
      }
    }
  }

  /**
   * Send a message to a specific chat
   */
  private async sendMessage(chatId: string, message: string): Promise<void> {
    try {
      const response = await axios.post(`${this.telegramApiUrl}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: this.parseMode,
      });

      if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description || 'Unknown error'}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to send Telegram message: ${error.response?.data?.description || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Format payload as Telegram HTML message
   */
  private formatMessage(payload: NotificationPayload): string {
    const statusEmoji = payload.status === 'success' ? '✅' : '❌';
    const statusText = payload.status.toUpperCase();

    switch (payload.detailLevel) {
      case 'minimal':
        return `${statusEmoji} <b>Pipeline ${statusText}</b>\nDuration: ${(payload.summary.durationMs / 1000).toFixed(2)}s`;

      case 'normal':
        return [
          `${statusEmoji} <b>Pipeline Notification - ${statusText}</b>`,
          `<b>ID:</b> <code>${payload.pipelineId}</code>`,
          `<b>Duration:</b> ${(payload.summary.durationMs / 1000).toFixed(2)}s`,
          `<b>Stages:</b> ${payload.summary.stagesRun.join(' → ')}`,
          `<b>Successful:</b> ${payload.summary.successfulStages.join(', ') || 'None'}`,
          payload.summary.failedStage ? `<b>Failed:</b> ${payload.summary.failedStage}` : '',
          payload.summary.transactionCount ? `<b>Transactions:</b> ${payload.summary.transactionCount}` : '',
          payload.summary.insights?.length ? `<b>Insights:</b>\n${payload.summary.insights.map(i => `• ${i}`).join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n');

      case 'detailed':
        return [
          `${statusEmoji} <b>Pipeline Notification - ${statusText}</b>`,
          `<b>ID:</b> <code>${payload.pipelineId}</code>`,
          `<b>Timestamp:</b> ${payload.timestamp.toISOString()}`,
          `<b>Duration:</b> ${(payload.summary.durationMs / 1000).toFixed(2)}s`,
          `<b>Stages:</b> ${payload.summary.stagesRun.join(' → ')}`,
          `<b>Successful Stages:</b> ${payload.summary.successfulStages.join(', ') || 'None'}`,
          payload.summary.failedStage ? `<b>Failed Stage:</b> ${payload.summary.failedStage}` : '',
          `<b>Summary:</b>`,
          `  Transactions: ${payload.summary.transactionCount || 0}`,
          `  Accounts: ${payload.summary.accounts || 0}`,
          `  Balance: ${payload.summary.balance || 0}`,
          payload.summary.insights?.length ? `<b>Insights:</b>\n${payload.summary.insights.map(i => `• ${i}`).join('\n')}` : '',
          payload.errorDetails ? `<b>Error:</b> ${payload.errorDetails.message}` : '',
        ]
          .filter(Boolean)
          .join('\n');

      case 'verbose':
        return `<pre>${JSON.stringify(payload, null, 2)}</pre>`;

      default:
        return this.formatMessage({ ...payload, detailLevel: 'normal' });
    }
  }

  /**
   * Validate Telegram configuration
   */
  validate(config: TelegramNotifierConfig): boolean {
    const fullConfig: NotifierConfig = { enabled: config.enabled ?? false, ...config };
    const baseValid = super.validate(fullConfig);
    if (!baseValid) return false;

    // If enabled, require botToken and at least one chatId
    if (config.enabled) {
      const hasToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN;
      const hasChatIds = config.chatIds && config.chatIds.length > 0;
      return !!(hasToken && hasChatIds);
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
