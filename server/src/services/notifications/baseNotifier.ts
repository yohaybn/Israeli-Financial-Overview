/**
 * Abstract Base Notifier
 * Defines the interface all notification channels must implement
 */

import { NotificationPayload, NotifierConfig, NotifierResult } from './types.js';

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
    switch (payload.detailLevel) {
      case 'minimal':
        return `[${payload.status.toUpperCase()}] Pipeline ${payload.pipelineId} completed in ${payload.summary.durationMs}ms`;

      case 'normal':
        return [
          `Pipeline Notification - ${payload.status.toUpperCase()}`,
          `ID: ${payload.pipelineId}`,
          `Duration: ${payload.summary.durationMs}ms`,
          `Stages: ${payload.summary.stagesRun.join(' -> ')}`,
          `Successful: ${payload.summary.successfulStages.join(', ')}`,
          payload.summary.failedStage
            ? `Failed: ${payload.summary.failedStage}`
            : '',
          payload.summary.transactionCount
            ? `Transactions: ${payload.summary.transactionCount}`
            : '',
          payload.summary.insights?.length
            ? `Insights: ${payload.summary.insights.join('; ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');

      case 'detailed':
        return [
          `Pipeline Notification - ${payload.status.toUpperCase()}`,
          `ID: ${payload.pipelineId}`,
          `Timestamp: ${payload.timestamp.toISOString()}`,
          `Duration: ${payload.summary.durationMs}ms`,
          `Stages Run: ${payload.summary.stagesRun.join(' -> ')}`,
          `Successful Stages: ${payload.summary.successfulStages.join(', ')}`,
          payload.summary.failedStage
            ? `Failed Stage: ${payload.summary.failedStage}`
            : '',
          `Summary:`,
          `  Transactions: ${payload.summary.transactionCount || 0}`,
          `  Accounts: ${payload.summary.accounts || 0}`,
          `  Balance: ${payload.summary.balance || 0}`,
          payload.summary.insights?.length
            ? `Insights:\n  ${payload.summary.insights.join('\n  ')}`
            : '',
          payload.errorDetails
            ? `Error Details:\n  Stage: ${payload.errorDetails.stage}\n  Message: ${payload.errorDetails.message}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');

      case 'verbose':
        return JSON.stringify(payload, null, 2);

      default:
        return this.formatPayload({ ...payload, detailLevel: 'normal' });
    }
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
