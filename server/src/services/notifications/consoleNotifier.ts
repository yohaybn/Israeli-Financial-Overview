/**
 * Console Notifier Implementation
 * Sends notifications to console output
 */

import { BaseNotifier } from './baseNotifier';
import { NotificationPayload } from './types';

export class ConsoleNotifier extends BaseNotifier {
  constructor(config: any = {}) {
    super('console', { enabled: true, ...config });
  }

  async send(payload: NotificationPayload): Promise<void> {
    try {
      const formattedMessage = this.formatPayload(payload);
      const timestamp = new Date().toISOString();

      // Use different console methods based on status
      if (payload.status === 'success') {
        console.log(`\n✅ [${timestamp}] ${formattedMessage}\n`);
      } else {
        console.error(`\n❌ [${timestamp}] ${formattedMessage}\n`);
      }
    } catch (error) {
      this.onError(error as Error, payload);
      throw error;
    }
  }

  /**
   * Override formatPayload for console-specific formatting with colors
   */
  protected formatPayload(payload: NotificationPayload): string {
    const base = super.formatPayload(payload);
    // Console doesn't need special formatting, but we could add ANSI codes here if needed
    return base;
  }

  validate(): boolean {
    // Console notifier has minimal requirements
    return true;
  }
}
