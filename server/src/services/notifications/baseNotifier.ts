/**
 * Abstract Base Notifier
 * Defines the interface all notification channels must implement
 */

import { NotificationPayload, NotifierConfig } from './types.js';
import { toPlainText } from './formatter.js';

export abstract class BaseNotifier {
  protected channelName: string;
  protected config: NotifierConfig;

  constructor(channelName: string, config: NotifierConfig) {
    this.channelName = channelName;
    this.config = config;
  }

  /**
   * Send notification through this channel
   * Must be implemented by concrete notifiers
   */
  abstract send(payload: NotificationPayload): Promise<void>;

  /**
   * Validate configuration for this notifier
   * Override in concrete classes for channel-specific validation
   */
  validate(config: NotifierConfig): boolean {
    if (!config) {
      return false;
    }
    // Base validation: check if enabled
    return config.enabled === true || config.enabled === undefined;
  }

  /**
   * Handle errors during notification
   * Override in concrete classes for custom error handling
   */
  protected onError(error: Error, payload: NotificationPayload): void {
    console.error(
      `[${this.channelName}] Notification failed for pipeline ${payload.pipelineId}:`,
      error.message
    );
  }

  /**
   * Format payload based on detail level
   * Override in concrete classes for channel-specific formatting
   */
  protected formatPayload(payload: NotificationPayload): string {
    return toPlainText(payload);
  }

  /**
   * Get channel name
   */
  getChannelName(): string {
    return this.channelName;
  }

  /**
   * Check if notifier is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled !== false;
  }
}
