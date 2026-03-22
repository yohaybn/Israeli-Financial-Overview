/**
 * Telegram Notifier Implementation
 * Sends pipeline notifications to Telegram using MarkdownV2 formatting
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
  language?: 'en' | 'he';
}

// MarkdownV2 escape helper – must escape these chars outside code spans
function escMDV2(text: string): string {
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// Remove MarkdownV2 escaping so we can send continuation chunks as plain text (no parse_mode)
function unescapeMDV2(text: string): string {
  return String(text).replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1');
}

const LABELS: Record<'en' | 'he', Record<string, string>> = {
  en: {
    scrapeNotification: '🏦 Scrape Notification',
    profile: 'Profile',
    duration: 'Duration',
    transactions: 'Transactions',
    accounts: 'Accounts',
    balance: 'Balance',
    error: 'Error',
    stages: 'Stages',
    successful: 'Successful',
    failed: 'Failed',
    timestamp: 'Timestamp',
    insights: 'Insights',
    source: 'Source',
    sourceTelegramBot: 'Telegram bot',
    sourceScheduler: 'Scheduler',
    sourceManual: 'Manual',
    successStatus: '✅ SUCCESS',
    failureStatus: '❌ FAILURE',
    warningStatus: '⚠️ WARNING',
    seconds: 's',
  },
  he: {
    scrapeNotification: '🏦 תוצאת סריקה',
    profile: 'פרופיל',
    duration: 'משך',
    transactions: 'עסקאות',
    accounts: 'חשבונות',
    balance: 'יתרה',
    error: 'שגיאה',
    stages: 'שלבים',
    successful: 'הצליחו',
    failed: 'נכשל',
    timestamp: 'זמן',
    insights: 'תובנות',
    source: '\u05DE\u05E7\u05D5\u05E8',
    sourceTelegramBot: '\u05D1\u05D5\u05D8 \u05D8\u05DC\u05D2\u05E8\u05DD',
    sourceScheduler: '\u05DE\u05EA\u05D6\u05DE\u05DF',
    sourceManual: '\u05D9\u05D3\u05E0\u05D9',
    successStatus: '✅ הצלחה',
    failureStatus: '❌ כישלון',
    warningStatus: '⚠️ אזהרה',
    seconds: 'שניות',
  },
};

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

    const message = this.formatMessage(payload);
    const chunks = this.splitMessageForTelegram(message, 3800);

    for (const chatId of this.chatIds) {
      let sent = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        // First chunk uses parse_mode for formatting; continuation chunks are sent as plain text
        // so Telegram never rejects them (MarkdownV2 often fails on chunk 2 when it starts with * \ etc.)
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
    try {
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text: message,
      };
      if (useParseMode) {
        payload.parse_mode = this.parseMode;
      }
      const response = await axios.post(`${this.telegramApiUrl}/sendMessage`, payload);

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

  private L(key: string): string {
    return LABELS[this.language]?.[key] ?? LABELS['en'][key] ?? key;
  }

  private statusText(status: string): string {
    if (status === 'success') return this.L('successStatus');
    if (status === 'failure') return this.L('failureStatus');
    return this.L('warningStatus');
  }

  private runSourceText(source?: string): string {
    if (source === 'telegram_bot') return this.L('sourceTelegramBot');
    if (source === 'scheduler') return this.L('sourceScheduler');
    return this.L('sourceManual');
  }

  /**
   * Split long messages into chunks within Telegram-safe size.
   * Prefer split points at newline, sentence boundary, then whitespace.
   * Avoids splitting in the middle of MarkdownV2 escapes (\) or UTF-16 surrogate pairs.
   */
  private splitMessageForTelegram(message: string, maxLen: number): string[] {
    const text = String(message || '');
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLen) {
      let splitAt = this.findBestSplitPoint(remaining, maxLen);
      if (splitAt <= 0 || splitAt > remaining.length) {
        splitAt = Math.min(maxLen, remaining.length);
      }
      splitAt = this.adjustSplitForSafeBoundary(remaining, splitAt);

      const chunk = remaining.slice(0, splitAt).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      remaining = remaining.slice(splitAt).trim();
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  /**
   * Ensure we don't split in the middle of a MarkdownV2 escape (backslash + char)
   * or in the middle of a UTF-16 surrogate pair (emoji).
   */
  private adjustSplitForSafeBoundary(text: string, splitAt: number): number {
    if (splitAt <= 0 || splitAt >= text.length) return splitAt;
    let pos = splitAt;
    // Don't end chunk with a single backslash (would break MarkdownV2 escape in Telegram).
    while (pos > 0 && text[pos - 1] === '\\') {
      pos--;
    }
    // Don't split in the middle of a surrogate pair (low surrogate is 0xD800-0xDBFF, high is 0xDC00-0xDFFF).
    const atPos = text.charCodeAt(pos);
    if (pos < text.length && atPos >= 0xDC00 && atPos <= 0xDFFF && pos > 0) {
      pos--;
    }
    return Math.max(1, pos);
  }

  private findBestSplitPoint(text: string, maxLen: number): number {
    const safeMax = Math.min(maxLen, text.length);
    const candidate = text.slice(0, safeMax + 1);

    // Prefer newline boundaries.
    const newline = candidate.lastIndexOf('\n');
    if (newline >= Math.floor(safeMax * 0.6)) {
      return newline + 1;
    }

    // Prefer sentence boundaries.
    for (let i = safeMax; i >= Math.floor(safeMax * 0.6); i--) {
      const c = candidate[i];
      if (!c) continue;
      if (c === '.' || c === '!' || c === '?' || c === '…' || c === ';') {
        return i + 1;
      }
    }

    // Fallback to whitespace boundary.
    const ws = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\t'));
    if (ws >= Math.floor(safeMax * 0.6)) {
      return ws + 1;
    }

    // Last resort: hard split (adjustSplitForSafeBoundary will fix escape/surrogate).
    return safeMax;
  }

  /**
   * Format payload as Telegram MarkdownV2 message
   */
  private formatMessage(payload: NotificationPayload): string {
    const statusLine = `${this.statusText(payload.status)}`;
    const title = `*${escMDV2(this.L('scrapeNotification'))} \\- ${escMDV2(statusLine)}*`;
    const durationStr = `${(payload.summary.durationMs / 1000).toFixed(2)}${this.L('seconds')}`;
    const sourceStr = this.runSourceText(payload.runSource);

    switch (payload.detailLevel) {
      case 'minimal':
        return `${title}\n*${escMDV2(this.L('source'))}:* ${escMDV2(sourceStr)}\n⏱ ${escMDV2(durationStr)}`;

      case 'normal': {
        const lines: string[] = [title];
        lines.push(`*${escMDV2(this.L('profile'))}:* \`${escMDV2(payload.pipelineId)}\``);
        lines.push(`*${escMDV2(this.L('source'))}:* ${escMDV2(sourceStr)}`);
        lines.push(`*${escMDV2(this.L('duration'))}:* ${escMDV2(durationStr)}`);
        if (payload.summary.transactionCount != null) {
          lines.push(`*${escMDV2(this.L('transactions'))}:* ${escMDV2(String(payload.summary.transactionCount))}`);
        }
        if (payload.summary.failedStage) {
          lines.push(`*${escMDV2(this.L('failed'))}:* ${escMDV2(payload.summary.failedStage)}`);
        }
        if (payload.summary.insights?.length) {
          lines.push(`*${escMDV2(this.L('insights'))}:*`);
          payload.summary.insights.forEach(i => lines.push(`• ${escMDV2(i)}`));
        }
        if (payload.errorDetails?.message) {
          lines.push(`*${escMDV2(this.L('error'))}:* ${escMDV2(payload.errorDetails.message)}`);
        }
        return lines.join('\n');
      }

      case 'detailed': {
        const lines: string[] = [title];
        lines.push(`*${escMDV2(this.L('profile'))}:* \`${escMDV2(payload.pipelineId)}\``);
        lines.push(`*${escMDV2(this.L('source'))}:* ${escMDV2(sourceStr)}`);
        lines.push(`*${escMDV2(this.L('timestamp'))}:* ${escMDV2(payload.timestamp.toISOString())}`);
        lines.push(`*${escMDV2(this.L('duration'))}:* ${escMDV2(durationStr)}`);
        if (payload.summary.stagesRun.length) {
          lines.push(`*${escMDV2(this.L('stages'))}:* ${escMDV2(payload.summary.stagesRun.join(' → '))}`);
        }
        if (payload.summary.successfulStages.length) {
          lines.push(`*${escMDV2(this.L('successful'))}:* ${escMDV2(payload.summary.successfulStages.join(', '))}`);
        }
        if (payload.summary.failedStage) {
          lines.push(`*${escMDV2(this.L('failed'))}:* ${escMDV2(payload.summary.failedStage)}`);
        }
        if (payload.summary.transactionCount != null) {
          lines.push(`*${escMDV2(this.L('transactions'))}:* ${escMDV2(String(payload.summary.transactionCount))}`);
        }
        if (payload.summary.accounts != null) {
          lines.push(`*${escMDV2(this.L('accounts'))}:* ${escMDV2(String(payload.summary.accounts))}`);
        }
        if (payload.summary.insights?.length) {
          lines.push(`*${escMDV2(this.L('insights'))}:*`);
          payload.summary.insights.forEach(i => lines.push(`• ${escMDV2(i)}`));
        }
        if (payload.errorDetails?.message) {
          lines.push(`*${escMDV2(this.L('error'))}:* ${escMDV2(payload.errorDetails.message)}`);
        }
        return lines.join('\n');
      }

      case 'verbose':
        return `\`\`\`\n${JSON.stringify(payload, null, 2).substring(0, 3900)}\n\`\`\``;

      default:
        return this.formatMessage({ ...payload, detailLevel: 'normal' });
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
