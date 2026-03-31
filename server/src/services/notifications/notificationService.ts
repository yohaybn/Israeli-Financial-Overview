/**
 * Notification Service
 * Orchestrates multiple notification channels
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { BaseNotifier } from './baseNotifier.js';
import { ConsoleNotifier } from './consoleNotifier.js';
import {
  NotificationPayload,
  NotificationServiceConfig,
  DEFAULT_NOTIFICATION_CONFIG,
  NotifierResult,
} from './types.js';
import { serviceLogger as logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../../data');
const NOTIFICATION_CONFIG_PATH = path.join(DATA_DIR, 'notification_config.json');

export class NotificationService {
  private config: NotificationServiceConfig;
  private notifiers: Map<string, BaseNotifier>;

  constructor() {
    this.notifiers = new Map();
    this.config = this.loadConfig();
    this.initializeDefaultNotifiers();
  }

  /**
   * Load configuration from file or use defaults
   */
  private loadConfig(): NotificationServiceConfig {
    try {
      if (fs.existsSync(NOTIFICATION_CONFIG_PATH)) {
        const loadedConfig = JSON.parse(
          fs.readFileSync(NOTIFICATION_CONFIG_PATH, 'utf-8')
        );
        return { ...DEFAULT_NOTIFICATION_CONFIG, ...loadedConfig };
      }
    } catch (error) {
      logger.error('Failed to load notification config, using defaults', {
        error,
      });
    }
    return { ...DEFAULT_NOTIFICATION_CONFIG };
  }

  /**
   * Save configuration to file
   */
  private saveConfig(): void {
    try {
      fs.ensureDirSync(DATA_DIR);
      fs.writeFileSync(
        NOTIFICATION_CONFIG_PATH,
        JSON.stringify(this.config, null, 2)
      );
      logger.debug('Notification config saved');
    } catch (error) {
      logger.error('Failed to save notification config', { error });
    }
  }

  /**
   * Initialize default notifiers (console, etc.)
   */
  private initializeDefaultNotifiers(): void {
    // Always register console notifier
    this.registerNotifier('console', new ConsoleNotifier());
    logger.info('Notification service initialized with default notifiers');
  }

  /**
   * Register a custom notifier
   */
  registerNotifier(channelName: string, notifier: BaseNotifier): void {
    const channelConfig = (this.config.channels as any)[channelName] || {};
    if (!notifier.validate(channelConfig)) {
      logger.warn(
        `Notifier validation failed for channel: ${channelName}, skipping registration`
      );
      return;
    }

    this.notifiers.set(channelName, notifier);
    logger.info(`Notifier registered for channel: ${channelName}`);
  }

  /**
   * Get a specific notifier by channel name
   */
  getNotifier(channelName: string): BaseNotifier | undefined {
    return this.notifiers.get(channelName);
  }

  /**
   * Get available notification channels
   */
  getAvailableChannels(): string[] {
    return Array.from(this.notifiers.keys());
  }

  /**
   * Send notification through specified channels
   */
  async notify(
    channels: string[],
    payload: NotificationPayload
  ): Promise<NotifierResult[]> {
    if (channels.length === 0) {
      logger.warn('No notification channels specified');
      return [];
    }

    const results: NotifierResult[] = [];
    const retryPolicy = this.config.retryPolicy;

    for (const channelName of channels) {
      const notifier = this.notifiers.get(channelName);

      if (!notifier) {
        logger.warn(
          `Notifier not found for channel: ${channelName}, skipping`
        );
        results.push({
          channelName,
          success: false,
          error: `Notifier not found for channel: ${channelName}`,
          sentAt: new Date(),
        });
        continue;
      }

      if (!notifier.isEnabled()) {
        logger.debug(`Channel ${channelName} is disabled, skipping`);
        results.push({
          channelName,
          success: false,
          error: 'Channel is disabled',
          sentAt: new Date(),
        });
        continue;
      }

      // Attempt to send with retry logic
      let lastError: Error | undefined;
      const maxRetries = retryPolicy?.maxRetries || 3;
      let delayMs = retryPolicy?.delayMs || 1000;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await notifier.send(payload);
          results.push({
            channelName,
            success: true,
            sentAt: new Date(),
          });
          logger.debug(
            `Notification sent successfully to ${channelName} (attempt ${attempt})`
          );
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as Error;
          logger.warn(
            `Notification send failed for ${channelName} (attempt ${attempt}/${maxRetries}): ${(error as Error).message}`
          );

          if (attempt < maxRetries) {
            await this.delay(delayMs);
            // Exponential backoff
            delayMs *= retryPolicy?.backoffMultiplier || 2;
          }
        }
      }

      if (lastError) {
        results.push({
          channelName,
          success: false,
          error: lastError.message,
          sentAt: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Send notification to all enabled channels
   */
  async notifyAll(payload: NotificationPayload): Promise<NotifierResult[]> {
    const enabledChannels = Array.from(this.notifiers.keys()).filter(
      (channel) => {
        const notifier = this.notifiers.get(channel);
        return notifier?.isEnabled();
      }
    );

    return this.notify(enabledChannels, payload);
  }

  /**
   * Update service configuration
   */
  updateConfig(newConfig: Partial<NotificationServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    logger.info('Notification config updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): NotificationServiceConfig {
    return { ...this.config };
  }

  /** After maintenance factory reset: notification config file may be gone; reload defaults into memory. */
  reloadConfigAfterFactoryReset(): void {
    this.config = this.loadConfig();
  }

  /**
   * Helper to delay execution (for retries)
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
